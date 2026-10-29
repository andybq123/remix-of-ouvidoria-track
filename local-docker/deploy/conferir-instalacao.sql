-- Conferência do banco após instalar/atualizar. Falha com mensagem clara se
-- faltar algo que já causou erro em instalações novas.
DO $$
DECLARE
  faltando text[] := '{}';
  t text;
  f text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','user_roles','allowed_emails','secretarias','locais','assuntos','protocolos',
    'protocolo_historico','user_secretarias','user_locais','registro_sistema','email_inbox_accounts',
    'email_inbox_log','onedoc_jobs','onedoc_config','atualizacao_jobs','ai_config','coletas','licenca_estado'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN faltando := faltando || ('tabela ' || t); END IF;
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'has_role(uuid,app_role)','posso_editar()','pode_triar()','area_permitida(uuid,uuid)',
    'registrar_alteracao()','autor_registro_sistema()','aplicar_conferencia_1doc_job(uuid,uuid,jsonb,jsonb)','dashboard_protocolos()','handle_new_user()','limpar_vinculos_usuarios_inexistentes()',
    'backup_importar(text,jsonb)','backup_importar_usuarios(jsonb)','licenca_bloqueada()','bloquear_se_licenca()',
    'listar_protocolos_pagina(jsonb)','meses_protocolos_listagem()','normalizar_busca_protocolo(text)'
  ] LOOP
    IF to_regprocedure('public.' || f) IS NULL THEN faltando := faltando || ('função ' || f); END IF;
  END LOOP;

  -- Leitura de secretarias/locais por usuários comuns (telas Saúde e Mapa vazias sem isso).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='secretarias' AND 'authenticated' = ANY(roles) AND cmd IN ('SELECT','ALL')) THEN
    faltando := faltando || 'regra de leitura de secretarias'::text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='locais' AND 'authenticated' = ANY(roles) AND cmd IN ('SELECT','ALL')) THEN
    faltando := faltando || 'regra de leitura de locais'::text;
  END IF;

  -- Toda tabela do sistema precisa de proteção de acesso por linha.
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity LOOP
    faltando := faltando || ('proteção de acesso na tabela ' || t);
  END LOOP;

  -- Cadastro de usuários: o gatilho que cria perfil e papel no primeiro login.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created' AND tgrelid = 'auth.users'::regclass) THEN
    faltando := faltando || 'gatilho de novos usuários'::text;
  END IF;

  -- Registro do sistema em protocolos.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
                 WHERE tg.tgrelid = 'public.protocolos'::regclass AND p.proname = 'registrar_alteracao') THEN
    faltando := faltando || 'registro do sistema em protocolos'::text;
  END IF;

  IF array_length(faltando, 1) > 0 THEN
    RAISE EXCEPTION 'Instalação incompleta. Faltando: %', array_to_string(faltando, '; ');
  END IF;
END $$;
