ALTER TABLE public.protocolo_historico ADD COLUMN IF NOT EXISTS contexto jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.log_protocolo_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_nome text;
  campos text[] := ARRAY['numero','tipo','categoria','status','assunto','descricao','solicitante','secretaria_id','local_id','data_abertura','data_conclusao','data_prorrogacao','prorrogado','triagem_pendente','endereco','latitude','longitude'];
  campo text; v_old text; v_new text; v_contexto jsonb;
BEGIN
  IF current_setting('app.importando', true) = 'on' THEN RETURN NEW; END IF;
  IF v_uid IS NOT NULL THEN SELECT nome INTO v_nome FROM public.profiles WHERE id = v_uid; END IF;
  IF current_setting('app.agente_1doc', true) = 'on' AND auth.role() = 'service_role' THEN v_nome := 'Agente 1Doc'; END IF;
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
CREATE OR REPLACE FUNCTION public.aplicar_conferencia_1doc(p_id uuid,p_patch jsonb,p_anterior jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO public AS $$
DECLARE p public.protocolos; novo public.protocolos; k text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Acesso restrito ao agente'; END IF;
  SELECT * INTO p FROM public.protocolos WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ouvidoria não encontrada'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_anterior) LOOP
    IF (to_jsonb(p)->k) IS DISTINCT FROM (p_anterior->k) THEN RAISE EXCEPTION 'Ouvidoria alterada durante a conferência; confira novamente'; END IF;
  END LOOP;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (k = ANY(ARRAY['onedoc_situacao','onedoc_baixado_em','onedoc_arquivado_em','onedoc_verificado_em','endereco','latitude','longitude','status','data_conclusao','assunto','categoria'])) THEN RAISE EXCEPTION 'Campo não autorizado'; END IF;
  END LOOP;
  IF p_patch ? 'assunto' AND NOT EXISTS (SELECT 1 FROM public.assuntos WHERE ativo AND nome=p_patch->>'assunto') THEN RAISE EXCEPTION 'Assunto fora do catálogo'; END IF;
  novo := jsonb_populate_record(p,p_patch);
  IF p.status = 'concluido' AND (novo.status IS DISTINCT FROM p.status OR novo.data_conclusao IS DISTINCT FROM p.data_conclusao) THEN RAISE EXCEPTION 'Conclusão existente protegida'; END IF;
  IF p.status <> 'concluido' AND novo.status='concluido' AND novo.onedoc_baixado_em IS NULL THEN RAISE EXCEPTION 'Conclusão exige baixa'; END IF;
  PERFORM set_config('app.agente_1doc','on',true);
  UPDATE public.protocolos SET assunto=novo.assunto,categoria=novo.categoria,endereco=novo.endereco,latitude=novo.latitude,longitude=novo.longitude,status=novo.status,data_conclusao=novo.data_conclusao,onedoc_situacao=novo.onedoc_situacao,onedoc_baixado_em=novo.onedoc_baixado_em,onedoc_arquivado_em=novo.onedoc_arquivado_em,onedoc_verificado_em=novo.onedoc_verificado_em WHERE id=p_id;
  PERFORM set_config('app.agente_1doc','',true);
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_conferencia_1doc(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_conferencia_1doc(uuid,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.reverter_alteracao_1doc(p_historico_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO public AS $$
DECLARE h public.protocolo_historico; p public.protocolos; novo public.protocolos; patch jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Acesso restrito a administradores'; END IF;
  SELECT * INTO h FROM public.protocolo_historico WHERE id=p_historico_id;
  IF NOT FOUND OR h.autor_nome IS DISTINCT FROM 'Agente 1Doc' OR h.acao<>'update' OR NOT (h.campo=ANY(ARRAY['assunto','categoria','endereco','status','data_conclusao'])) THEN RAISE EXCEPTION 'Alteração não reversível'; END IF;
  SELECT * INTO p FROM public.protocolos WHERE id=h.protocolo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ouvidoria não encontrada'; END IF;
  IF (to_jsonb(p)->>h.campo) IS DISTINCT FROM h.valor_novo OR EXISTS (SELECT 1 FROM public.protocolo_historico x WHERE x.protocolo_id=h.protocolo_id AND (x.contexto->>'reversao_de'=h.id::text OR (x.campo=h.campo AND x.id<>h.id AND x.created_at>h.created_at))) THEN RAISE EXCEPTION 'Este campo já mudou depois desta conferência; não é possível reverter'; END IF;
  patch := jsonb_build_object(h.campo,h.valor_anterior);
  IF h.campo='endereco' THEN
    IF (to_jsonb(p)->'latitude') IS DISTINCT FROM (h.contexto->'latitude_nova') OR (to_jsonb(p)->'longitude') IS DISTINCT FROM (h.contexto->'longitude_nova') THEN RAISE EXCEPTION 'O ponto no mapa já mudou; não é possível reverter o endereço'; END IF;
    patch := patch || jsonb_build_object('latitude',h.contexto->'latitude_anterior','longitude',h.contexto->'longitude_anterior');
  END IF;
  novo := jsonb_populate_record(p,patch);
  PERFORM set_config('app.reversao_id',h.id::text,true);
  UPDATE public.protocolos SET assunto=novo.assunto,categoria=novo.categoria,endereco=novo.endereco,latitude=novo.latitude,longitude=novo.longitude,status=novo.status,data_conclusao=novo.data_conclusao WHERE id=p.id;
  PERFORM set_config('app.reversao_id','',true);
END;
$$;
REVOKE ALL ON FUNCTION public.reverter_alteracao_1doc(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reverter_alteracao_1doc(uuid) TO authenticated;
