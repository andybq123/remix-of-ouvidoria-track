INSERT INTO public.protocolos (numero, numero_esic, tipo) VALUES ('9991/2026', '092/2026', 'esic');
DO $$ DECLARE pedido public.protocolos; BEGIN
  SELECT * INTO pedido FROM public.protocolos WHERE numero_esic = '0.092/2026';
  ASSERT pedido.numero = '0.092/2026', 'Número interno diferente do e-SIC';
  UPDATE public.protocolos SET numero_esic = '093/2026' WHERE id = pedido.id;
  ASSERT (SELECT numero = '0.093/2026' AND numero_esic = '0.093/2026' FROM public.protocolos WHERE id = pedido.id), 'Edição não sincronizou os números';
  UPDATE public.protocolos SET numero = '9992/2026' WHERE id = pedido.id;
  ASSERT (SELECT numero = '0.093/2026' FROM public.protocolos WHERE id = pedido.id), 'Número interno pode divergir';
  ASSERT EXISTS (SELECT 1 FROM public.protocolo_historico WHERE protocolo_id = pedido.id AND campo = 'numero' AND valor_novo = '0.093/2026'), 'Número corrigido sem auditoria';
END $$;
INSERT INTO public.protocolos (numero, tipo) VALUES ('0.094/2026', 'ouvidoria');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.protocolos (numero, numero_esic, tipo) VALUES ('9993/2026', '094/2026', 'esic');
    RAISE EXCEPTION 'Conflito com Ouvidoria foi aceito';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  ASSERT (SELECT tipo = 'ouvidoria' FROM public.protocolos WHERE numero = '0.094/2026'), 'Ouvidoria alterada';
  ASSERT (SELECT numero = numero_esic AND NOT triagem_pendente AND prorrogado FROM public.protocolos WHERE numero_esic = '0.026/2026'), 'Correção legada alterou triagem/prorrogação';
END $$;
INSERT INTO public.protocolos (numero, tipo) VALUES ('9994/2026', 'lai');
UPDATE public.protocolos SET tipo = 'esic', numero_esic = '095/2026' WHERE numero = '9994/2026';
DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.protocolos WHERE numero = '0.095/2026' AND numero_esic = numero AND triagem_pendente), 'Conversão não sincronizou números';
END $$;