BEGIN;
-- Locais que funcionam como área própria para usuários (ex.: Vigilância Sanitária dentro da Saúde).
ALTER TABLE public.locais ADD COLUMN IF NOT EXISTS area_propria boolean NOT NULL DEFAULT false;
UPDATE public.locais SET area_propria = true WHERE lower(nome) LIKE 'vigil%' AND area_propria = false;

CREATE TABLE IF NOT EXISTS public.user_locais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  local_id uuid NOT NULL REFERENCES public.locais(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, local_id)
);
GRANT SELECT ON public.user_locais TO authenticated;
GRANT ALL ON public.user_locais TO service_role;
ALTER TABLE public.user_locais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins gerenciam locais de usuarios" ON public.user_locais;
CREATE POLICY "Admins gerenciam locais de usuarios" ON public.user_locais FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Usuario le proprios locais" ON public.user_locais;
CREATE POLICY "Usuario le proprios locais" ON public.user_locais FOR SELECT TO authenticated
USING (email = lower(auth.jwt() ->> 'email'));

-- Sem vínculos = todas as áreas. Secretaria vinculada = tudo dela, exceto locais com área própria.
-- Local vinculado = só as ouvidorias daquele local.
CREATE OR REPLACE FUNCTION public.area_permitida(_secretaria uuid, _local uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT lower(auth.jwt() ->> 'email') AS email)
  SELECT
    (NOT EXISTS (SELECT 1 FROM public.user_secretarias us, me WHERE us.email = me.email)
     AND NOT EXISTS (SELECT 1 FROM public.user_locais ul, me WHERE ul.email = me.email))
    OR (_secretaria IN (SELECT us.secretaria_id FROM public.user_secretarias us, me WHERE us.email = me.email)
        AND (_local IS NULL OR NOT EXISTS (SELECT 1 FROM public.locais l WHERE l.id = _local AND l.area_propria)))
    OR (_local IS NOT NULL AND _local IN (SELECT ul.local_id FROM public.user_locais ul, me WHERE ul.email = me.email))
$$;
REVOKE EXECUTE ON FUNCTION public.area_permitida(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.area_permitida(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pode_editar_local(_secretaria uuid, _local uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.posso_editar() AND public.area_permitida(_secretaria, _local)
$$;
REVOKE EXECUTE ON FUNCTION public.pode_editar_local(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_editar_local(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Autenticados leem protocolos" ON public.protocolos;
CREATE POLICY "Autenticados leem protocolos" ON public.protocolos FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL AND (public.has_role(auth.uid(), 'admin')
  OR (sigilo = 'publico' AND public.area_permitida(secretaria_id, local_id))));

DROP POLICY IF EXISTS "Editores atualizam protocolos da area" ON public.protocolos;
CREATE POLICY "Editores atualizam protocolos da area" ON public.protocolos FOR UPDATE TO authenticated
USING (sigilo = 'publico' AND triagem_pendente = false AND public.pode_editar_local(secretaria_id, local_id))
WITH CHECK (sigilo = 'publico' AND triagem_pendente = false AND public.pode_editar_local(secretaria_id, local_id));

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
  IF NOT public.has_role(v_uid, 'admin') AND NOT public.pode_editar_local(p_secretaria, p_local) THEN
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

DROP TRIGGER IF EXISTS trg_registro_sistema ON public.user_locais;
CREATE TRIGGER trg_registro_sistema AFTER INSERT OR UPDATE OR DELETE ON public.user_locais
FOR EACH ROW EXECUTE FUNCTION public.registrar_alteracao();
COMMIT;
NOTIFY pgrst, 'reload schema';
