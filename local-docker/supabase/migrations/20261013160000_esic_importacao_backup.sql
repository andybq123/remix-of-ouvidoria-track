-- Compatibilidade com restauração pelo painel. NÃO apaga registros.
BEGIN;

CREATE OR REPLACE FUNCTION public.aplicar_regras_esic()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  chave text;
  identidade_nova boolean;
BEGIN
  -- Mesmo modo restrito usado pela RPC backup_importar (somente service_role).
  IF current_setting('app.importando', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.tipo = 'esic'::public.protocolo_tipo THEN
    NEW.categoria := 'pedido_informacao'::public.protocolo_categoria;
    IF TG_OP = 'INSERT' THEN
      NEW.triagem_pendente := true;
      -- Compatível com clientes anteriores à migration.
      NEW.numero_esic := COALESCE(NULLIF(BTRIM(NEW.numero_esic), ''), NEW.numero);
      identidade_nova := true;
    ELSE
      IF OLD.tipo IS DISTINCT FROM NEW.tipo THEN
        NEW.triagem_pendente := true;
        NEW.triagem_concluida_em := NULL;
        NEW.triagem_concluida_por := NULL;
        NEW.numero_esic := COALESCE(NULLIF(BTRIM(NEW.numero_esic), ''), NEW.numero);
      END IF;
      identidade_nova := OLD.tipo IS DISTINCT FROM NEW.tipo
        OR public.normalizar_numero_esic(OLD.numero_esic) IS DISTINCT FROM public.normalizar_numero_esic(NEW.numero_esic);
      IF OLD.prorrogado AND NOT NEW.prorrogado THEN
        RAISE EXCEPTION 'A prorrogação e-SIC já registrada não pode ser reiniciada.';
      END IF;
      IF OLD.esic_prorrogacao_justificativa IS NOT NULL AND NEW.prorrogado
         AND NULLIF(BTRIM(NEW.esic_prorrogacao_justificativa), '') IS NULL THEN
        RAISE EXCEPTION 'A justificativa da prorrogação e-SIC não pode ser apagada.';
      END IF;
    END IF;

    chave := public.normalizar_numero_esic(NEW.numero_esic);
    IF identidade_nova THEN
      IF chave IS NULL OR chave = '' THEN
        RAISE EXCEPTION 'Informe o número do pedido e-SIC.';
      END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended('esic:' || chave, 0));
      IF EXISTS (SELECT 1 FROM public.protocolos p
        WHERE p.tipo = 'esic'::public.protocolo_tipo
          AND public.normalizar_numero_esic(p.numero_esic) = chave
          AND p.id IS DISTINCT FROM NEW.id) THEN
        RAISE EXCEPTION 'Já existe um pedido e-SIC com esse número.' USING ERRCODE = '23505';
      END IF;
    END IF;

    IF (TG_OP = 'INSERT' AND NEW.prorrogado)
       OR (TG_OP = 'UPDATE' AND NEW.prorrogado
           AND (NOT OLD.prorrogado OR OLD.tipo IS DISTINCT FROM NEW.tipo)) THEN
      IF length(BTRIM(COALESCE(NEW.esic_prorrogacao_justificativa, ''))) < 20 THEN
        RAISE EXCEPTION 'Informe uma justificativa expressa com ao menos 20 caracteres para prorrogar o e-SIC.';
      END IF;
      NEW.data_prorrogacao := COALESCE(NEW.data_prorrogacao, CURRENT_DATE);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_campos_esic()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  campo text;
  v_old text;
  v_new text;
  v_uid uuid := auth.uid();
  v_nome text;
BEGIN
  -- Mesmo modo restrito usado pela RPC backup_importar (somente service_role).
  IF current_setting('app.importando', true) = 'on' THEN RETURN NEW; END IF;
  IF v_uid IS NOT NULL THEN SELECT nome INTO v_nome FROM public.profiles WHERE id = v_uid; END IF;
  FOREACH campo IN ARRAY ARRAY['numero_esic', 'esic_prorrogacao_justificativa'] LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', campo, campo)
      INTO v_old, v_new USING OLD, NEW;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.protocolo_historico(protocolo_id, campo, valor_anterior, valor_novo, acao, autor_id, autor_nome)
      VALUES (NEW.id, campo, v_old, v_new, 'update', v_uid, v_nome);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
