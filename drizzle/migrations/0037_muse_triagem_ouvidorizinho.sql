-- 0037_muse_triagem_ouvidorizinho.sql
--
-- Triagem de protocolo pela integração Muse (POST /api/public/muse/protocolo/{id}/triar).
--
-- Replica a transição do "Concluir triagem" do painel (protocolo-detail-dialog.tsx):
-- secretaria obrigatória, descrição (breve relato) com no mínimo 5 caracteres,
-- e-SIC não é triado pelo Muse, Obras exige endereço + latitude/longitude
-- (isObras via mapDepartmentOf). Não muda status (o protocolo em triagem já
-- está "em andamento") nem conclui/encerra/arquiva nada: triagem é atribuição
-- (secretaria/local/descrição) e só limpa triagem_pendente.
--
-- Sinal "sendo triado / triado pelo Ouvidorizinho":
-- - A coluna triagem_origem ('muse' ou NULL) marca quem está triando/triou.
-- - reservar_triagem_muse trava o protocolo por 10 min (mesmo TTL do painel)
--   para a UI mostrar "Triando com o Ouvidorizinho" na lista e no detalhe.
-- - aplicar_triagem_muse grava triagem_concluida_em + triagem_origem='muse';
--   o detalhe mostra o card "Triado pelo Ouvidorizinho".
-- - concluir_triagem/reservar_triagem (0019) são repostas aqui com consciência
--   do lock do Muse: uma trava fresca do Muse bloqueia a tomada por humanos e
--   o nome devolvido passa a ser 'Ouvidorizinho', então os banners que já
--   existem no detalhe mostram o texto certo sem mudar o componente.
--
-- Auditoria: a escrita passa por RPC restrita a service_role e grava com
-- app.muse='on', então o trigger log_protocolo_changes registra autor "Muse"
-- em protocolo_historico (visível na aba Histórico) e registrar_alteracao
-- registra "Muse" em registro_sistema — o mesmo padrão da RPC
-- aplicar_edicao_muse (0036) e do agente 1Doc.
--
-- Sobre a 0036 (PR #19, ainda não mergeada): a reposição de
-- log_protocolo_changes abaixo é idêntica à da 0036 (corpo da 0012 + linha
-- app.muse), então aplicar 0036 e 0037 em qualquer ordem dá no mesmo.
-- Aplicar no banco da VPS junto com o deploy (mesmo processo manual das
-- 0034/0035/0036). Sem ela, o POST /triar responde 500 (funções inexistentes).

-- Origem da triagem: 'muse' quando triada pelo Ouvidorizinho; NULL (painel).
ALTER TABLE public.protocolos ADD COLUMN IF NOT EXISTS triagem_origem text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protocolos_triagem_origem_check') THEN
    ALTER TABLE public.protocolos
      ADD CONSTRAINT protocolos_triagem_origem_check
      CHECK (triagem_origem IS NULL OR triagem_origem = 'muse');
  END IF;
END $$;
COMMENT ON COLUMN public.protocolos.triagem_origem IS 'Origem da triagem: ''muse'' quando triada pelo Ouvidorizinho (Muse); NULL quando triada no painel.';

-- Reposição de log_protocolo_changes com app.muse (idêntica à 0036).
CREATE OR REPLACE FUNCTION public.log_protocolo_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_nome text;
  campos text[] := ARRAY['numero','tipo','categoria','status','assunto','descricao','solicitante','secretaria_id','local_id','data_abertura','data_conclusao','data_prorrogacao','prorrogado','triagem_pendente','endereco','latitude','longitude'];
  campo text; v_old text; v_new text; v_contexto jsonb;
BEGIN
  IF current_setting('app.importando', true) = 'on' THEN RETURN NEW; END IF;
  IF v_uid IS NOT NULL THEN SELECT nome INTO v_nome FROM public.profiles WHERE id = v_uid; END IF;
  IF current_setting('app.agente_1doc', true) = 'on' AND auth.role() = 'service_role' THEN v_nome := 'Agente 1Doc'; END IF;
  IF current_setting('app.muse', true) = 'on' AND auth.role() = 'service_role' THEN v_nome := 'Muse'; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.protocolo_historico(protocolo_id,campo,valor_anterior,valor_novo,acao,autor_id,autor_nome) VALUES (NEW.id,'_criacao',NULL,NEW.numero,'create',v_uid,v_nome);
    RETURN NEW;
  END IF;
  FOREACH campo IN ARRAY campos LOOP
    v_old := to_jsonb(OLD)->>campo; v_new := to_jsonb(NEW)->>campo;
    IF v_old IS DISTINCT FROM v_new THEN
      v_contexto := jsonb_build_object('reversao_de',nullif(current_setting('app.reversao_id',true),''));
      IF campo = 'endereco' THEN v_contexto := v_contexto || jsonb_build_object('latitude_anterior',OLD.latitude,'longitude_anterior',OLD.longitude,'latitude_nova',NEW.latitude,'longitude_nova',NEW.longitude); END IF;
      INSERT INTO public.protocolo_historico(protocolo_id,campo,valor_anterior,valor_novo,acao,autor_id,autor_nome,contexto)
      VALUES (NEW.id,campo,v_old,v_new,CASE WHEN nullif(current_setting('app.reversao_id',true),'') IS NOT NULL THEN 'revert' ELSE 'update' END,v_uid,v_nome,v_contexto);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- registrar_alteracao com autor Muse em registro_sistema (corpo da 0019 + linha app.muse).
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
  ELSIF current_setting('app.muse', true) = 'on' THEN v_nome := 'Muse';
  ELSIF v_uid IS NULL THEN v_nome := COALESCE(v_nome, 'Sistema (automático)');
  END IF;

  INSERT INTO public.registro_sistema(tabela, operacao, registro_id, resumo, campos, dados_anteriores, dados_novos, autor_id, autor_nome, autor_email)
  VALUES (TG_TABLE_NAME, lower(TG_OP), v_id, v_resumo, v_campos,
          NULLIF(v_ant, '{}'::jsonb), NULLIF(v_nov, '{}'::jsonb), v_uid, v_nome, v_email);
  RETURN NULL;
END;
$$;

-- concluir_triagem / reservar_triagem (0019) com consciência do lock do Muse.
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
         CASE WHEN p.triagem_origem = 'muse' THEN 'Ouvidorizinho' ELSE COALESCE(pl.nome, 'outro usuário') END AS lock_nome,
         CASE WHEN p.triagem_origem = 'muse' THEN 'Ouvidorizinho' ELSE COALESCE(pc.nome, 'outro usuário') END AS concluida_nome
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
         CASE WHEN p.triagem_origem = 'muse' THEN 'Ouvidorizinho' ELSE COALESCE(pl.nome, 'outro usuário') END AS lock_nome,
         CASE WHEN p.triagem_origem = 'muse' THEN 'Ouvidorizinho' ELSE COALESCE(pc.nome, 'outro usuário') END AS concluida_nome
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
         CASE WHEN p.triagem_origem = 'muse' THEN 'Ouvidorizinho'
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

CREATE OR REPLACE FUNCTION public.liberar_triagem_muse(p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_updated record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'forbidden');
  END IF;

  UPDATE public.protocolos
  SET triagem_lock_por = NULL, triagem_lock_em = NULL, triagem_origem = NULL
  WHERE id = p_id AND triagem_pendente = true AND triagem_origem = 'muse'
  RETURNING id INTO v_updated;

  IF v_updated.id IS NOT NULL THEN RETURN jsonb_build_object('ok', true); END IF;
  RETURN jsonb_build_object('ok', false, 'motivo', 'sem_reserva_muse');
END;
$function$;

CREATE OR REPLACE FUNCTION public.aplicar_triagem_muse(
  p_id uuid,
  p_secretaria uuid,
  p_local uuid,
  p_descricao text,
  p_endereco text,
  p_latitude double precision,
  p_longitude double precision
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public
AS $function$
DECLARE
  p public.protocolos;
  v_sec record;
  v_local_secretaria uuid;
  v_eh_obras boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Acesso restrito ao agente'; END IF;

  SELECT * INTO p FROM public.protocolos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Protocolo não encontrado'; END IF;
  IF p.tipo = 'esic' THEN RAISE EXCEPTION 'e-SIC não é triado pelo Muse'; END IF;
  IF NOT p.triagem_pendente THEN RAISE EXCEPTION 'Protocolo já triado'; END IF;

  -- Trava humana ativa: não concluir por cima de quem está triando.
  IF p.triagem_lock_por IS NOT NULL AND p.triagem_lock_em > now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'Protocolo em triagem por outro usuário';
  END IF;

  SELECT nome, sigla INTO v_sec FROM public.secretarias WHERE id = p_secretaria;
  IF NOT FOUND THEN RAISE EXCEPTION 'Secretaria não encontrada'; END IF;

  IF p_local IS NOT NULL THEN
    SELECT secretaria_id INTO v_local_secretaria FROM public.locais WHERE id = p_local;
    IF NOT FOUND THEN RAISE EXCEPTION 'Local não encontrado'; END IF;
    IF v_local_secretaria IS DISTINCT FROM p_secretaria THEN RAISE EXCEPTION 'Local não pertence à secretaria'; END IF;
  END IF;

  IF p_descricao IS NULL OR length(trim(p_descricao)) < 5 THEN RAISE EXCEPTION 'Descrição muito curta'; END IF;

  -- Obras exige endereço + ponto no mapa, como o painel (isObras em
  -- protocolo-detail-dialog.tsx via mapDepartmentOf).
  v_eh_obras := COALESCE(
    lower(v_sec.sigla) = 'sosu'
    OR v_sec.nome ~* '\bsosu\b'
    OR v_sec.nome ~* '\bobras?\b'
    OR v_sec.nome ~* 'servi[cç]os urbanos',
    false);
  IF v_eh_obras AND (p_endereco IS NULL OR length(trim(p_endereco)) = 0 OR p_latitude IS NULL OR p_longitude IS NULL) THEN
    RAISE EXCEPTION 'Endereço e ponto no mapa são obrigatórios para Obras';
  END IF;

  PERFORM set_config('app.muse', 'on', true);
  UPDATE public.protocolos SET
    descricao = trim(p_descricao),
    endereco = NULLIF(trim(p_endereco), ''),
    latitude = p_latitude,
    longitude = p_longitude,
    secretaria_id = p_secretaria,
    local_id = p_local,
    triagem_pendente = false,
    triagem_lock_por = NULL,
    triagem_lock_em = NULL,
    triagem_concluida_em = now(),
    triagem_concluida_por = NULL,
    triagem_origem = 'muse'
  WHERE id = p_id;
  PERFORM set_config('app.muse', '', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.reservar_triagem_muse(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_triagem_muse(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.liberar_triagem_muse(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_triagem_muse(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.aplicar_triagem_muse(uuid, uuid, uuid, text, text, double precision, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_triagem_muse(uuid, uuid, uuid, text, text, double precision, double precision) TO service_role;

NOTIFY pgrst, 'reload schema';
