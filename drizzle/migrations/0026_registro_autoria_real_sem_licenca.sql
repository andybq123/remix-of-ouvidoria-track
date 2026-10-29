CREATE OR REPLACE FUNCTION public.autor_registro_sistema()
RETURNS TABLE(autor_id uuid, autor_nome text, autor_email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $$
DECLARE v_uid uuid := auth.uid(); v_headers jsonb; v_job public.onedoc_jobs;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF nullif(current_setting('app.onedoc_job_id',true),'') IS NOT NULL THEN
      SELECT * INTO v_job FROM public.onedoc_jobs WHERE id = current_setting('app.onedoc_job_id',true)::uuid;
      v_uid := v_job.criado_por;
    ELSE
      v_headers := COALESCE(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
      IF nullif(v_headers->>'x-ouvidesk-autor','') IS NOT NULL THEN
        v_uid := (v_headers->>'x-ouvidesk-autor')::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_uid) THEN RAISE EXCEPTION 'Autor da alteração não encontrado'; END IF;
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT v_uid, p.nome, COALESCE(p.email, CASE WHEN v_uid=auth.uid() THEN auth.jwt()->>'email' END)
    FROM (SELECT 1) x LEFT JOIN public.profiles p ON p.id=v_uid;
END $$;
REVOKE ALL ON FUNCTION public.autor_registro_sistema() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.autor_registro_sistema() TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_alteracao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid; v_nome text; v_email text;
  v_old jsonb; v_new jsonb; v_campos text[] := '{}'; k text;
  v_ant jsonb := '{}'::jsonb; v_nov jsonb := '{}'::jsonb;
  v_id text; v_resumo text;
  ignorar text[] := ARRAY['updated_at','triagem_lock_por','triagem_lock_em'];
BEGIN
  IF TG_TABLE_NAME='licenca_estado' THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  IF TG_OP='UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF NOT (k=ANY(ignorar)) AND (v_old->k) IS DISTINCT FROM (v_new->k) THEN
        v_campos := v_campos || k;
        v_ant := v_ant || jsonb_build_object(k,v_old->k);
        v_nov := v_nov || jsonb_build_object(k,v_new->k);
      END IF;
    END LOOP;
    IF cardinality(v_campos)=0 THEN RETURN NULL; END IF;
  ELSIF TG_OP='INSERT' THEN v_nov:=v_new;
  ELSE v_ant:=v_old;
  END IF;
  v_id:=COALESCE(v_new->>'id',v_old->>'id');
  v_resumo:=COALESCE(v_new->>'numero',v_old->>'numero',v_new->>'nome',v_old->>'nome',v_new->>'email',v_old->>'email',v_new->>'role',v_old->>'role');
  SELECT a.autor_id,a.autor_nome,a.autor_email INTO v_uid,v_nome,v_email FROM public.autor_registro_sistema() a;
  IF v_uid IS NULL THEN
    IF TG_TABLE_NAME='protocolos' AND TG_OP='INSERT' AND (
      lower(COALESCE(v_new->>'origem',''))='email' OR
      COALESCE(v_new->>'descricao','') LIKE 'Nova Ouvidoria recebida.%' OR
      COALESCE(v_new->>'descricao','') LIKE 'Novo Pedido e-SIC recebido.%'
    ) THEN v_nome:='E-mail';
    ELSIF auth.role()='service_role' AND current_setting('app.agente_1doc',true)='on' THEN v_nome:='Agente 1Doc';
    ELSE v_nome:='Sistema (automático)'; END IF;
  END IF;
  INSERT INTO public.registro_sistema(tabela,operacao,registro_id,resumo,campos,dados_anteriores,dados_novos,autor_id,autor_nome,autor_email)
    VALUES(TG_TABLE_NAME,lower(TG_OP),v_id,v_resumo,v_campos,NULLIF(v_ant,'{}'::jsonb),NULLIF(v_nov,'{}'::jsonb),v_uid,v_nome,v_email);
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.registrar_alteracao() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_registro_sistema ON public.licenca_estado;

CREATE OR REPLACE FUNCTION public.aplicar_conferencia_1doc_job(p_job_id uuid,p_id uuid,p_patch jsonb,p_anterior jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO public AS $$
DECLARE v_job public.onedoc_jobs; v_contexto text := COALESCE(current_setting('app.onedoc_job_id',true),'');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Acesso restrito ao agente'; END IF;
  SELECT * INTO v_job FROM public.onedoc_jobs WHERE id=p_job_id;
  IF NOT FOUND OR v_job.status <> 'executando' OR NOT (p_id=ANY(v_job.protocolo_ids)) THEN RAISE EXCEPTION 'Ouvidoria fora do lote em execução'; END IF;
  PERFORM set_config('app.onedoc_job_id',p_job_id::text,true);
  PERFORM public.aplicar_conferencia_1doc(p_id,p_patch,p_anterior);
  PERFORM set_config('app.onedoc_job_id',v_contexto,true);
END $$;
REVOKE ALL ON FUNCTION public.aplicar_conferencia_1doc_job(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_conferencia_1doc_job(uuid,uuid,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';