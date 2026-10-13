-- Simula o modo usado pela RPC backup_importar; não altera permissões dessa RPC.
BEGIN;
SELECT set_config('app.importando', 'on', true);
INSERT INTO public.protocolos (numero,numero_esic,tipo,categoria,triagem_pendente,prorrogado)
VALUES ('3001/2026','026/2026','esic','pedido_informacao',false,true);
UPDATE public.protocolos SET numero_esic = '027/2026' WHERE numero = '3001/2026';
DO $$ BEGIN
  ASSERT (SELECT NOT triagem_pendente AND prorrogado AND esic_prorrogacao_justificativa IS NULL FROM public.protocolos WHERE numero = '3001/2026'), 'Importação alterou dados do backup';
  ASSERT NOT EXISTS(SELECT 1 FROM public.protocolo_historico WHERE campo = 'numero_esic'), 'Importação gerou auditoria duplicada';
END $$;
COMMIT;
INSERT INTO public.protocolos (numero,numero_esic,tipo,categoria,triagem_pendente)
VALUES ('3002/2026','028/2026','esic','reclamacao',false);
DO $$ BEGIN
  ASSERT (SELECT triagem_pendente AND categoria = 'pedido_informacao' FROM public.protocolos WHERE numero = '3002/2026'), 'Cadastro normal contornou as regras';
END $$;
