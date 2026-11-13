BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claim.sub','',true);
INSERT INTO public.email_inbox_accounts(id,email,provider,imap_password)
 VALUES('11000000-0000-0000-0000-000000000001','imap-security-test@example.org','imap',' synthetic password ');
DO $$ BEGIN
 ASSERT (SELECT imap_password IS NULL FROM public.email_inbox_accounts WHERE id='11000000-0000-0000-0000-000000000001'), 'Senha ficou exposta na conta';
 ASSERT public.ler_senha_imap('11000000-0000-0000-0000-000000000001')=' synthetic password ', 'Senha não foi preservada';
 ASSERT NOT EXISTS(SELECT 1 FROM public.registro_sistema WHERE tabela='email_inbox_accounts' AND (dados_novos ? 'imap_password' OR dados_anteriores ? 'imap_password')), 'Senha vazou no registro';
 ASSERT NOT has_table_privilege('authenticated','public.email_imap_secrets','SELECT'), 'Usuário pode ler senha cifrada';
 ASSERT NOT has_function_privilege('authenticated','public.ler_senha_imap(uuid)','EXECUTE'), 'Usuário pode decifrar senha';
 ASSERT NOT has_function_privilege('anon','public.ler_senha_imap(uuid)','EXECUTE'), 'Visitante pode decifrar senha';
 ASSERT NOT has_function_privilege('authenticated','public.salvar_conta_imap(text,text,integer,text,text,text,uuid,uuid)','EXECUTE'), 'Usuário pode contornar teste da conexão';
END $$;
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$ BEGIN
 BEGIN
   PERFORM public.ler_senha_imap('11000000-0000-0000-0000-000000000001');
   RAISE EXCEPTION 'Usuário não autorizado leu senha';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'Acesso negado' THEN RAISE; END IF;
 END;
END $$;
ROLLBACK;