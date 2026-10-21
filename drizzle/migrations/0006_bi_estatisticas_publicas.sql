create or replace function public.bi_estatisticas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.status, p.tipo, p.secretaria_id, p.local_id,
           date_trunc('month', p.data_abertura::timestamptz) as mes
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
                  left join public.locais l on l.id = x.local_id)
  );
$$;

revoke all on function public.bi_estatisticas() from public;
grant execute on function public.bi_estatisticas() to anon, authenticated, service_role;