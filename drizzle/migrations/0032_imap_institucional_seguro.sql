CREATE SCHEMA IF NOT EXISTS ouvidesk_private;
REVOKE ALL ON SCHEMA ouvidesk_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS ouvidesk_private.imap_key(id boolean PRIMARY KEY DEFAULT true CHECK(id),value text NOT NULL);
REVOKE ALL ON ouvidesk_private.imap_key FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN INSERT INTO ouvidesk_private.imap_key(id,value) VALUES(true,encode(extensions.gen_random_bytes(32),'hex')) ON CONFLICT DO NOTHING; END $$;
CREATE TABLE IF NOT EXISTS public.email_imap_secrets(account_id uuid PRIMARY KEY REFERENCES public.email_inbox_accounts(id) ON DELETE CASCADE,encrypted_password bytea NOT NULL);
REVOKE ALL ON public.email_imap_secrets FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.email_imap_secrets TO service_role;
ALTER TABLE public.email_imap_secrets ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.registrar_alteracao()'::regprocedure);
 IF position('v_old := v_old-' IN definition)=0 THEN
 definition:=replace(definition,'  IF TG_OP=''UPDATE'' THEN','  IF TG_TABLE_NAME=''email_inbox_accounts'' THEN v_old := v_old-''imap_password''; v_new := v_new-''imap_password''; END IF;'||chr(10)||'  IF TG_OP=''UPDATE'' THEN');
 EXECUTE definition;
 END IF;
 END $$;
CREATE OR REPLACE FUNCTION public.proteger_senha_imap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF NEW.imap_password IS NOT NULL THEN
 INSERT INTO public.email_imap_secrets(account_id,encrypted_password) VALUES(NEW.id,extensions.pgp_sym_encrypt(NEW.imap_password,(SELECT value FROM ouvidesk_private.imap_key WHERE id))) ON CONFLICT(account_id) DO UPDATE SET encrypted_password=EXCLUDED.encrypted_password;
 UPDATE public.email_inbox_accounts SET imap_password=NULL WHERE id=NEW.id;
 END IF;RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.proteger_senha_imap() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_proteger_senha_imap ON public.email_inbox_accounts;
CREATE TRIGGER trg_proteger_senha_imap AFTER INSERT OR UPDATE OF imap_password ON public.email_inbox_accounts FOR EACH ROW WHEN(NEW.imap_password IS NOT NULL) EXECUTE FUNCTION public.proteger_senha_imap();
DO $$ BEGIN
 UPDATE public.email_inbox_accounts SET imap_password=imap_password WHERE imap_password IS NOT NULL;
 UPDATE public.registro_sistema SET dados_anteriores=dados_anteriores-'imap_password',dados_novos=dados_novos-'imap_password',campos=array_remove(campos,'imap_password') WHERE tabela='email_inbox_accounts';
END $$;
CREATE OR REPLACE FUNCTION public.ler_senha_imap(p_account_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Acesso negado';END IF;
 RETURN(SELECT extensions.pgp_sym_decrypt(s.encrypted_password,k.value) FROM public.email_imap_secrets s CROSS JOIN ouvidesk_private.imap_key k WHERE s.account_id=p_account_id AND k.id);
END $$;
REVOKE ALL ON FUNCTION public.ler_senha_imap(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ler_senha_imap(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.salvar_conta_imap(p_email text,p_host text,p_port integer,p_user text,p_password text,p_descricao text,p_secretaria uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_id uuid;v_previous public.email_inbox_accounts;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(p_actor,'admin') THEN RAISE EXCEPTION 'Acesso negado';END IF;
 IF p_port NOT BETWEEN 1 AND 65535 OR nullif(p_host,'') IS NULL OR nullif(p_user,'') IS NULL OR nullif(p_password,'') IS NULL THEN RAISE EXCEPTION 'Configuração inválida';END IF;
 PERFORM pg_advisory_xact_lock(hashtext(lower(p_email)));
 SELECT * INTO v_previous FROM public.email_inbox_accounts WHERE email=lower(p_email) FOR UPDATE;v_id:=v_previous.id;
 IF v_id IS NULL THEN
 INSERT INTO public.email_inbox_accounts(email,provider,imap_host,imap_port,imap_user,imap_tls,descricao,secretaria_id,created_by) VALUES(lower(p_email),'imap',p_host,p_port,p_user,true,nullif(p_descricao,''),p_secretaria,p_actor) RETURNING id INTO v_id;
 ELSE
 IF(v_previous.imap_host,v_previous.imap_port,v_previous.imap_user,v_previous.provider) IS DISTINCT FROM(p_host,p_port,p_user,'imap'::text) THEN UPDATE public.email_inbox_accounts SET imap_uid_validity=NULL,imap_last_uid=NULL WHERE id=v_id;END IF;
 UPDATE public.email_inbox_accounts SET provider='imap',imap_host=p_host,imap_port=p_port,imap_user=p_user,imap_tls=true,descricao=nullif(p_descricao,''),secretaria_id=p_secretaria,ativo=true WHERE id=v_id;
 END IF;
 INSERT INTO public.email_imap_secrets(account_id,encrypted_password) VALUES(v_id,extensions.pgp_sym_encrypt(p_password,(SELECT value FROM ouvidesk_private.imap_key WHERE id))) ON CONFLICT(account_id) DO UPDATE SET encrypted_password=EXCLUDED.encrypted_password;
END $$;
REVOKE ALL ON FUNCTION public.salvar_conta_imap(text,text,integer,text,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_conta_imap(text,text,integer,text,text,text,uuid,uuid) TO service_role;
SELECT public.aplicar_bloqueio_licenca();
NOTIFY pgrst,'reload schema';