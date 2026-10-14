-- Campo de ícone escolhido pelo usuário para o marcador da secretaria no mapa.
-- Idempotente: não altera dados existentes.
BEGIN;

ALTER TABLE public.secretarias
  ADD COLUMN IF NOT EXISTS icone text;

COMMENT ON COLUMN public.secretarias.icone IS
  'Ícone do marcador no mapa: chave do catálogo (ex.: saude, obras) ou um único emoji; nulo = automático pelo setor.';

COMMIT;
