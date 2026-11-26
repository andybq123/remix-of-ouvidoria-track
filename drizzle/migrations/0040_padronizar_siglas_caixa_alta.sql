-- 0040_padronizar_siglas_caixa_alta.sql
--
-- Padronização das secretarias e locais pelo Dicionário de Siglas da
-- Prefeitura Municipal de Brusque (base de referência da Ouvidoria).
--
-- Padrão adotado: nome "SIGLA - NOME COMPLETO" em caixa alta e sigla
-- preenchida em secretarias.sigla. Locais que espelham a secretaria
-- seguem o novo nome dela; os demais locais só passam para caixa alta.
-- Secretarias sem correspondência no dicionário mantêm o nome como
-- está, só em caixa alta (decisão do usuário, 2026-11-26). Nada de
-- novo é criado: itens do dicionário sem correspondência no sistema
-- ficam fora (ver siglas-comparacao.md, Lista B).
--
-- Idempotente: UPDATE por id. Em base nova sem essas linhas, afeta
-- 0 linhas e não falha. Sem UNIQUE em secretarias.nome / locais.nome,
-- não há risco de colisão de nomes.
--

-- Secretarias com correspondência segura no dicionário (18)
UPDATE public.secretarias SET nome = 'CM - CONTROLADORIA MUNICIPAL', sigla = 'CM' WHERE id = '21ae7718-d184-478e-bcba-99f8358bc2a4'; -- era: Controladoria
UPDATE public.secretarias SET nome = 'FCB - FUNDAÇÃO CULTURAL DE BRUSQUE', sigla = 'FCB' WHERE id = 'd5f7fc80-a984-4a30-b4fb-e46d665dfcc8'; -- era: Fundação Cultural
UPDATE public.secretarias SET nome = 'FUNDEMA - FUNDAÇÃO MUNICIPAL DO MEIO AMBIENTE', sigla = 'FUNDEMA' WHERE id = '32bd802f-dce9-4331-ad65-a3b9923212a7'; -- era: Fundema
UPDATE public.secretarias SET nome = 'GAB - GABINETE DO PREFEITO', sigla = 'GAB' WHERE id = '6881fe64-6787-446a-abfe-b53d863e418a'; -- era: Gabinete Prefeito
UPDATE public.secretarias SET nome = 'IBPREV - INSTITUTO BRUSQUENSE DE PREVIDÊNCIA', sigla = 'IBPREV' WHERE id = '1fd5e11f-b1a2-4b08-afae-a835aa6f80a0'; -- era: IBPREV
UPDATE public.secretarias SET nome = 'PGM - PROCURADORIA-GERAL DO MUNICÍPIO', sigla = 'PGM' WHERE id = '6854c183-14ee-40d5-accd-087ac397dc08'; -- era: Procuradoria
UPDATE public.secretarias SET nome = 'SAGE - SECRETARIA DE ADMINISTRAÇÃO E GESTÃO ESTRATÉGICA', sigla = 'SAGE' WHERE id = '22944b3f-d765-408d-bbc3-53e61e17519b'; -- era: SAGE - Gestão Estratégica
UPDATE public.secretarias SET nome = 'SDS - SECRETARIA DE DESENVOLVIMENTO SOCIAL', sigla = 'SDS' WHERE id = 'cb312077-c139-4250-a720-384a926bcc00'; -- era: SDS - Assistencia Social
UPDATE public.secretarias SET nome = 'SEDU - SECRETARIA DE EDUCAÇÃO', sigla = 'SEDU' WHERE id = 'da72fc0b-adeb-43ad-88c7-aef1b2f49bea'; -- era: SEDU - Educação
UPDATE public.secretarias SET nome = 'SEFAZ - SECRETARIA DE FAZENDA', sigla = 'SEFAZ' WHERE id = '6bfeb043-b317-4cac-8c72-9c79ce47ef3d'; -- era: SEFAZ
UPDATE public.secretarias SET nome = 'SEPLAN - SECRETARIA DE PLANEJAMENTO URBANO', sigla = 'SEPLAN' WHERE id = '2a5d15e9-51f7-446e-9b08-030b6809e0c9'; -- era: SEPLAN
UPDATE public.secretarias SET nome = 'SETRAM - SECRETARIA DE TRÂNSITO E MOBILIDADE', sigla = 'SETRAM' WHERE id = 'c46dca1d-e82d-4641-9d7f-10d06a8e70b5'; -- era: SETRAM
UPDATE public.secretarias SET nome = 'SIE - SECRETARIA DE INFRAESTRUTURA ESTRATÉGICA', sigla = 'SIE' WHERE id = 'd5e0f7b4-d23c-452c-a391-92d4cd87916c'; -- era: SIE - Infraestrutura Estratégica
UPDATE public.secretarias SET nome = 'SOSU - SECRETARIA DE OBRAS E SERVIÇOS URBANOS', sigla = 'SOSU' WHERE id = 'e76d4ff2-976f-43ca-8704-2a9edab80155'; -- era: SOSU - Obras
UPDATE public.secretarias SET nome = 'SPCC - SECRETARIA DE PARCERIAS, CONCESSÕES E CONVÊNIOS', sigla = 'SPCC' WHERE id = 'd092d787-28a6-4f12-99ee-0281b4f3e969'; -- era: SPCC - Parcerias, Concessões e Convênios
UPDATE public.secretarias SET nome = 'SRI - SECRETARIA DE RELAÇÕES INSTITUCIONAIS', sigla = 'SRI' WHERE id = 'df33ad2a-6d8d-4fba-9410-a87ed0847e74'; -- era: SRI - Relações Institucionais
UPDATE public.secretarias SET nome = 'SMS - SECRETARIA DE SAÚDE', sigla = 'SMS' WHERE id = '8ee7bf01-4cde-494c-8e99-92d3ccabb0f5'; -- era: Saúde
UPDATE public.secretarias SET nome = 'SETA - SECRETARIA DE TRANSPARÊNCIA E ACCOUNTABILITY', sigla = 'SETA' WHERE id = '675bac97-0f80-49ca-b401-ceb90d7f5a69'; -- era: Secretaria de Transparencia e Accountabillity

