CREATE UNIQUE INDEX IF NOT EXISTS protocolos_numero_ouvidoria_key ON public.protocolos (numero) WHERE tipo <> 'esic';
CREATE UNIQUE INDEX IF NOT EXISTS protocolos_numero_esic_key ON public.protocolos (numero) WHERE tipo = 'esic';
CREATE UNIQUE INDEX IF NOT EXISTS protocolos_numero_norm_ouvidoria_key ON public.protocolos (regexp_replace(numero, '[^0-9/]', '', 'g')) WHERE tipo <> 'esic';
CREATE UNIQUE INDEX IF NOT EXISTS protocolos_numero_norm_esic_key ON public.protocolos (regexp_replace(numero, '[^0-9/]', '', 'g')) WHERE tipo = 'esic';
ALTER TABLE public.protocolos DROP CONSTRAINT IF EXISTS protocolos_numero_key;
DROP INDEX IF EXISTS public.protocolos_numero_key;
DROP INDEX IF EXISTS public.protocolos_numero_normalizado_key;