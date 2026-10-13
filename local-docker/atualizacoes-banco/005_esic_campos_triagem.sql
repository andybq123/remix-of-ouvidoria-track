-- Migration aditiva. Não troca números internos nem remove dados existentes.
BEGIN;

ALTER TABLE public.protocolos ADD COLUMN IF NOT EXISTS numero_esic text;
ALTER TABLE public.protocolos ADD COLUMN IF NOT EXISTS esic_prorrogacao_justificativa text;

-- Pedidos do tipo esic cadastrados pela versão antiga usavam numero para o Nº oficial.
UPDATE public.protocolos SET numero_esic = numero
WHERE tipo = 'esic'::public.protocolo_tipo
  AND NULLIF(BTRIM(numero_esic), '') IS NULL;

CREATE OR REPLACE FUNCTION public.normalizar_numero_esic(p_numero text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = public AS $$
  SELECT CASE WHEN regexp_replace(btrim(p_numero), '[.[:space:]]', '', 'g') ~ '^[0-9]+/[0-9]{4}$'
    THEN regexp_replace(regexp_replace(btrim(p_numero), '[.[:space:]]', '', 'g'), '^0+([0-9])', '\1')
    ELSE upper(regexp_replace(btrim(p_numero), '[.[:space:]]', '', 'g')) END;
$$;

CREATE INDEX IF NOT EXISTS idx_protocolos_esic_numero_normalizado
  ON public.protocolos (public.normalizar_numero_esic(numero_esic))
  WHERE tipo = 'esic'::public.protocolo_tipo;

-- Somente leitura, SECURITY INVOKER: preserva as políticas RLS do chamador.
CREATE OR REPLACE FUNCTION public.protocolo_esic_por_numero(p_numero text)
RETURNS TABLE(id uuid, numero text, status public.protocolo_status)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p.id, p.numero, p.status FROM public.protocolos p
  WHERE p.tipo = 'esic'::public.protocolo_tipo
    AND public.normalizar_numero_esic(p.numero_esic) = public.normalizar_numero_esic(p_numero);
$$;
REVOKE ALL ON FUNCTION public.protocolo_esic_por_numero(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protocolo_esic_por_numero(text) TO authenticated, service_role;

-- Não cria índice UNIQUE sobre dados legados desconhecidos: eventuais duplicatas
-- antigas são preservadas e reportadas pela consulta (não há fusão silenciosa).
-- Novas duplicatas são rejeitadas, inclusive em coletas simultâneas.
CREATE OR REPLACE FUNCTION public.aplicar_regras_esic()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  chave text;
  identidade_nova boolean;
BEGIN
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protocolos_esic_regras'
    AND tgrelid = 'public.protocolos'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_protocolos_esic_regras BEFORE INSERT OR UPDATE ON public.protocolos
      FOR EACH ROW EXECUTE FUNCTION public.aplicar_regras_esic();
  END IF;
END; $$;

-- Acrescenta os dois campos próprios ao histórico sem substituir o trigger atual.
CREATE OR REPLACE FUNCTION public.log_campos_esic()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  campo text;
  v_old text;
  v_new text;
  v_uid uuid := auth.uid();
  v_nome text;
BEGIN
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
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_log_campos_esic'
    AND tgrelid = 'public.protocolos'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_log_campos_esic AFTER UPDATE ON public.protocolos
      FOR EACH ROW EXECUTE FUNCTION public.log_campos_esic();
  END IF;
END; $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