-- Secretarias sem correspondência: mantêm o nome, só em caixa alta (11)
UPDATE public.secretarias SET nome = 'ADMINISTRAÇÃO/SAMAE' WHERE id = 'd01fc170-5c68-49a7-b4c0-cb7e5287f765'; -- era: Administração/SAMAE
UPDATE public.secretarias SET nome = 'BEM-ESTAR ANIMAL' WHERE id = '357cef27-5592-4ce4-8b03-d8a644b40c55'; -- era: Bem-Estar Animal
UPDATE public.secretarias SET nome = 'COMISSÃO DE ÉTICA' WHERE id = '47a03e8c-33f6-41e0-a5e7-f88968e5913f'; -- era: Comissão de Ética
UPDATE public.secretarias SET nome = 'DEFESA CIVIL' WHERE id = '5a4b2fa5-c0ba-48cd-af34-ac4c312e004b'; -- era: Defesa Civil
UPDATE public.secretarias SET nome = 'ESPORTES' WHERE id = '42ed065c-0d48-4151-a2c0-9c2e224e9f83'; -- era: Esportes
UPDATE public.secretarias SET nome = 'HORTO' WHERE id = '69b0d6e9-9aa5-4147-ab5c-66d9e528eb0b'; -- era: Horto
UPDATE public.secretarias SET nome = 'LICITAÇÃO E COMPRAS' WHERE id = '5258c08b-31d3-4174-99d2-eee0959d9a34'; -- era: Licitação e Compras
UPDATE public.secretarias SET nome = 'PATRIMONIO' WHERE id = '7eeb665e-ff09-4890-91da-6d7936d479e0'; -- era: Patrimonio
UPDATE public.secretarias SET nome = 'SDE - DESENVOLVIMENTO ECONOMICO' WHERE id = '4c8b109a-304f-47ee-85f8-9d85ca95dbe8'; -- era: SDE - Desenvolvimento Economico
UPDATE public.secretarias SET nome = 'SETOR DE TESOURARIA' WHERE id = 'cd1481d6-5c64-468f-8bba-795ea1048d47'; -- era: Setor de Tesouraria
UPDATE public.secretarias SET nome = 'TURISMO' WHERE id = '9c8f9abf-d3a1-4122-8020-9874e36c764b'; -- era: Turismo

