ALTER TABLE public.protocolos
  ADD COLUMN IF NOT EXISTS onedoc_situacao text,
  ADD COLUMN IF NOT EXISTS onedoc_baixado_em timestamptz,
  ADD COLUMN IF NOT EXISTS onedoc_arquivado_em timestamptz,
  ADD COLUMN IF NOT EXISTS onedoc_verificado_em timestamptz;

CREATE TABLE IF NOT EXISTS public.onedoc_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  url_login text,
  usuario text,
  senha_cifrada text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onedoc_config TO authenticated;
GRANT ALL ON public.onedoc_config TO service_role;
ALTER TABLE public.onedoc_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins gerenciam onedoc_config" ON public.onedoc_config;
CREATE POLICY "Admins gerenciam onedoc_config" ON public.onedoc_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.onedoc_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'unitario',
  protocolo_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pendente',
  total integer NOT NULL DEFAULT 0,
  processados integer NOT NULL DEFAULT 0,
  atualizados integer NOT NULL DEFAULT 0,
  erros integer NOT NULL DEFAULT 0,
  mensagem text,
  resultados jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  iniciado_em timestamptz,
  finalizado_em timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onedoc_jobs TO authenticated;
GRANT ALL ON public.onedoc_jobs TO service_role;
ALTER TABLE public.onedoc_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins gerenciam onedoc_jobs" ON public.onedoc_jobs;
CREATE POLICY "Admins gerenciam onedoc_jobs" ON public.onedoc_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS onedoc_jobs_status_idx ON public.onedoc_jobs (status, created_at);