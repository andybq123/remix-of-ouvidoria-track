DO $$
DECLARE r public.protocolos;
BEGIN
  SELECT * INTO r FROM public.protocolos WHERE numero = '005/2026';
  ASSERT r.numero_esic = '005/2026' AND NOT r.triagem_pendente, 'Backfill não preservou o legado';
  ASSERT (SELECT count(*) = 2 FROM public.protocolo_esic_por_numero('0007/2026')), 'Duplicatas legadas foram alteradas';
  ASSERT public.normalizar_numero_esic('00026 / 2026') = '26/2026';
  ASSERT public.normalizar_numero_esic('0.026/2026') = '26/2026';
  ASSERT public.normalizar_numero_esic('000/2026') = '0/2026';
  ASSERT has_function_privilege('authenticated', 'public.protocolo_esic_por_numero(text)', 'execute');
  ASSERT NOT has_function_privilege('anon', 'public.protocolo_esic_por_numero(text)', 'execute');
END $$;

-- Mesmo se o cliente pedir bypass de triagem e atribuir outra categoria.
INSERT INTO public.protocolos (numero, numero_esic, tipo, categoria, triagem_pendente)
VALUES ('1001/2026', '026/2026', 'esic', 'reclamacao', false);
DO $$ DECLARE r public.protocolos; BEGIN
  SELECT * INTO r FROM public.protocolos WHERE numero = '1001/2026';
  ASSERT r.triagem_pendente AND r.categoria = 'pedido_informacao', 'Triagem/categoria e-SIC não forçadas';
  ASSERT (SELECT count(*) = 1 FROM public.protocolo_esic_por_numero('26/2026')), 'Busca normalizada falhou';
  BEGIN
    INSERT INTO public.protocolos (numero, numero_esic, tipo) VALUES ('1002/2026', '26/2026', 'esic');
    RAISE EXCEPTION 'Duplicata e-SIC foi aceita';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE public.protocolos SET prorrogado = true WHERE numero = '1001/2026';
    RAISE EXCEPTION 'Prorrogação sem justificativa foi aceita';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Prorrogação sem justificativa foi aceita' THEN RAISE; END IF;
  END;
END $$;

UPDATE public.protocolos SET triagem_pendente = false, secretaria_id = gen_random_uuid() WHERE numero = '1001/2026';
UPDATE public.protocolos SET prorrogado = true, esic_prorrogacao_justificativa = 'Necessário reunir dados de diferentes unidades.' WHERE numero = '1001/2026';
DO $$ DECLARE r public.protocolos; BEGIN
  SELECT * INTO r FROM public.protocolos WHERE numero = '1001/2026';
  ASSERT NOT r.triagem_pendente AND r.triagem_concluida_em IS NOT NULL, 'Não foi possível finalizar a triagem';
  ASSERT r.prorrogado AND r.data_prorrogacao = current_date, 'Prorrogação não persistida';
  ASSERT EXISTS (SELECT 1 FROM public.protocolo_historico WHERE protocolo_id = r.id AND campo = 'esic_prorrogacao_justificativa'), 'Justificativa não auditada';
  BEGIN
    UPDATE public.protocolos SET prorrogado = false WHERE numero = '1001/2026';
    RAISE EXCEPTION 'Reset de prorrogação foi aceito';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Reset de prorrogação foi aceito' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.protocolos SET esic_prorrogacao_justificativa = '' WHERE numero = '1001/2026';
    RAISE EXCEPTION 'Apagar justificativa foi permitido';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Apagar justificativa foi permitido' THEN RAISE; END IF;
  END;
END $$;

-- Outros tipos seguem funcionando com os gatilhos antigos.
INSERT INTO public.protocolos (numero, tipo, secretaria_id, assunto) VALUES ('1003/2026', 'ouvidoria', gen_random_uuid(), 'Asfalto');
UPDATE public.protocolos SET prorrogado = true WHERE numero = '1003/2026';
DO $$ BEGIN
  ASSERT (SELECT NOT triagem_pendente AND prorrogado FROM public.protocolos WHERE numero = '1003/2026'), 'Ouvidoria sofreu regressão';
END $$;
-- Converter o tipo reencaminha à triagem, não mantém o carimbo da triagem anterior.
INSERT INTO public.protocolos (numero, tipo, triagem_concluida_em) VALUES ('1004/2026', 'lai', now());
UPDATE public.protocolos SET tipo = 'esic', numero_esic = '027/2026' WHERE numero = '1004/2026';
DO $$ BEGIN
  ASSERT (SELECT triagem_pendente AND triagem_concluida_em IS NULL FROM public.protocolos WHERE numero = '1004/2026'), 'Conversão não retornou para triagem';
END $$;
DO $$ BEGIN
  BEGIN
    UPDATE public.protocolos SET tipo = 'esic', numero_esic = '028/2026' WHERE numero = '1003/2026';
    RAISE EXCEPTION 'Conversão prorrogada sem justificativa foi aceita';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'Conversão prorrogada sem justificativa foi aceita' THEN RAISE; END IF;
  END;
END $$;
UPDATE public.protocolos SET tipo = 'esic', numero_esic = '028/2026',
  esic_prorrogacao_justificativa = 'A conversão exige reunir os documentos de todas as unidades.'
WHERE numero = '1003/2026';
DO $$ BEGIN
  ASSERT (SELECT triagem_pendente AND prorrogado FROM public.protocolos WHERE numero = '1003/2026'), 'Conversão válida com justificativa falhou';
END $$;