-- Locais (espelhos seguem a secretaria; demais, só caixa alta)
UPDATE public.locais SET nome = 'ADMINISTRAÇÃO/SAMAE' WHERE id = 'e38296c8-7978-4834-aeed-f4a1e83ad75d'; -- [Administração/SAMAE] era: Administração/SAMAE
UPDATE public.locais SET nome = 'BEM-ESTAR ANIMAL' WHERE id = '10e1afdf-8791-46df-9bfc-94dc6ba36a78'; -- [Bem-Estar Animal] era: Bem-Estar Animal
UPDATE public.locais SET nome = 'COMISSÃO DE ÉTICA' WHERE id = 'cf8374a1-e7fc-444d-88c6-2b1e7395348f'; -- [Comissão de Ética] era: Comissão de Ética
UPDATE public.locais SET nome = 'CM - CONTROLADORIA MUNICIPAL' WHERE id = 'c6f498bc-880d-48db-b478-feaecf51450c'; -- [Controladoria] era: Controladoria
UPDATE public.locais SET nome = 'DEFESA CIVIL' WHERE id = '6ffd84c7-a70e-48c9-8115-d8b4a343729a'; -- [Defesa Civil] era: Defesa Civil
UPDATE public.locais SET nome = 'ESPORTES' WHERE id = 'db38a7b9-7a0f-4562-9848-e23557531008'; -- [Esportes] era: Esportes
UPDATE public.locais SET nome = 'FCB - FUNDAÇÃO CULTURAL DE BRUSQUE' WHERE id = '393b981f-5443-4743-8d47-e15a63b7eea7'; -- [Fundação Cultural] era: Fundação Cultural
UPDATE public.locais SET nome = 'FUNDEMA - FUNDAÇÃO MUNICIPAL DO MEIO AMBIENTE' WHERE id = '3325bc47-7af3-444f-8965-65791d799668'; -- [Fundema] era: Fundema
UPDATE public.locais SET nome = 'GAB - GABINETE DO PREFEITO' WHERE id = 'c02ff116-12b3-43f6-8a81-683dc4f27470'; -- [Gabinete Prefeito] era: Gabinete Prefeito
UPDATE public.locais SET nome = 'HORTO' WHERE id = '1a4e0763-9c49-461a-8a53-b63e7770afcb'; -- [Horto] era: Horto
UPDATE public.locais SET nome = 'IBPREV - INSTITUTO BRUSQUENSE DE PREVIDÊNCIA' WHERE id = 'b0fe3d42-5d07-405f-9c88-f4e12702a7c5'; -- [IBPREV] era: IBPREV
UPDATE public.locais SET nome = 'LICITAÇÃO E COMPRAS' WHERE id = '09a7f112-b8d2-4de8-b829-07ee9db715f5'; -- [Licitação e Compras] era: Licitação e Compras
UPDATE public.locais SET nome = 'PATRIMONIO' WHERE id = '613c5318-2f42-4127-a659-69cdd9ee887e'; -- [Patrimonio] era: Patrimonio
UPDATE public.locais SET nome = 'PGM - PROCURADORIA-GERAL DO MUNICÍPIO' WHERE id = 'c99f46c0-5fdd-4d88-9a77-806f03d8d365'; -- [Procuradoria] era: Procuradoria
UPDATE public.locais SET nome = 'SAGE - SECRETARIA DE ADMINISTRAÇÃO E GESTÃO ESTRATÉGICA' WHERE id = 'a1ee489c-d9f3-4052-850e-1785d40ee599'; -- [SAGE - Gestão Estratégica] era: SAGE - Gestão Estratégica
UPDATE public.locais SET nome = 'SDE - DESENVOLVIMENTO ECONOMICO' WHERE id = 'ef49769f-eda1-4c9f-9ba9-ef7c5773d055'; -- [SDE - Desenvolvimento Economico] era: SDE - Desenvolvimento Economico
UPDATE public.locais SET nome = 'SDS - SECRETARIA DE DESENVOLVIMENTO SOCIAL' WHERE id = '0c40c11a-e75c-4279-b9ed-dc526ff70526'; -- [SDS - Assistencia Social] era: SDS - Assistencia Social
UPDATE public.locais SET nome = 'SEDU - SECRETARIA DE EDUCAÇÃO' WHERE id = '28c0bc25-04e2-4ce1-8062-8713bfa604c5'; -- [SEDU - Educação] era: SEDU - Educação
UPDATE public.locais SET nome = 'SEFAZ - SECRETARIA DE FAZENDA' WHERE id = 'c97a5f89-37b3-4094-a3c7-70e19f2ed8b6'; -- [SEFAZ] era: SEFAZ
UPDATE public.locais SET nome = 'SEPLAN - SECRETARIA DE PLANEJAMENTO URBANO' WHERE id = 'b60ceb67-d8cb-420a-93a9-e37660bfb6d5'; -- [SEPLAN] era: SEPLAN
UPDATE public.locais SET nome = 'SETRAM - SECRETARIA DE TRÂNSITO E MOBILIDADE' WHERE id = '1a097ba1-767f-4d52-8e64-74e9815ac845'; -- [SETRAM] era: SETRAM
UPDATE public.locais SET nome = 'SIE - SECRETARIA DE INFRAESTRUTURA ESTRATÉGICA' WHERE id = '0dfcf708-b2c1-4945-a2eb-a2294ae00f76'; -- [SIE - Infraestrutura Estratégica] era: SIE - Infraestrutura Estratégica
UPDATE public.locais SET nome = 'SOSU - SECRETARIA DE OBRAS E SERVIÇOS URBANOS' WHERE id = '43154ff4-19b5-4fd7-b6b1-0bc30ae2fae7'; -- [SOSU - Obras] era: SOSU - Obras
UPDATE public.locais SET nome = 'SPCC - SECRETARIA DE PARCERIAS, CONCESSÕES E CONVÊNIOS' WHERE id = '50ae7d40-1288-4f9f-beb6-38fe2ce9d24a'; -- [SPCC - Parcerias, Concessões e Convênios] era: SPCC - Parcerias, Concessões e Convênios
UPDATE public.locais SET nome = 'SRI - SECRETARIA DE RELAÇÕES INSTITUCIONAIS' WHERE id = 'fa9e44e0-fce2-48f8-b188-4adb0a03d593'; -- [SRI - Relações Institucionais] era: SRI Relações Institucionais
UPDATE public.locais SET nome = 'ACADEMIA DA SAÚDE' WHERE id = 'e20006ba-36b7-4e8e-8411-6842851d0f1c'; -- [Saúde] era: Academia da Saúde
UPDATE public.locais SET nome = 'ASSISTÊNCIA FARMACÊUTICA' WHERE id = '3e59ed98-50d6-4b84-a55b-b02112d39f86'; -- [Saúde] era: Assistência Farmacêutica
UPDATE public.locais SET nome = 'ATENÇÃO BÁSICA' WHERE id = 'ff012251-97bc-4dde-bf28-f7dec6b70e32'; -- [Saúde] era: Atenção Básica
UPDATE public.locais SET nome = 'CAPS I' WHERE id = 'a4e798fc-6380-4996-8e9a-3699086117da'; -- [Saúde] era: CAPS i
UPDATE public.locais SET nome = 'CLÍNICA DA MULHER – GERAL' WHERE id = 'e5f04dfe-12a7-427e-ad11-7373ccf97dab'; -- [Saúde] era: Clínica da Mulher – Geral
UPDATE public.locais SET nome = 'DIRETORIA ADMINISTRATIVA (CONTABILIDADE)' WHERE id = '28f41912-807c-4d26-805e-095c65710954'; -- [Saúde] era: Diretoria Administrativa (Contabilidade)
UPDATE public.locais SET nome = 'DIREÇÃO CONTROLE E REGULAÇÃO' WHERE id = '2ad85838-15d2-4394-9d79-7eccb7b272f8'; -- [Saúde] era: Direção Controle e Regulação
UPDATE public.locais SET nome = 'PENDENTE/ 1DOC' WHERE id = 'efc4df87-0e12-46f2-842d-58d8beb560ed'; -- [Saúde] era: Pendente/ 1Doc
UPDATE public.locais SET nome = 'POLICLÍNICA – GERAL' WHERE id = 'b19f00c9-9bf3-4b3f-b5b2-7f83654d072b'; -- [Saúde] era: Policlínica – Geral
UPDATE public.locais SET nome = 'SMS - SECRETARIA DE SAÚDE' WHERE id = 'b00de9a7-a648-44e8-b342-3047d89733d1'; -- [Saúde] era: Saúde
UPDATE public.locais SET nome = 'SAÚDE BUCAL' WHERE id = 'dff8f906-31ec-40bf-9413-5d47ad54da9f'; -- [Saúde] era: Saúde Bucal
UPDATE public.locais SET nome = 'SAÚDE-ADMINISTRATIVO' WHERE id = '8c7f7acb-b7fb-44b5-8c21-e2c6c250aae6'; -- [Saúde] era: Saúde-Administrativo
UPDATE public.locais SET nome = 'SAÚDE-RH' WHERE id = '850e5f08-3dcb-405d-a770-33203aee2c33'; -- [Saúde] era: Saúde-RH
UPDATE public.locais SET nome = 'SERVIÇO ESPECIALIZADO - GERAL' WHERE id = '3d22aec4-491a-4a52-a569-963e662e0840'; -- [Saúde] era: Serviço Especializado - Geral
UPDATE public.locais SET nome = 'TRANSPORTE (SAÚDE)' WHERE id = 'ce6de18f-af8d-4402-b6f9-74518b37365c'; -- [Saúde] era: Transporte (Saúde)
UPDATE public.locais SET nome = 'VIGILANCIA SANITÁRIA' WHERE id = 'feaa6f58-4d3e-484f-896e-56790b4807dc'; -- [Saúde] era: Vigilancia Sanitária
UPDATE public.locais SET nome = 'SETA - SECRETARIA DE TRANSPARÊNCIA E ACCOUNTABILITY' WHERE id = '70823133-112b-48bd-9dee-b75b37836aaa'; -- [Secretaria de Transparencia e Accountabillity] era: Secretaria de Transparencia e Accountabillity
UPDATE public.locais SET nome = 'SETOR DE TESOURARIA' WHERE id = '1dfd691f-843a-423d-974f-8288ff22c9b2'; -- [Setor de Tesouraria] era: Setor de Tesouraria
UPDATE public.locais SET nome = 'TURISMO' WHERE id = '84715002-e188-44ef-b804-01d5836d0383'; -- [Turismo] era: Turismo
