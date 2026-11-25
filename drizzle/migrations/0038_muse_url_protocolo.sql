-- 0038_muse_url_protocolo.sql
-- Link do 1Doc editável pela integração Muse (PATCH /api/public/muse/protocolo/{id}).
--
-- Igual à 0036, mais o campo `url` na allow-list da RPC aplicar_edicao_muse
-- e na lista de campos auditados do trigger log_protocolo_changes (a
-- mudança de link passa a aparecer em protocolo_historico com autor
-- "Muse", como os demais campos). O resto das duas funções é idêntico
-- ao da 0036: CREATE OR REPLACE, sem tabela nova.
--
-- Por que o campo existe: 9 ouvidorias guardam link errado do 1Doc
-- (rastreador el.1docmail.com.br que o agente não resolve, ou hash
-- antigo que abre outra página) e o agente 1Doc falha a conferência
-- delas antes mesmo de ler o conteúdo — o job de 25/11/2026 errou as
-- 9 por causa do link. O PATCH valida o host (brusque.1doc.com.br ou
-- el.1docmail.com.br) antes de chegar aqui; a RPC só autoriza o campo.
--
-- Aplicar no banco da VPS junto com o deploy (mesmo processo manual
-- das migrações 0034/0035). Sem ela, o PATCH com `url` responde 500
-- ("Campo não autorizado"); os demais campos continuam funcionando.

-- Reposição da função do trigger com o campo `url` na lista auditada
-- (corpo idêntico ao da 0036, mais 'url' em `campos`). O trigger
-- trg_log_protocolo_changes continua o mesmo.
CREATE OR REPLACE FUNCTION public.log_protocolo_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_nome text;
  campos text[] := ARRAY['numero','tipo','categoria','status','assunto','descricao','solicitante','secretaria_id','local_id','data_abertura','data_conclusao','data_prorrogacao','prorrogado','triagem_pendente','endereco','latitude','longitude','url'];
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

CREATE OR REPLACE FUNCTION public.aplicar_edicao_muse(p_id uuid, p_patch jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO public AS $$
DECLARE p public.protocolos; novo public.protocolos; k text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Acesso restrito ao agente'; END IF;
  SELECT * INTO p FROM public.protocolos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Protocolo não encontrado'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (k = ANY(ARRAY['endereco','latitude','longitude','assunto','descricao','solicitante','categoria','secretaria_id','local_id','url'])) THEN RAISE EXCEPTION 'Campo não autorizado'; END IF;
  END LOOP;
  IF p_patch ? 'secretaria_id' AND (p_patch->>'secretaria_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.secretarias WHERE id = (p_patch->>'secretaria_id')::uuid) THEN RAISE EXCEPTION 'Secretaria não encontrada'; END IF;
  IF p_patch ? 'local_id' AND (p_patch->>'local_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.locais WHERE id = (p_patch->>'local_id')::uuid) THEN RAISE EXCEPTION 'Local não encontrado'; END IF;
  novo := jsonb_populate_record(p, p_patch);
  PERFORM set_config('app.muse','on',true);
  UPDATE public.protocolos SET endereco=novo.endereco,latitude=novo.latitude,longitude=novo.longitude,assunto=novo.assunto,descricao=novo.descricao,solicitante=novo.solicitante,categoria=novo.categoria,secretaria_id=novo.secretaria_id,local_id=novo.local_id,url=novo.url WHERE id=p_id;
  PERFORM set_config('app.muse','',true);
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_edicao_muse(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_edicao_muse(uuid,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
