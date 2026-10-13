DO $$ DECLARE t text; n int; BEGIN
  FOREACH t IN ARRAY ARRAY['protocolos','protocolo_historico','protocolos_antigos_conclusoes','email_inbox_log','coletas','ai_config'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    ASSERT n = 0, 'Tabela operacional não zerada: ' || t;
  END LOOP;
  ASSERT (SELECT encrypted_password = 'hash-ficticio' FROM auth.users), 'Conta/senha alterada';
  ASSERT (SELECT count(*) = 1 FROM public.profiles), 'Perfis apagados';
  ASSERT (SELECT count(*) = 1 FROM public.user_roles), 'Permissões apagadas';
  ASSERT (SELECT count(*) = 1 FROM public.allowed_emails), 'Emails de login apagados';
  ASSERT (SELECT count(*) = 1 FROM public.secretarias), 'Secretarias apagadas';
  ASSERT (SELECT count(*) = 1 FROM public.locais), 'Locais apagados';
  ASSERT (SELECT count(*) = 1 FROM public.secretaria_responsaveis), 'Responsáveis apagados';
  ASSERT (SELECT count(*) = 1 FROM public.assuntos), 'Assuntos apagados';
  ASSERT (SELECT imap_password = 'senha-ficticia' AND gmail_history_id = 'cursor-preservado' AND imap_last_uid = 123 FROM public.email_inbox_accounts), 'Conta/cursor email alterado';
END $$;
