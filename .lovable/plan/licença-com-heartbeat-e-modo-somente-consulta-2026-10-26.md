# Licença com heartbeat e modo somente consulta

## O que o usuário vai ver
- A cada 5 minutos a VPS confirma a licença em https://licenca.chatizy.com.br.
- Se a licença for bloqueada, revogada, suspensa ou expirar: o sistema vira "somente consulta".
  - Admin: ao entrar, vê um aviso com o motivo, a data da última verificação e o texto "O sistema está em modo somente consulta. Entre em contato com o fornecedor da licença.". Pode fechar o aviso; uma faixa vermelha fica fixa no topo.
  - Usuários comuns: nenhum aviso, mas botões e formulários de edição ficam desabilitados.
  - Agente 1Doc e coleta de e-mails ficam parados.
- Quando a licença voltar a valer, tudo volta sozinho no próximo heartbeat, sem reiniciar.
- Se o servidor de licenças estiver fora do ar, nada muda (vale o último estado).

## 1. Heartbeat na VPS
- Novo `local-docker/deploy/heartbeat-licenca.sh`: usa `licenca_url`, ID da instalação, `.licenca` e `APP_DOMAIN` do `comum.sh`; envia POST `${LICENCA_URL}/api/public/heartbeat` com `{chave, dominio, instalacao_id, versao}`.
- Resultado gravado no banco local via `psql` no container do banco (upsert em `licenca_estado` id=1).
- Função pura de decisão (`decidir_estado`) espelhada em TS (`src/lib/licenca-estado.ts`) para teste:
  - `codigo` em instance_blocked / revoked / suspended / expired -> bloqueado=true, motivo=mensagem.
  - `valida=true` -> bloqueado=false.
  - falha de rede/timeout/resposta inválida -> não grava, só registra no log (`/var/log/ouvidesk-licenca.log`).
- Timer systemd `ouvidesk-licenca.timer` (5 min) + service, instalado por função `instalar_timer_licenca` em `comum.sh`, chamada por `instalar.sh`, `atualizar.sh` e "Trocar a licença" em Ferramentas (que também roda um heartbeat imediato).
- `LICENCA_URL` padrão passa a ser `https://licenca.chatizy.com.br` em `licenca.conf`.

## 2. Banco
- Nova tabela `licenca_estado` (id=1 com CHECK, bloqueado bool default false, motivo, codigo, verificado_em), linha inicial inserida desbloqueada.
- Leitura liberada a `authenticated`; gravação só `service_role`/postgres. Trigger de auditoria `registrar_alteracao()`.
- Função `public.licenca_bloqueada()` (security definer, stable).
- Defesa no banco: as policies de INSERT/UPDATE/DELETE não são reescritas uma a uma; em vez disso, trigger genérico `bloquear_se_licenca()` BEFORE INSERT/UPDATE/DELETE nas tabelas de negócio, que lança "Sistema bloqueado pela licença: somente consulta" (exceto para a própria `licenca_estado` e registro de auditoria). Isso cobre também gravações diretas do navegador.
- Migração em `drizzle/migrations` e arquivo idempotente numerado em `local-docker/atualizacoes-banco/`; `conferir-instalacao.sql` passa a checar tabela e função.

## 3. Backend
- Helper `assertLicencaLiberada(supabase)` em `src/lib/licenca.server.ts`, chamado no início de toda função de servidor/rota que grava (protocolos, triagem, importação/backup, configurações, usuários, 1Doc, atualização, e-mail/e-SIC, geocodificação em lote, `api/public/ingest-protocolos`). Levantamento feito por busca em `*.functions.ts` e `src/routes/api`.
- Server function `getLicencaEstado` (autenticada) retorna `{bloqueado, motivo, verificado_em}`.
- Agente 1Doc: a cada ciclo consulta `licenca_estado`; se bloqueado, não pega jobs e aguarda.
- Coleta/sincronização de e-mail e ingestão: retornam sem processar quando bloqueado.

## 4. Interface
- Hook `useLicencaBloqueada()` (TanStack Query, atualiza a cada 60 s) usando `getLicencaEstado`.
- No layout autenticado: para admin, diálogo de bloqueio (fechável, uma vez por sessão) + faixa vermelha fixa; para não-admin, nada visível.
- Botões, formulários e ações de edição recebem `disabled` quando bloqueado (protocolos, triagem, detalhe, gestão, configurações, usuários, backup, agente 1Doc, e-mail, atualização).

## 5. Testes
- `src/lib/licenca-estado.test.ts`: blocked, revoked, suspended, expired bloqueiam; valid libera; unreachable mantém estado anterior.
- Teste de gravação: helper `assertLicencaLiberada` com cliente simulado bloqueado recusa com a mensagem exata; e em `tests/instalacao` um update em `protocolos` com licença bloqueada falha no banco.

## Detalhes técnicos
- Estado lido do banco a cada requisição (sem cache no servidor), por isso a liberação é imediata.
- O botão "Atualizar" continua permitido? Proposta: bloqueado também (é gravação); atualização via terminal segue funcionando para o fornecedor.
- AGENTS.md recebe regra: toda gravação nova deve chamar `assertLicencaLiberada` e toda tabela de negócio nova recebe o trigger de bloqueio.
