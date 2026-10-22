create table public.atualizacao_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pendente' check (status in ('pendente','rodando','concluido','erro')),
  etapa integer not null default 0,
  etapas_total integer not null default 5,
  mensagem text,
  log text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert on public.atualizacao_jobs to authenticated;
grant all on public.atualizacao_jobs to service_role;

alter table public.atualizacao_jobs enable row level security;

create policy "admin le atualizacoes"
  on public.atualizacao_jobs for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "admin agenda atualizacao"
  on public.atualizacao_jobs for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));