-- Backup / restauração pelo painel (idempotente)

-- Durante a importação (app.importando = on) os gatilhos não alteram os dados restaurados
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.importando', true) = 'on' THEN RETURN NEW; END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stamp_triagem_conclusao()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.importando', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.triagem_pendente = true AND NEW.triagem_pendente = false THEN
    NEW.triagem_concluida_em := COALESCE(NEW.triagem_concluida_em, now());
    NEW.triagem_concluida_por := COALESCE(NEW.triagem_concluida_por, auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_protocolo_changes()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_nome text;
  campos text[] := ARRAY['numero','tipo','categoria','status','assunto','descricao','solicitante','secretaria_id','local_id','data_abertura','data_conclusao','data_prorrogacao','prorrogado','triagem_pendente'];
  campo text;
  v_old text;
  v_new text;
BEGIN
  IF current_setting('app.importando', true) = 'on' THEN RETURN NEW; END IF;
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT nome INTO v_nome FROM public.profiles WHERE id = v_uid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.protocolo_historico(protocolo_id, campo, valor_anterior, valor_novo, acao, autor_id, autor_nome)
    VALUES (NEW.id, '_criacao', NULL, NEW.numero, 'create', v_uid, v_nome);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOREACH campo IN ARRAY campos LOOP
      EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', campo, campo)
        INTO v_old, v_new USING OLD, NEW;
      IF v_old IS DISTINCT FROM v_new THEN
        INSERT INTO public.protocolo_historico(protocolo_id, campo, valor_anterior, valor_novo, acao, autor_id, autor_nome)
        VALUES (NEW.id, campo, v_old, v_new, 'update', v_uid, v_nome);
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.force_triagem_para_ouvidoria()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_assunto_norm text;
  v_forcar boolean := false;
  v_saude_triagem text[] := ARRAY[
    'demora em marcar consulta / procedimento',
    'falta de materiais em posto de saude',
    'falta de medicacao',
    'medicos',
    'postos de saude',
    'transporte para tratamento',
    'vacinas'
  ];
  v_termo text;
  v_casa_saude boolean := false;
  v_a_nome_norm text;
BEGIN
  IF current_setting('app.importando', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT'
     AND NEW.tipo = 'ouvidoria'
     AND auth.uid() IS NULL
  THEN
    v_assunto_norm := lower(translate(coalesce(NEW.assunto, ''),
      'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
      'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'));

    FOR v_a_nome_norm IN
      SELECT lower(translate(a.nome,
        'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
        'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'))
      FROM public.assuntos a
      WHERE a.ativo = true AND a.forcar_triagem = true
    LOOP
      IF position(v_a_nome_norm in v_assunto_norm) > 0 THEN
        v_forcar := true;
        EXIT;
      END IF;
    END LOOP;

    FOREACH v_termo IN ARRAY v_saude_triagem LOOP
      IF position(v_termo in v_assunto_norm) > 0 THEN
        v_casa_saude := true;
        EXIT;
      END IF;
    END LOOP;

    IF v_forcar OR NEW.secretaria_id IS NULL OR v_casa_saude THEN
      NEW.triagem_pendente := true;
    ELSE
      NEW.triagem_pendente := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed public.allowed_emails%ROWTYPE;
BEGIN
  IF current_setting('app.importando', true) = 'on' THEN RETURN NEW; END IF;
  SELECT * INTO v_allowed FROM public.allowed_emails WHERE lower(email) = lower(NEW.email) LIMIT 1;
  IF v_allowed.id IS NULL THEN
    RAISE EXCEPTION 'Email % nao autorizado a acessar o sistema', NEW.email;
  END IF;
  INSERT INTO public.profiles (id, nome, email) VALUES (
    NEW.id,
    COALESCE(v_allowed.nome, NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_allowed.role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Importa linhas de uma tabela (mantém IDs; atualiza se já existir)
CREATE OR REPLACE FUNCTION public.backup_importar(p_tabela text, p_rows jsonb)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cols text;
  v_sel text;
  v_set text;
  v_conf text;
  v_where text := '';
  n integer;
BEGIN
  IF p_tabela NOT IN ('secretarias','locais','secretaria_responsaveis','assuntos','profiles',
      'allowed_emails','user_roles','email_inbox_accounts','protocolos','protocolo_historico',
      'protocolos_antigos_conclusoes','email_inbox_log','coletas','ai_config') THEN
    RAISE EXCEPTION 'Tabela não permitida: %', p_tabela;
  END IF;
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN RETURN 0; END IF;
  PERFORM set_config('app.importando', 'on', true);

  SELECT
    string_agg(quote_ident(c.column_name), ',' ORDER BY c.ordinal_position),
    string_agg(
      CASE
        WHEN c.column_name IN ('created_by','updated_by') THEN
          format('(SELECT u.id FROM auth.users u WHERE u.id = r.%I)', c.column_name)
        WHEN c.column_name IN ('triagem_concluida_por','triagem_lock_por') THEN
          format('(SELECT x.id FROM public.profiles x WHERE x.id = r.%I)', c.column_name)
        WHEN c.column_name = 'responsavel_id' THEN
          '(SELECT x.id FROM public.secretaria_responsaveis x WHERE x.id = r.responsavel_id)'
        WHEN c.column_name = 'local_id' THEN
          '(SELECT x.id FROM public.locais x WHERE x.id = r.local_id)'
        WHEN c.column_name = 'secretaria_id' AND p_tabela NOT IN ('locais','secretaria_responsaveis') THEN
          '(SELECT x.id FROM public.secretarias x WHERE x.id = r.secretaria_id)'
        WHEN c.column_name = 'account_id' THEN
          '(SELECT x.id FROM public.email_inbox_accounts x WHERE x.id = r.account_id)'
        WHEN c.column_name = 'protocolo_id' AND p_tabela = 'email_inbox_log' THEN
          '(SELECT x.id FROM public.protocolos x WHERE x.id = r.protocolo_id)'
        ELSE 'r.' || quote_ident(c.column_name)
      END, ',' ORDER BY c.ordinal_position),
    string_agg(format('%1$I = EXCLUDED.%1$I', c.column_name), ',' ORDER BY c.ordinal_position)
      FILTER (WHERE c.column_name <> 'id')
  INTO v_cols, v_sel, v_set
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = p_tabela
    AND c.is_generated = 'NEVER'
    AND c.column_name IN (SELECT jsonb_object_keys(p_rows->0));

  IF p_tabela = 'protocolo_historico' THEN
    v_where := 'WHERE EXISTS (SELECT 1 FROM public.protocolos x WHERE x.id = r.protocolo_id)';
  ELSIF p_tabela IN ('locais','secretaria_responsaveis') THEN
    v_where := 'WHERE EXISTS (SELECT 1 FROM public.secretarias x WHERE x.id = r.secretaria_id)';
  ELSIF p_tabela = 'profiles' THEN
    v_where := 'WHERE EXISTS (SELECT 1 FROM auth.users x WHERE x.id = r.id)';
  ELSIF p_tabela = 'user_roles' THEN
    v_where := 'WHERE EXISTS (SELECT 1 FROM auth.users x WHERE x.id = r.user_id)';
  END IF;

  IF p_tabela IN ('user_roles','allowed_emails') OR v_set IS NULL THEN
    v_conf := 'ON CONFLICT DO NOTHING';
  ELSE
    v_conf := 'ON CONFLICT (id) DO UPDATE SET ' || v_set;
  END IF;

  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1) r %s %s',
    p_tabela, v_cols, v_sel, p_tabela, v_where, v_conf) USING p_rows;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

-- Lista os usuários de login com a senha já criptografada (hash)
CREATE OR REPLACE FUNCTION public.backup_exportar_usuarios()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'email', u.email, 'senha_hash', u.encrypted_password,
    'nome', u.raw_user_meta_data->>'nome', 'created_at', u.created_at)), '[]'::jsonb)
  FROM auth.users u WHERE u.email IS NOT NULL;
