-- OPERAÇÃO MANUAL DESTRUTIVA. NÃO colocar na pasta de migrations.
-- Executado apenas por limpar_para_importacao.sh após backup e confirmação.
BEGIN;
SET LOCAL lock_timeout = '15s';

-- Impede alterações concorrentes nos cadastros durante a comparação.
LOCK TABLE public.allowed_emails, public.profiles, public.user_roles,
  public.secretarias, public.locais, public.secretaria_responsaveis,
  public.assuntos, public.email_inbox_accounts, auth.users IN SHARE MODE;

CREATE TEMP TABLE preservados_antes (tabela text PRIMARY KEY, resumo text) ON COMMIT DROP;
DO $$ DECLARE t text; resumo text; BEGIN
  FOREACH t IN ARRAY ARRAY['public.allowed_emails','public.profiles','public.user_roles',
    'public.secretarias','public.locais','public.secretaria_responsaveis','public.assuntos',
    'public.email_inbox_accounts','auth.users'] LOOP
    EXECUTE format('SELECT md5(COALESCE(string_agg(j, ''|'' ORDER BY j), '''')) FROM (SELECT row_to_json(x)::text j FROM %s x) s', t) INTO resumo;
    INSERT INTO preservados_antes VALUES (t, resumo);
  END LOOP;
END $$;

-- RESTRICT: se outra tabela depender desses registros, aborta sem apagar nada.
-- Não zera usuários, locais, responsáveis, assuntos, secretarias nem contas/cursor de e-mail.
TRUNCATE TABLE public.email_inbox_log, public.protocolo_historico,
  public.protocolos_antigos_conclusoes, public.coletas, public.ai_config,
  public.protocolos RESTRICT;

DO $$ DECLARE r record; resumo text; BEGIN
  FOR r IN SELECT * FROM preservados_antes LOOP
    EXECUTE format('SELECT md5(COALESCE(string_agg(j, ''|'' ORDER BY j), '''')) FROM (SELECT row_to_json(x)::text j FROM %s x) s', r.tabela) INTO resumo;
    IF resumo IS DISTINCT FROM r.resumo THEN
      RAISE EXCEPTION 'Cadastro preservado foi alterado: %; limpeza cancelada.', r.tabela;
    END IF;
  END LOOP;
END $$;

DO $$ DECLARE t text; n bigint; BEGIN
  FOREACH t IN ARRAY ARRAY['protocolos','protocolo_historico','protocolos_antigos_conclusoes','email_inbox_log','coletas','ai_config'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'Tabela % não foi zerada; transação cancelada.', t; END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
