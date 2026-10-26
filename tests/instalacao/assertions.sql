-- Regras que já falharam em instalações novas.
INSERT INTO public.allowed_emails (email, nome, role) VALUES
  ('admin@teste.invalid', 'Admin', 'admin'), ('leitor@teste.invalid', 'Leitor', 'user');
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin@teste.invalid'),
  ('00000000-0000-0000-0000-0000000000b2', 'leitor@teste.invalid');
INSERT INTO public.secretarias (id, nome) VALUES ('00000000-0000-0000-0000-0000000000c3', 'Secretaria Teste');

DO $$
BEGIN
  -- Cadastro: perfil e papel criados pelo gatilho de novos usuários.
  ASSERT (SELECT count(*) FROM public.profiles WHERE id IN ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2')) = 2, 'perfis não criados';
  ASSERT public.has_role('00000000-0000-0000-0000-0000000000a1', 'admin'), 'admin sem papel admin';
  ASSERT NOT public.has_role('00000000-0000-0000-0000-0000000000b2', 'admin'), 'leitor virou admin';
END $$;

-- E-mail não autorizado não entra.
DO $$
BEGIN
  BEGIN
    INSERT INTO auth.users (email) VALUES ('intruso@teste.invalid');
    RAISE EXCEPTION 'e-mail não autorizado foi aceito';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'e-mail não autorizado foi aceito' THEN RAISE; END IF;
  END;
END $$;

-- Responsável inexistente (backup de outra instalação) é limpo sem perder dados.
SET session_replication_role = replica;
INSERT INTO public.email_inbox_accounts (id, email, created_by)
  VALUES ('00000000-0000-0000-0000-0000000000d4', 'caixa@teste.invalid', '00000000-0000-0000-0000-00000000dead');
INSERT INTO public.protocolos (numero, tipo, assunto, created_by, secretaria_id)
  VALUES ('9.999/2026', 'ouvidoria', 'Teste', '00000000-0000-0000-0000-00000000dead', '00000000-0000-0000-0000-0000000000c3');
SET session_replication_role = origin;
SELECT public.limpar_vinculos_usuarios_inexistentes();
DO $$
BEGIN
  ASSERT (SELECT created_by FROM public.email_inbox_accounts WHERE id = '00000000-0000-0000-0000-0000000000d4') IS NULL, 'conta de e-mail manteve responsável inexistente';
  ASSERT (SELECT created_by FROM public.protocolos WHERE numero = '9.999/2026') IS NULL, 'protocolo manteve responsável inexistente';
  ASSERT (SELECT count(*) FROM public.email_inbox_accounts) = 1, 'conta de e-mail apagada';
END $$;

-- Usuário comum lê secretarias (Saúde/Mapa) mas não vê a fila de atualização.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
SELECT set_config('request.jwt.claim.email', 'leitor@teste.invalid', false);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.secretarias) = 1, 'usuário comum não lê secretarias';
  ASSERT (SELECT count(*) FROM public.atualizacao_jobs) = 0, 'usuário comum lê a fila de atualização';
  ASSERT NOT public.pode_triar(), 'usuário somente leitura pode triar';
END $$;
RESET ROLE;
