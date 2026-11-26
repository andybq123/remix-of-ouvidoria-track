-- 0041_backup_automatico.sql
--
-- Rotina de backup automático: configuração (destinos, intervalo, retenção),
-- histórico de execuções e registro do alerta semanal aos administradores.
--
-- Destinos (todos opcionais, combináveis; ao menos um quando habilitado):
--   VPS (pasta local), Google Drive (conta de serviço) e S3 compatível
--   (Backblaze B2, Wasabi, MinIO...). O conteúdo é o dump completo do
--   banco (pg_dump) + .env.local, num .zip por execução.
--
-- O agendamento roda no host (timer systemd a cada 15 min, que só
-- executa quando o backup está vencido ou foi solicitado); o painel
-- apenas grava a configuração aqui. As credenciais (service account do
-- Drive, chave secreta do S3) ficam nesta tabela, sem leitura para
-- anon/authenticated — só server functions (service_role) leem e o
-- runner do host (psql como postgres/supabase_admin) lê.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- DROP POLICY IF EXISTS. Em base nova, cria vazio; o painel mostra
-- "nunca configurado" até o admin salvar a primeira configuração.
--

CREATE TABLE IF NOT EXISTS public.backup_config (
  id boolean PRIMARY KEY DEFAULT true,
  habilitado boolean NOT NULL DEFAULT false,
  intervalo_horas integer NOT NULL DEFAULT 24,
  manter_copias integer NOT NULL DEFAULT 7,
  solicitar_agora timestamptz,
  destino_vps boolean NOT NULL DEFAULT true,
  vps_pasta text NOT NULL DEFAULT 'backups',
  destino_drive boolean NOT NULL DEFAULT false,
  drive_pasta_url text,
  drive_sa_json jsonb,
  drive_sa_email text,
  destino_s3 boolean NOT NULL DEFAULT false,
  s3_endpoint text,
  s3_bucket text,
  s3_regiao text,
  s3_prefixo text NOT NULL DEFAULT 'ouvidesk-backups/',
  s3_access_key text,
  s3_secret_key text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT backup_config_uma_linha CHECK (id = true),
  CONSTRAINT backup_config_intervalo CHECK (intervalo_horas IN (6, 12, 24, 168)),
  CONSTRAINT backup_config_manter CHECK (manter_copias >= 1 AND manter_copias <= 90),
  CONSTRAINT backup_config_ao_menos_um_destino CHECK (
    NOT habilitado OR destino_vps OR destino_drive OR destino_s3
  )
);

CREATE TABLE IF NOT EXISTS public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  status text NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'ok', 'erro')),
  arquivo text,
  tamanho_bytes bigint,
  destinos text[] NOT NULL DEFAULT '{}',
  erro text,
  solicitado_por uuid
);
CREATE INDEX IF NOT EXISTS backup_runs_iniciado_idx ON public.backup_runs (iniciado_em DESC);

-- Última vez que o alerta semanal foi exibido para cada admin. O alerta
-- só volta a aparecer 7 dias depois do último registro aqui.
CREATE TABLE IF NOT EXISTS public.backup_alertas (
  admin_id uuid PRIMARY KEY,
  ultimo_alerta_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT backup_alertas_admin_fk FOREIGN KEY (admin_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

-- Acesso: só service_role (server functions e runner do host). Sem
-- política para anon/authenticated: a leitura é negada por padrão.
ALTER TABLE public.backup_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_alertas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.backup_config FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.backup_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.backup_alertas FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.backup_config TO service_role;
GRANT ALL ON TABLE public.backup_runs TO service_role;
GRANT ALL ON TABLE public.backup_alertas TO service_role;

-- O bloqueio por licença (trigger genérico) precisa ser reaplicado
-- depois de criar tabelas, senão as novas ficam fora do bloqueio.
SELECT public.aplicar_bloqueio_licenca();
