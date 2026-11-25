-- 0039_muse_ouvidorzinho_acesso.sql
--
-- Rename do assistente "Ouvidorizinho" para "Ouvidorzinho" + controle de
-- acesso por usuário + card de boas-vindas do primeiro login.
--
-- 1) allowed_emails.ouvidorzinho_habilitado (default true): o admin liga ou
--    desliga o Ouvidorzinho por usuário na aba Usuários. Desabilitado, o
--    mascote, o chat e os botões do Ouvidorzinho somem para aquele usuário
--    (decisão lida pela função posso_usar_ouvidorzinho, abaixo).
-- 2) allowed_emails.boas_vindas_visto (default false): o card de boas-vindas
--    só aparece no primeiro login; ao dispensar, marcar_boas_vindas_visto()
--    grava true e o card nunca mais aparece (em nenhum navegador).
-- 3) As funções concluir_triagem / reservar_triagem / reservar_triagem_muse
--    (0037) devolviam o nome antigo ('Ouvidorizinho') como lock_nome /
--    concluida_nome; são repostas aqui com o nome novo. Corpos idênticos
--    aos da 0037, só muda a string. A 0037 não é editada (já aplicada).
-- 4) O comentário da coluna protocolos.triagem_origem passa ao nome novo.
--
-- Idempotente (ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION), para
-- aplicar duas vezes na instalação limpa (tests/instalacao/run.sh) e no
-- deploy (local-docker/atualizacoes-banco/040, mesma conteúdo).

-- Acesso ao Ouvidorzinho por usuário (padrão habilitado para todos).
ALTER TABLE public.allowed_emails ADD COLUMN IF NOT EXISTS ouvidorzinho_habilitado boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.allowed_emails.ouvidorzinho_habilitado IS 'Ouvidorzinho habilitado para este usuário (admin desliga na aba Usuários); desligado, mascote, chat e botões do Ouvidorzinho somem para ele.';

-- Boas-vindas do primeiro login (false até o usuário dispensar o card).
ALTER TABLE public.allowed_emails ADD COLUMN IF NOT EXISTS boas_vindas_visto boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.allowed_emails.boas_vindas_visto IS 'Card de boas-vindas já exibido/dispensado (true = nunca mais mostrar).';

-- Flag de acesso do usuário logado. True quando não há linha (fail-open:
-- ninguém perde o Ouvidorzinho por falta de registro); false só quando o
-- admin desligou explicitamente. Mesmo padrão de posso_editar() (0018).
CREATE OR REPLACE FUNCTION public.posso_usar_ouvidorzinho()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT a.ouvidorzinho_habilitado FROM public.allowed_emails a
     WHERE lower(a.email) = lower(auth.jwt() ->> 'email')),
    true)
$$;
REVOKE EXECUTE ON FUNCTION public.posso_usar_ouvidorzinho() FROM anon;
GRANT EXECUTE ON FUNCTION public.posso_usar_ouvidorzinho() TO authenticated;

-- Card de boas-vindas já visto pelo usuário logado (false = mostrar).
CREATE OR REPLACE FUNCTION public.boas_vindas_visto()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT a.boas_vindas_visto FROM public.allowed_emails a
     WHERE lower(a.email) = lower(auth.jwt() ->> 'email')),
    false)
$$;
REVOKE EXECUTE ON FUNCTION public.boas_vindas_visto() FROM anon;
GRANT EXECUTE ON FUNCTION public.boas_vindas_visto() TO authenticated;

-- Marca o card de boas-vindas como visto para o próprio usuário (só a
-- linha do e-mail do JWT é atualizada). Devolve false sem erro quando não
-- há linha — a UI esconde o card na sessão mesmo assim e não insiste.
CREATE OR REPLACE FUNCTION public.marcar_boas_vindas_visto()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ok boolean;
BEGIN
  UPDATE public.allowed_emails SET boas_vindas_visto = true
  WHERE lower(email) = lower(auth.jwt() ->> 'email')
  RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.marcar_boas_vindas_visto() FROM anon;
GRANT EXECUTE ON FUNCTION public.marcar_boas_vindas_visto() TO authenticated;

COMMENT ON COLUMN public.protocolos.triagem_origem IS 'Origem da triagem: ''muse'' quando triada pelo Ouvidorzinho (Muse); NULL quando triada no painel.';

-- Funções da 0037 repostas com o nome novo (corpos idênticos, só a string):
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
    AND NOT (triagem_origem = 'muse' AND triagem_lock_em > now() - v_lock_expira)
  RETURNING id INTO v_updated;

  IF v_updated.id IS NOT NULL THEN RETURN jsonb_build_object('ok', true); END IF;

  SELECT p.triagem_pendente, p.triagem_lock_em, p.triagem_concluida_em,
         CASE WHEN p.triagem_origem = 'muse' THEN 'Ouvidorzinho' ELSE COALESCE(pl.nome, 'outro usuário') END AS lock_nome,
         CASE WHEN p.triagem_origem = 'muse' THEN 'Ouvidorzinho' ELSE COALESCE(pc.nome, 'outro usuário') END AS concluida_nome
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
    AND NOT (triagem_origem = 'muse' AND triagem_lock_em > now() - v_lock_expira)
  RETURNING id, triagem_lock_em INTO v_updated;

  IF v_updated.id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'lock_em', v_updated.triagem_lock_em); END IF;

  SELECT p.triagem_pendente, p.triagem_lock_em, p.triagem_concluida_em,
         CASE WHEN p.triagem_origem = 'muse' THEN 'Ouvidorzinho' ELSE COALESCE(pl.nome, 'outro usuário') END AS lock_nome,
         CASE WHEN p.triagem_origem = 'muse' THEN 'Ouvidorzinho' ELSE COALESCE(pc.nome, 'outro usuário') END AS concluida_nome
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

CREATE OR REPLACE FUNCTION public.reservar_triagem_muse(p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lock_expira interval := interval '10 minutes';
  v_updated record;
  v_row record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'forbidden');
  END IF;

  UPDATE public.protocolos
  SET triagem_lock_em = now(), triagem_lock_por = NULL, triagem_origem = 'muse'
  WHERE id = p_id AND triagem_pendente = true
    AND (triagem_lock_por IS NULL OR triagem_lock_em < now() - v_lock_expira OR triagem_origem = 'muse')
  RETURNING id, triagem_lock_em INTO v_updated;

  IF v_updated.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'lock_em', v_updated.triagem_lock_em);
  END IF;

  SELECT p.triagem_pendente, p.triagem_lock_em, p.triagem_concluida_em,
         COALESCE(pl.nome, 'outro usuário') AS lock_nome,
         CASE WHEN p.triagem_origem = 'muse' THEN 'Ouvidorzinho'
              ELSE COALESCE(pc.nome, 'outro usuário') END AS concluida_nome
    INTO v_row
  FROM public.protocolos p
  LEFT JOIN public.profiles pl ON pl.id = p.triagem_lock_por
  LEFT JOIN public.profiles pc ON pc.id = p.triagem_concluida_por
  WHERE p.id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrado');
  END IF;
  IF NOT v_row.triagem_pendente THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'concluida',
      'por', v_row.concluida_nome, 'em', v_row.triagem_concluida_em);
  END IF;
  RETURN jsonb_build_object('ok', false, 'motivo', 'reservada',
    'por', v_row.lock_nome, 'em', v_row.triagem_lock_em);
END;
$function$;

NOTIFY pgrst, 'reload schema';
