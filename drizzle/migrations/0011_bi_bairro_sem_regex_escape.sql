create or replace function public.bi_estatisticas(p_mes text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.status, p.tipo, p.categoria, p.secretaria_id, p.local_id,
           p.prorrogado, p.data_abertura, p.latitude, p.longitude,
           date_trunc('month', p.data_abertura::timestamptz) as mes,
           coalesce(
             -- formato da busca no mapa: "Rua, numero - Bairro - Brusque"
             case
               when p.endereco is not null
                 and array_length(string_to_array(p.endereco, ' - '), 1) >= 3
                 and split_part(p.endereco, ' - ', 3) ~ '^[A-Za-zÀ-ÿ'' ]+$'
               then nullif(trim(split_part(p.endereco, ' - ', 2)), '')
             end,
             -- formato completo do Nominatim/1Doc: "Rua, numero, Bairro, Brusque, ..."
             case
               when p.endereco ilike '%brusque%' then (
                 select nullif(trim(cand.parte), '')
                 from unnest(string_to_array(p.endereco, ',')) with ordinality as cand(parte, ord)
                 where trim(cand.parte) ~ '^[A-Za-zÀ-ÿ'' ]+$'
                   and trim(cand.parte) !~* '^(r[.]?|rua|av[.]?|avenida|rod[.]?|rodovia|estr[.]?|estrada|trav[.]?|travessa|praca|pca|al[.]?|alameda)( .*)?$'
                   and exists (
                     select 1
                     from unnest(string_to_array(p.endereco, ',')) with ordinality as prox(parte, ord)
                     where prox.ord = cand.ord + 1
                       and (lower(trim(prox.parte)) = 'brusque' or lower(trim(prox.parte)) like 'brusque %')
                   )
                 order by cand.ord desc
                 limit 1
               )
             end
           ) as bairro
    from public.protocolos p
  ),
  calc as (
    select b.*,
      (b.status <> 'concluido'
        and b.data_abertura + (case when b.tipo = 'ouvidoria'
            then 30 + case when b.prorrogado then 30 else 0 end
            else 20 + case when b.prorrogado then 10 else 0 end end) < current_date) as atrasada
    from base b
    where p_mes is null or to_char(b.mes, 'YYYY-MM') = p_mes
  ),
  sec_obras as (
    select id from public.secretarias where nome ilike '%obras%' order by created_at limit 1
  ),
  sec_saude as (
    select id from public.secretarias where nome ilike '%saúde%' or nome ilike '%saude%' order by created_at limit 1
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'mes_selecionado', p_mes,
    'totais', (select jsonb_build_object(
        'total', count(*),
        'abertas', count(*) filter (where status = 'aberto'),
        'em_andamento', count(*) filter (where status = 'em_andamento'),
        'concluidas', count(*) filter (where status = 'concluido'),
        'atrasadas', count(*) filter (where atrasada)
      ) from calc),
    'por_status', (select coalesce(jsonb_agg(jsonb_build_object('status', status, 'total', n) order by n desc), '[]'::jsonb)
                   from (select status, count(*) as n from calc group by status) s),
    'por_tipo', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'total', n) order by n desc), '[]'::jsonb)
                 from (select tipo, count(*) as n from calc group by tipo) t),
    'por_secretaria', (select coalesce(jsonb_agg(jsonb_build_object('nome', coalesce(sec.nome, 'Sem secretaria'), 'sigla', sec.sigla, 'total', n, 'concluidas', c, 'reclamacoes', r) order by n desc), '[]'::jsonb)
                       from (select secretaria_id, count(*) as n,
                                    count(*) filter (where status = 'concluido') as c,
                                    count(*) filter (where categoria = 'reclamacao') as r
                             from calc group by secretaria_id) x
                       left join public.secretarias sec on sec.id = x.secretaria_id),
    'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(mes, 'YYYY-MM'), 'total', n, 'concluidas', c) order by mes), '[]'::jsonb)
                from (select mes, count(*) as n, count(*) filter (where status = 'concluido') as c from base where mes >= date_trunc('month', now()) - interval '11 months' group by mes) m),
    'por_local', (select coalesce(jsonb_agg(jsonb_build_object('nome', coalesce(l.nome, 'Local nao informado'), 'total', n) order by n desc), '[]'::jsonb)
                  from (select local_id, count(*) as n from calc group by local_id order by count(*) desc limit 12) x
                  left join public.locais l on l.id = x.local_id),
    'por_bairro', (select coalesce(jsonb_agg(jsonb_build_object('nome', bairro, 'total', n) order by n desc), '[]'::jsonb)
                   from (select bairro, count(*) as n from calc where bairro is not null group by bairro order by count(*) desc limit 12) b),
    'sem_bairro', (select count(*) from calc where bairro is null),
    'por_mes_bairro', (with mb as (
                         select to_char(mes, 'YYYY-MM') as mes, bairro, count(*) as n
                         from base
                         where mes >= date_trunc('month', now()) - interval '5 months'
                           and bairro is not null
                         group by mes, bairro
                       ), top as (
                         select bairro from mb group by bairro order by sum(n) desc limit 6
                       )
                       select coalesce(jsonb_agg(jsonb_build_object('mes', mb.mes, 'bairro', mb.bairro, 'total', mb.n) order by mb.mes, mb.n desc), '[]'::jsonb)
                       from mb where mb.bairro in (select bairro from top)),
    'obras_por_bairro', (select coalesce(jsonb_agg(jsonb_build_object(
                           'bairro', o.bairro, 'total', o.n, 'atrasadas', o.a, 'lat', o.lat, 'lng', o.lng) order by o.n desc), '[]'::jsonb)
                         from (
                           select c.bairro, count(*) as n,
                                  count(*) filter (where c.atrasada) as a,
                                  avg(c.latitude) as lat, avg(c.longitude) as lng
                           from calc c
                           where c.bairro is not null
                             and c.secretaria_id = (select id from sec_obras)
                           group by c.bairro
                         ) o),
    'obras_sem_bairro', (select count(*) from calc where bairro is null and secretaria_id = (select id from sec_obras)),
    'saude_locais', (select coalesce(jsonb_agg(jsonb_build_object(
                      'nome', l.nome, 'total', x.n, 'atrasadas', x.a, 'lat', l.latitude, 'lng', l.longitude) order by x.n desc), '[]'::jsonb)
                     from (
                       select c.local_id, count(*) as n, count(*) filter (where c.atrasada) as a
                       from calc c
                       where c.local_id is not null
                         and c.secretaria_id = (select id from sec_saude)
                       group by c.local_id
                     ) x
                     join public.locais l on l.id = x.local_id
                     where l.latitude is not null and l.longitude is not null),
    'saude_sem_ponto', (select count(*) from calc where secretaria_id = (select id from sec_saude) and local_id is null)
  );
$$;

revoke all on function public.bi_estatisticas(text) from public;
grant execute on function public.bi_estatisticas(text) to anon, authenticated, service_role;