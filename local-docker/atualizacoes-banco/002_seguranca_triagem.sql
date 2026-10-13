-- Segurança: triagem restrita a administradores; funções não executáveis por visitantes anônimos.
CREATE OR REPLACE FUNCTION public.concluir_triagem(p_id uuid, p_secretaria uuid, p_local uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lock_expira interval := interval '10 minutes';
  v_updated record;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'unauth');
  END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'forbidden');
  END IF;
  IF p_secretaria IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_secretaria');
  END IF;

  UPDATE public.protocolos
  SET secretaria_id     = p_secretaria,
      local_id          = p_local,
      triagem_pendente  = false,
      triagem_lock_por  = NULL,
      triagem_lock_em   = NULL
  WHERE id = p_id
    AND triagem_pendente = true
    AND ( triagem_lock_por IS NULL
       OR triagem_lock_por = v_uid
       OR triagem_lock_em < now() - v_lock_expira )
  RETURNING id INTO v_updated;

  IF v_updated.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT p.triagem_pendente, p.triagem_lock_em, p.triagem_concluida_em,
         COALESCE(pl.nome, 'outro usuário') AS lock_nome,
         COALESCE(pc.nome, 'outro usuário') AS concluida_nome
    INTO v_row
  FROM public.protocolos p
  LEFT JOIN public.profiles pl ON pl.id = p.triagem_lock_por
  LEFT JOIN public.profiles pc ON pc.id = p.triagem_concluida_por
  WHERE p.id = p_id;

  IF NOT v_row.triagem_pendente THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'concluida',
      'por', v_row.concluida_nome, 'em', v_row.triagem_concluida_em);
  END IF;
  RETURN jsonb_build_object('ok', false, 'motivo', 'reservada',
    'por', v_row.lock_nome, 'em', v_row.triagem_lock_em);
END;
$function$;
CREATE OR REPLACE FUNCTION public.reservar_triagem(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lock_expira interval := interval '10 minutes';
  v_updated record;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'unauth');
  END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'forbidden');
  END IF;

  UPDATE public.protocolos
  SET triagem_lock_por = v_uid,
      triagem_lock_em  = now()
  WHERE id = p_id
    AND triagem_pendente = true
    AND ( triagem_lock_por IS NULL
       OR triagem_lock_por = v_uid
       OR triagem_lock_em < now() - v_lock_expira )
  RETURNING id, triagem_lock_em INTO v_updated;

  IF v_updated.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'lock_em', v_updated.triagem_lock_em);
  END IF;

  SELECT p.triagem_pendente, p.triagem_lock_por, p.triagem_lock_em,
         p.triagem_concluida_por, p.triagem_concluida_em,
         COALESCE(pl.nome, 'outro usuário')  AS lock_nome,
         COALESCE(pc.nome, 'outro usuário')  AS concluida_nome
    INTO v_row
  FROM public.protocolos p
  LEFT JOIN public.profiles pl ON pl.id = p.triagem_lock_por
  LEFT JOIN public.profiles pc ON pc.id = p.triagem_concluida_por
  WHERE p.id = p_id;

  IF v_row.triagem_pendente = false THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'concluida',
      'por', v_row.concluida_nome, 'em', v_row.triagem_concluida_em);
  END IF;
  RETURN jsonb_build_object('ok', false, 'motivo', 'reservada',
    'por', v_row.lock_nome, 'em', v_row.triagem_lock_em);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.concluir_triagem(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reservar_triagem(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.liberar_triagem(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.concluir_triagem_admin(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reservar_triagem_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.liberar_triagem_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.concluir_triagem(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reservar_triagem(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.liberar_triagem(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.concluir_triagem_admin(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reservar_triagem_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.liberar_triagem_admin(uuid) TO authenticated, service_role;
