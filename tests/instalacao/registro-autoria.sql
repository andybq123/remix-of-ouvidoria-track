BEGIN;
SELECT set_config('request.jwt.claim.sub','',true), set_config('request.jwt.claim.email','',true), set_config('request.jwt.claim.role','service_role',true);
INSERT INTO public.protocolos(id,numero,tipo,assunto,origem,created_by)
VALUES('10000000-0000-0000-0000-000000000001','81.001/2026','ouvidoria','Teste autoria','email','00000000-0000-0000-0000-0000000000a1');
DO $$ BEGIN
  ASSERT EXISTS(SELECT 1 FROM public.registro_sistema WHERE registro_id='10000000-0000-0000-0000-000000000001' AND operacao='insert' AND autor_nome='E-mail' AND autor_id IS NULL), 'criação por e-mail atribuída ao dono da conta';
END $$;

-- Edição comum: nem o criador original nem um cabeçalho forjado substituem a sessão.
SELECT set_config('request.jwt.claim.role','authenticated',true), set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true), set_config('request.headers','{"x-ouvidesk-autor":"00000000-0000-0000-0000-0000000000a1"}',true);
UPDATE public.protocolos SET assunto='Editado pelo leitor' WHERE id='10000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  ASSERT EXISTS(SELECT 1 FROM public.registro_sistema WHERE registro_id='10000000-0000-0000-0000-000000000001' AND dados_novos->>'assunto'='Editado pelo leitor' AND autor_id='00000000-0000-0000-0000-0000000000b2' AND autor_email='leitor@teste.invalid'), 'não identificou o editor real';
END $$;

-- Alteração administrativa pelo servidor: autor verificado, sem identidade na sessão de serviço.
SELECT set_config('request.jwt.claim.role','service_role',true), set_config('request.jwt.claim.sub','',true);
UPDATE public.protocolos SET assunto='Editado pelo admin' WHERE id='10000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  ASSERT EXISTS(SELECT 1 FROM public.registro_sistema WHERE registro_id='10000000-0000-0000-0000-000000000001' AND dados_novos->>'assunto'='Editado pelo admin' AND autor_id='00000000-0000-0000-0000-0000000000a1' AND autor_email='admin@teste.invalid'), 'servidor perdeu autoria';
END $$;

-- Importação não atribui alterações ao criador vindo do backup.
SELECT set_config('app.importando','on',true);
UPDATE public.protocolos SET assunto='Importado' WHERE id='10000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  ASSERT EXISTS(SELECT 1 FROM public.registro_sistema WHERE registro_id='10000000-0000-0000-0000-000000000001' AND dados_novos->>'assunto'='Importado' AND autor_id='00000000-0000-0000-0000-0000000000a1'), 'importação perdeu autoria';
END $$;
SELECT set_config('app.importando','',true);

-- Automação não herda o autor da requisição anterior.
SELECT set_config('request.headers','{}',true);
UPDATE public.protocolos SET assunto='Automático' WHERE id='10000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  ASSERT EXISTS(SELECT 1 FROM public.registro_sistema WHERE registro_id='10000000-0000-0000-0000-000000000001' AND dados_novos->>'assunto'='Automático' AND autor_id IS NULL AND autor_nome='Sistema (automático)'), 'autoria vazou entre requisições';
END $$;

-- Agente: usuário que solicitou o lote, derivado da fila; histórico reversível preservado.
INSERT INTO public.onedoc_jobs(id,tipo,status,protocolo_ids,total,criado_por)
VALUES('10000000-0000-0000-0000-000000000002','unitario','executando',ARRAY['10000000-0000-0000-0000-000000000001'::uuid],1,'00000000-0000-0000-0000-0000000000a1');
SELECT public.aplicar_conferencia_1doc_job('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','{"endereco":"Rua de teste"}','{"endereco":null}');
DO $$ BEGIN
  ASSERT EXISTS(SELECT 1 FROM public.registro_sistema WHERE registro_id='10000000-0000-0000-0000-000000000001' AND dados_novos->>'endereco'='Rua de teste' AND autor_id='00000000-0000-0000-0000-0000000000a1'), 'lote perdeu usuário solicitante';
  ASSERT EXISTS(SELECT 1 FROM public.protocolo_historico WHERE protocolo_id='10000000-0000-0000-0000-000000000001' AND campo='endereco' AND autor_nome='Agente 1Doc'), 'quebrou identificação para reversão';
  BEGIN
    PERFORM public.aplicar_conferencia_1doc_job('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000099','{}','{}');
    RAISE EXCEPTION 'aceitou protocolo fora do lote';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM='Ouvidoria fora do lote em execução', 'validação de lote incorreta';
  END;
END $$;

-- Estado da licença nunca gera registro, mesmo quando muda.
DO $$ DECLARE n bigint; BEGIN
  SELECT count(*) INTO n FROM public.registro_sistema WHERE tabela='licenca_estado';
  UPDATE public.licenca_estado SET motivo='teste autoria' WHERE id=1;
  ASSERT (SELECT count(*) FROM public.registro_sistema WHERE tabela='licenca_estado')=n, 'licença apareceu no registro';
END $$;
ROLLBACK;