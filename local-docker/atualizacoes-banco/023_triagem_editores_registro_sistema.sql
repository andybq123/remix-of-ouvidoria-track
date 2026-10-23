BEGIN;
-- Triagem: administradores e usuários com "Pode modificar" podem triar.
CREATE OR REPLACE FUNCTION public.pode_triar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(), 'admin') OR public.posso_editar())
$$;
REVOKE EXECUTE ON FUNCTION public.pode_triar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_triar() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.concluir_triagem(p_id uuid, p_secretaria uuid, p_local uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lock_expira interval := interval '10 minutes';
  v_updated record;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'unauth'); END IF;
  IF NOT public.pode_triar() THEN RETURN jsonb_build_object('ok', false, 'motivo', 'forbidden'); END IF;
  IF p_secretaria IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_secretaria'); END IF;
  IF NOT public.has_role(v_uid, 'admin') AND NOT public.pode_editar_area(p_secretaria) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'forbidden');
  END IF;

  UPDATE public.protocolos
  SET secretaria_id = p_secretaria, local_id = p_local, triagem_pendente = false,
      triagem_lock_por = NULL, triagem_lock_em = NULL
  WHERE id = p_id AND triagem_pendente = true
    AND (triagem_lock_por IS NULL OR triagem_lock_por = v_uid OR triagem_lock_em < now() - v_lock_expira)
  RETURNING id INTO v_updated;

  IF v_updated.id IS NOT NULL THEN RETURN jsonb_build_object('ok', true); END IF;

  SELECT p.triagem_pendente, p.triagem_lock_em, p.triagem_concluida_em,
         COALESCE(pl.nome, 'outro usuário') AS lock_nome,
         COALESCE(pc.nome, 'outro usuário') AS concluida_nome
    INTO v_row
  FROM public.protocolos p
  LEFT JOIN public.profiles pl ON pl.id = p.triagem_lock_por
  LEFT JOIN public.profiles pc ON pc.id = p.triagem_concluida_por
  WHERE p.id = p_id;

  IF NOT v_row.triagem_pendente THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'concluida', 'por', v_row.concluida_nome, 'em', v_row.triagem_concluida_em);
  END IF;
  RETURN jsonb_build_object('ok', false, 'motivo', 'reservada', 'por', v_row.lock_nome, 'em', v_row.triagem_lock_em);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reservar_triagem(p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lock_expira interval := interval '10 minutes';
  v_updated record;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'unauth'); END IF;
  IF NOT public.pode_triar() THEN RETURN jsonb_build_object('ok', false, 'motivo', 'forbidden'); END IF;

  UPDATE public.protocolos
  SET triagem_lock_por = v_uid, triagem_lock_em = now()
  WHERE id = p_id AND triagem_pendente = true
    AND (triagem_lock_por IS NULL OR triagem_lock_por = v_uid OR triagem_lock_em < now() - v_lock_expira)
  RETURNING id, triagem_lock_em INTO v_updated;

  IF v_updated.id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'lock_em', v_updated.triagem_lock_em); END IF;

  SELECT p.triagem_pendente, p.triagem_lock_em, p.triagem_concluida_em,
         COALESCE(pl.nome, 'outro usuário') AS lock_nome,
         COALESCE(pc.nome, 'outro usuário') AS concluida_nome
    INTO v_row
  FROM public.protocolos p
  LEFT JOIN public.profiles pl ON pl.id = p.triagem_lock_por
  LEFT JOIN public.profiles pc ON pc.id = p.triagem_concluida_por
  WHERE p.id = p_id;

  IF v_row.triagem_pendente = false THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'concluida', 'por', v_row.concluida_nome, 'em', v_row.triagem_concluida_em);
  END IF;
  RETURN jsonb_build_object('ok', false, 'motivo', 'reservada', 'por', v_row.lock_nome, 'em', v_row.triagem_lock_em);
END;
$function$;

