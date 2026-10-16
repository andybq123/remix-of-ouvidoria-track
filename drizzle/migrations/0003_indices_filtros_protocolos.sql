CREATE INDEX IF NOT EXISTS idx_protocolos_secretaria_status_data ON public.protocolos (secretaria_id, status, data_abertura DESC);
CREATE INDEX IF NOT EXISTS idx_protocolos_tipo_status_data ON public.protocolos (tipo, status, data_abertura DESC);
CREATE INDEX IF NOT EXISTS idx_protocolos_data_abertura_desc ON public.protocolos (data_abertura DESC);
CREATE INDEX IF NOT EXISTS idx_protocolos_created_at ON public.protocolos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_protocolos_numero_esic ON public.protocolos (numero_esic) WHERE numero_esic IS NOT NULL;