create or replace function public.bi_estatisticas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.status, p.tipo, p.secretaria_id, p.local_id,
           date_trunc('month', p.data_abertura::timestamptz) as mes,
           case
             when p.endereco is not null
               and array_length(string_to_array(p.endereco, ' - '), 1) >= 3
               and split_part(p.endereco, ' - ', 3) ~ '^[A-Za-zÀ-ÿ'' ]+$'
             then nullif(trim(split_part(p.endereco, ' - ', 2)), '')
           end as bairro
    from public.protocolos p
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'totais', (select jsonb_build_object(
        'total', count(*),
        'abertas', count(*) filter (where status = 'aberto'),
        'em_andamento', count(*) filter (where status = 'em_andamento'),
        'concluidas', count(*) filter (where status = 'concluido')
      ) from base),
    'por_status', (select coalesce(jsonb_agg(jsonb_build_object('status', status, 'total', n) order by n desc), '[]'::jsonb)
                   from (select status, count(*) as n from base group by status) s),
    'por_tipo', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'total', n) order by n desc), '[]'::jsonb)
                 from (select tipo, count(*) as n from base group by tipo) t),
    'por_secretaria', (select coalesce(jsonb_agg(jsonb_build_object('nome', coalesce(sec.nome, 'Sem secretaria'), 'sigla', sec.sigla, 'total', n, 'concluidas', c) order by n desc), '[]'::jsonb)
                       from (select secretaria_id, count(*) as n, count(*) filter (where status = 'concluido') as c from base group by secretaria_id) x
                       left join public.secretarias sec on sec.id = x.secretaria_id),
    'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(mes, 'YYYY-MM'), 'total', n, 'concluidas', c) order by mes), '[]'::jsonb)
                from (select mes, count(*) as n, count(*) filter (where status = 'concluido') as c from base where mes >= date_trunc('month', now()) - interval '11 months' group by mes) m),
    'por_local', (select coalesce(jsonb_agg(jsonb_build_object('nome', coalesce(l.nome, 'Local nao informado'), 'total', n) order by n desc), '[]'::jsonb)
                  from (select local_id, count(*) as n from base group by local_id order by count(*) desc limit 12) x
                  left join public.locais l on l.id = x.local_id),
    'por_bairro', (select coalesce(jsonb_agg(jsonb_build_object('nome', bairro, 'total', n) order by n desc), '[]'::jsonb)
                   from (select bairro, count(*) as n from base where bairro is not null group by bairro order by count(*) desc limit 12) b),
    'sem_bairro', (select count(*) from base where bairro is null),
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
                       from mb where mb.bairro in (select bairro from top))
  );
$$;

revoke all on function public.bi_estatisticas() from public;
grant execute on function public.bi_estatisticas() to anon, authenticated, service_role;