-- Editores podem ajustar os campos de uma ouvidoria em triagem (antes de concluí-la).
DROP POLICY IF EXISTS "Editores atualizam protocolos em triagem" ON public.protocolos;
CREATE POLICY "Editores atualizam protocolos em triagem"
ON public.protocolos FOR UPDATE TO authenticated
USING (sigilo = 'publico' AND triagem_pendente = true AND public.posso_editar())
WITH CHECK (sigilo = 'publico' AND public.posso_editar());

-- Registro do sistema: toda alteração em tabelas de negócio, por qualquer usuário.
CREATE TABLE IF NOT EXISTS public.registro_sistema (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  tabela text NOT NULL,
  operacao text NOT NULL,
  registro_id text,
  resumo text,
  campos text[] NOT NULL DEFAULT '{}',
  dados_anteriores jsonb,
  dados_novos jsonb,
  autor_id uuid,
  autor_nome text,
  autor_email text
);
GRANT SELECT ON public.registro_sistema TO authenticated;
GRANT ALL ON public.registro_sistema TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.registro_sistema_id_seq TO service_role;
ALTER TABLE public.registro_sistema ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins leem registro do sistema" ON public.registro_sistema;
CREATE POLICY "Admins leem registro do sistema" ON public.registro_sistema
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_registro_sistema_data ON public.registro_sistema (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registro_sistema_tabela ON public.registro_sistema (tabela, created_at DESC);

CREATE OR REPLACE FUNCTION public.registrar_alteracao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text; v_email text := auth.jwt() ->> 'email';
  v_old jsonb; v_new jsonb; v_campos text[] := '{}'; k text;
  v_ant jsonb := '{}'::jsonb; v_nov jsonb := '{}'::jsonb;
  v_id text; v_resumo text;
  ignorar text[] := ARRAY['updated_at','triagem_lock_por','triagem_lock_em'];
BEGIN
  IF current_setting('app.importando', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;

  IF TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF NOT (k = ANY(ignorar)) AND (v_old -> k) IS DISTINCT FROM (v_new -> k) THEN
        v_campos := v_campos || k;
        v_ant := v_ant || jsonb_build_object(k, v_old -> k);
        v_nov := v_nov || jsonb_build_object(k, v_new -> k);
      END IF;
    END LOOP;
    IF cardinality(v_campos) = 0 THEN RETURN NULL; END IF;
  ELSIF TG_OP = 'INSERT' THEN v_nov := v_new;
  ELSE v_ant := v_old;
  END IF;

  v_id := COALESCE(v_new ->> 'id', v_old ->> 'id');
  v_resumo := COALESCE(v_new ->> 'numero', v_old ->> 'numero', v_new ->> 'nome', v_old ->> 'nome',
                       v_new ->> 'email', v_old ->> 'email', v_new ->> 'role', v_old ->> 'role');

  IF v_uid IS NOT NULL THEN SELECT nome INTO v_nome FROM public.profiles WHERE id = v_uid; END IF;
  IF current_setting('app.agente_1doc', true) = 'on' THEN v_nome := 'Agente 1Doc';
  ELSIF v_uid IS NULL THEN v_nome := COALESCE(v_nome, 'Sistema (automático)');
  END IF;

  INSERT INTO public.registro_sistema(tabela, operacao, registro_id, resumo, campos, dados_anteriores, dados_novos, autor_id, autor_nome, autor_email)
  VALUES (TG_TABLE_NAME, lower(TG_OP), v_id, v_resumo, v_campos,
          NULLIF(v_ant, '{}'::jsonb), NULLIF(v_nov, '{}'::jsonb), v_uid, v_nome, v_email);
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.registrar_alteracao() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['protocolos','secretarias','locais','assuntos','allowed_emails','user_secretarias','user_roles','secretaria_responsaveis'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_registro_sistema ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_registro_sistema AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.registrar_alteracao()', t);
  END LOOP;
END $$;
COMMIT;
NOTIFY pgrst, 'reload schema';