$function$;

-- Recria usuários de login com o mesmo ID e a mesma senha criptografada
CREATE OR REPLACE FUNCTION public.backup_importar_usuarios(p jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb;
  v_id uuid;
  v_hash text;
  ok integer := 0;
  pulados integer := 0;
BEGIN
  PERFORM set_config('app.importando', 'on', true);
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p, '[]'::jsonb)) LOOP
    v_id := (r->>'id')::uuid;
    v_hash := nullif(r->>'senha_hash', '');
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_id) THEN
      IF v_hash IS NOT NULL THEN
        UPDATE auth.users SET encrypted_password = v_hash WHERE id = v_id;
      END IF;
      ok := ok + 1;
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(r->>'email')) THEN
      pulados := pulados + 1;
      CONTINUE;
    END IF;
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      lower(r->>'email'),
      coalesce(v_hash, extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf'))),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nome', r->>'nome'),
      coalesce((r->>'created_at')::timestamptz, now()), now(), '', '', '', '');
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
    VALUES (gen_random_uuid(), v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', lower(r->>'email'), 'email_verified', true),
      'email', now(), now());
    ok := ok + 1;
  END LOOP;
  RETURN jsonb_build_object('importados', ok, 'pulados', pulados);
END;
$function$;

REVOKE ALL ON FUNCTION public.backup_importar(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_exportar_usuarios() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_importar_usuarios(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_importar(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_exportar_usuarios() TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_importar_usuarios(jsonb) TO service_role;
