-- Credenciais cifradas; a chave fica fora dos schemas expostos pela API.
CREATE SCHEMA IF NOT EXISTS ouvidesk_private;
REVOKE ALL ON SCHEMA ouvidesk_private FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS ouvidesk_private.imap_key (id boolean PRIMARY KEY DEFAULT true CHECK(id), value text NOT NULL);
REVOKE ALL ON ouvidesk_private.imap_key FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO ouvidesk_private.imap_key(id,value) VALUES(true,encode(extensions.gen_random_bytes(32),'hex')) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.email_imap_secrets (
  account_id uuid PRIMARY KEY REFERENCES public.email_inbox_accounts(id) ON DELETE CASCADE,
  encrypted_password bytea NOT NULL
);
REVOKE ALL ON public.email_imap_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_imap_secrets TO service_role;
ALTER TABLE public.email_imap_secrets ENABLE ROW LEVEL SECURITY;
-- Sem policies: nem administradores do aplicativo podem ler o segredo pela API.

-- Limpa credenciais anteriores do registro, inclusive em objetos de insert/delete.
UPDATE public.registro_sistema SET
 dados_anteriores=dados_anteriores-'imap_password', dados_novos=dados_novos-'imap_password',
 campos=array_remove(campos,'imap_password') WHERE tabela='email_inbox_accounts';
CREATE OR REPLACE FUNCTION public.registrar_alteracao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_uid uuid; v_nome text; v_email text;
  v_old jsonb; v_new jsonb; v_campos text[] := '{}'; k text;
  v_ant jsonb := '{}'::jsonb; v_nov jsonb := '{}'::jsonb;
  v_id text; v_resumo text;
  ignorar text[] := ARRAY['updated_at','triagem_lock_por','triagem_lock_em','imap_password'];
BEGIN
  IF TG_TABLE_NAME='licenca_estado' THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  IF TG_TABLE_NAME='email_inbox_accounts' THEN
    v_old := v_old-'imap_password'; v_new := v_new-'imap_password';
  END IF;
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

CREATE OR REPLACE FUNCTION public.proteger_senha_imap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF NEW.imap_password IS NOT NULL THEN
   INSERT INTO public.email_imap_secrets(account_id,encrypted_password)
     VALUES(NEW.id,extensions.pgp_sym_encrypt(NEW.imap_password,(SELECT value FROM ouvidesk_private.imap_key WHERE id)))
     ON CONFLICT(account_id) DO UPDATE SET encrypted_password=EXCLUDED.encrypted_password;
   UPDATE public.email_inbox_accounts SET imap_password=NULL WHERE id=NEW.id;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.proteger_senha_imap() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_proteger_senha_imap ON public.email_inbox_accounts;
CREATE TRIGGER trg_proteger_senha_imap AFTER INSERT OR UPDATE OF imap_password ON public.email_inbox_accounts
 FOR EACH ROW WHEN(NEW.imap_password IS NOT NULL) EXECUTE FUNCTION public.proteger_senha_imap();
-- Migra contas antigas sem alterar usuário, senha ou cursores.
UPDATE public.email_inbox_accounts SET imap_password=imap_password WHERE imap_password IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ler_senha_imap(p_account_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 RETURN (SELECT extensions.pgp_sym_decrypt(s.encrypted_password,k.value)
 FROM public.email_imap_secrets s CROSS JOIN ouvidesk_private.imap_key k WHERE s.account_id=p_account_id AND k.id);
END $$;
REVOKE ALL ON FUNCTION public.ler_senha_imap(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ler_senha_imap(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.salvar_conta_imap(p_email text,p_host text,p_port integer,p_user text,p_password text,p_descricao text,p_secretaria uuid,p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_id uuid; v_previous public.email_inbox_accounts;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(p_actor,'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 IF p_port NOT BETWEEN 1 AND 65535 OR nullif(p_host,'') IS NULL OR nullif(p_user,'') IS NULL OR nullif(p_password,'') IS NULL THEN RAISE EXCEPTION 'Configuração inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(lower(p_email)));
 SELECT * INTO v_previous FROM public.email_inbox_accounts WHERE email=lower(p_email) FOR UPDATE;
 v_id:=v_previous.id;
 IF v_id IS NULL THEN
   INSERT INTO public.email_inbox_accounts(email,provider,imap_host,imap_port,imap_user,imap_tls,descricao,secretaria_id,created_by)
     VALUES(lower(p_email),'imap',p_host,p_port,p_user,true,nullif(p_descricao,''),p_secretaria,p_actor) RETURNING id INTO v_id;
 ELSE
   IF (v_previous.imap_host,v_previous.imap_port,v_previous.imap_user,v_previous.provider) IS DISTINCT FROM (p_host,p_port,p_user,'imap'::text) THEN
     UPDATE public.email_inbox_accounts SET imap_uid_validity=NULL,imap_last_uid=NULL WHERE id=v_id;
   END IF;
   UPDATE public.email_inbox_accounts SET provider='imap',imap_host=p_host,imap_port=p_port,imap_user=p_user,imap_tls=true,
     descricao=nullif(p_descricao,''),secretaria_id=p_secretaria,ativo=true WHERE id=v_id;
 END IF;
 INSERT INTO public.email_imap_secrets(account_id,encrypted_password)
   VALUES(v_id,extensions.pgp_sym_encrypt(p_password,(SELECT value FROM ouvidesk_private.imap_key WHERE id)))
   ON CONFLICT(account_id) DO UPDATE SET encrypted_password=EXCLUDED.encrypted_password;
END $$;
REVOKE ALL ON FUNCTION public.salvar_conta_imap(text,text,integer,text,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_conta_imap(text,text,integer,text,text,text,uuid,uuid) TO service_role;
SELECT public.aplicar_bloqueio_licenca();
NOTIFY pgrst,'reload schema';
