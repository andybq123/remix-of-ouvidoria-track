BEGIN;
SELECT set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
INSERT INTO public.atualizacao_jobs(id,status,created_at) VALUES
 ('12000000-0000-0000-0000-000000000001','pendente',now()-interval '2 minutes'),
 ('12000000-0000-0000-0000-000000000002','rodando',now()-interval '2 minutes'),
 ('12000000-0000-0000-0000-000000000003','pendente',now());
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT public.cancelar_atualizacao_pendente('12000000-0000-0000-0000-000000000001'), 'Admin não cancelou fila antiga';
 ASSERT NOT public.cancelar_atualizacao_pendente('12000000-0000-0000-0000-000000000001'), 'Cancelamento repetido alterou pedido';
 ASSERT NOT public.cancelar_atualizacao_pendente('12000000-0000-0000-0000-000000000002'), 'Cancelou atualização em execução';
 ASSERT NOT public.cancelar_atualizacao_pendente('12000000-0000-0000-0000-000000000003'), 'Cancelou pedido recente';
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
DO $$ BEGIN
 BEGIN
  PERFORM public.cancelar_atualizacao_pendente('12000000-0000-0000-0000-000000000003');
  RAISE EXCEPTION 'Usuário comum cancelou atualização';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Acesso negado' THEN RAISE; END IF;
 END;
END $$;
ROLLBACK;