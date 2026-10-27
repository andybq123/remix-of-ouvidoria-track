-- Dados de teste existem somente neste PostgreSQL temporário.
BEGIN;
SET session_replication_role = replica;
INSERT INTO public.secretarias(id,nome) VALUES
 ('10000000-0000-0000-0000-000000000001','Obras Paginação'),
 ('10000000-0000-0000-0000-000000000002','Área Oculta');
INSERT INTO public.protocolos(numero,tipo,assunto,descricao,resolucao,endereco,data_abertura,secretaria_id,triagem_pendente)
SELECT (20000+n)::text||'/2026','ouvidoria','Paginação '||n,'Descrição completa','Resolução preservada',
 'Rua São João','2026-10-01','10000000-0000-0000-0000-000000000001',false FROM generate_series(1,65) n;
INSERT INTO public.protocolos(numero,tipo,assunto,data_abertura,secretaria_id,triagem_pendente,status,origem) VALUES
 ('21000/2026','ouvidoria','Conclusão Paginação','2026-09-01','10000000-0000-0000-0000-000000000001',false,'concluido',NULL),
 ('22000/2026','ouvidoria','Oculto Paginação','2026-10-01','10000000-0000-0000-0000-000000000002',false,'aberto',NULL),
 ('23000/2026','ouvidoria','Triagem Paginação','2026-10-01','10000000-0000-0000-0000-000000000001',true,'aberto',NULL),
 ('24000/2025','ouvidoria','Antigo Paginação','2025-10-01','10000000-0000-0000-0000-000000000001',false,'concluido','antigo:teste');
SET session_replication_role = origin;
INSERT INTO public.user_secretarias(email,secretaria_id) VALUES ('leitor@teste.invalid','10000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',true);
SELECT set_config('request.jwt.claim.email','leitor@teste.invalid',true);
DO $$
DECLARE a jsonb; b jsonb; c jsonb;
BEGIN
 a := public.listar_protocolos_pagina('{"mes":"all"}');
 b := public.listar_protocolos_pagina('{"mes":"all","pagina":2}');
 ASSERT jsonb_array_length(a->'items')=50, 'primeira página não tem 50';
 ASSERT jsonb_array_length(b->'items')=15, 'segunda página não tem 15';
 ASSERT (a->>'total')::int=65, 'total não respeita filtros ou áreas';
 ASSERT a->'items'->0->>'numero'='20065/2026', 'ordem numérica global incorreta';
 ASSERT b->'items'->0->>'numero'='20015/2026', 'ordem incorreta entre páginas';
 ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a->'items') x JOIN jsonb_array_elements(b->'items') y ON x->>'id'=y->>'id'), 'páginas repetem registros';
 ASSERT NOT (a->'items'->0 ?| ARRAY['resolucao','endereco','detalhes','contato_solicitante','latitude','url']), 'listagem devolve campos não exibidos';
 c := public.listar_protocolos_pagina('{"mes":"2026-09","busca":"rua sao joao paginacao"}');
 ASSERT (c->>'total')::int=65, 'busca sem acentos global falhou';
 c := public.listar_protocolos_pagina('{"mes":"all","busca":"21.000/2026"}');
 ASSERT (c->>'total')::int=1 AND c->'items'->0->>'status'='concluido', 'busca numérica não recupera concluído';
 c := public.listar_protocolos_pagina('{"mes":"all","busca":"Conclusão"}');
 ASSERT (c->>'total')::int=0, 'concluído visível por assunto sem filtro';
 c := public.listar_protocolos_pagina('{"mes":"antigos"}');
 ASSERT (c->>'total')::int=1 AND c->'items'->0->>'numero'='24000/2025', 'antigos misturados';
 c := public.listar_protocolos_pagina('{"mes":"all","pagina":999}');
 ASSERT (c->>'pagina')::int=2, 'página removida não recuperada';
 c := public.listar_protocolos_pagina('{"mes":"all","dataIni":"2026-10-01","dataFim":"2026-10-01"}');
 ASSERT (c->>'total')::int=65, 'datas inclusivas falharam';
 ASSERT NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.listar_protocolos_pagina(jsonb)'::regprocedure AND prosecdef), 'consulta ignora RLS';
 ASSERT NOT has_function_privilege('anon','public.listar_protocolos_pagina(jsonb)','EXECUTE'), 'consulta disponível sem login';
END $$;
RESET ROLE;
ROLLBACK;