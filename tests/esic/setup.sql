-- SOMENTE banco descartável criado pelo run.sh. Sem dados reais.
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE TYPE public.protocolo_tipo AS ENUM ('ouvidoria', 'lai', 'esic');
CREATE TYPE public.protocolo_categoria AS ENUM ('elogio', 'reclamacao', 'pedido_informacao', 'denuncia', 'solicitacao', 'outros', 'sugestao');
CREATE TYPE public.protocolo_status AS ENUM ('aberto', 'em_andamento', 'concluido');
CREATE TABLE public.profiles (id uuid PRIMARY KEY, nome text);
CREATE TABLE public.assuntos (nome text, ativo boolean DEFAULT true, forcar_triagem boolean DEFAULT false);
CREATE TABLE public.protocolos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero text NOT NULL UNIQUE,
  tipo public.protocolo_tipo NOT NULL DEFAULT 'ouvidoria',
  categoria public.protocolo_categoria NOT NULL DEFAULT 'solicitacao',
  status public.protocolo_status NOT NULL DEFAULT 'aberto',
  assunto text, descricao text, solicitante text, secretaria_id uuid, local_id uuid,
  data_abertura date DEFAULT current_date, data_conclusao date, data_prorrogacao date,
  prorrogado boolean NOT NULL DEFAULT false, triagem_pendente boolean NOT NULL DEFAULT false,
  triagem_concluida_em timestamptz, triagem_concluida_por uuid
);
CREATE TABLE public.protocolo_historico (
  protocolo_id uuid, campo text, valor_anterior text, valor_novo text,
  acao text, autor_id uuid, autor_nome text
);
-- Legados não devem perder número, categoria ou estado de triagem no backfill.
INSERT INTO public.protocolos (numero, tipo, triagem_pendente) VALUES ('005/2026', 'esic', false);
-- Duplicatas legadas são preservadas para revisão, nunca removidas pela migration.
INSERT INTO public.protocolos (numero, tipo) VALUES ('007/2026', 'esic'), ('7/2026', 'esic');
