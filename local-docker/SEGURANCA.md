# Auditoria de segurança — Ouvidoria (rodada 1)

## 1. Arquitetura identificada
- App: TanStack Start (React 19 + SSR), servidor Node (`.output/server/index.mjs`) no container `app` (imagem `node:24.22.1-bookworm`), porta `127.0.0.1:8080`.
- Banco/autenticação: banco local local (Postgres 15, GoTrue, PostgREST, Realtime) via `supabase start`, API em `127.0.0.1:54321`.
- Caddy (no host) termina HTTPS e encaminha `/auth/v1`, `/rest/v1`, `/realtime/v1`, `/storage/v1`, `/functions/v1` para 54321 e o resto para 8080.
- Autorização: RLS no Postgres + papéis em `user_roles` (`admin`/`user`) verificados por `has_role()`; funções de servidor usam `requirebanco localAuth` (token do usuário).
- Rotas públicas: `/`, `/ouvidoria` (formulário anônimo), `/consulta` (número + hash), `/auth`, e `/api/public/*` (protegidas por token).
- Anexos: o sistema **não tem upload de arquivos** (nenhum uso de storage encontrado). Fase 7 não se aplica além dos links do 1doc.

## 2. Problemas confirmados e correções
| # | Problema (evidência) | Risco | Correção |
|---|---|---|---|
| 1 | `concluir_triagem` e `reservar_triagem` (SECURITY DEFINER) executáveis por qualquer usuário logado não-admin, e por `anon` (ACL `anon=X`) — permitia redirecionar protocolos para outra secretaria. | Crítico | Checagem `has_role(admin)` dentro das funções; `REVOKE` de `anon`/`PUBLIC` nas 6 funções de triagem. |
| 2 | 6 funções do coletor de e-mail (`sincronizarGmail`, `ressincronizarGmail`, `reverificarEmails`, `sincronizarImap`, `backfillUrls1Doc`, `reprocessarEmail`) usam a chave de serviço sem verificar admin. | Alto | `exigirAdmin()` no servidor. |
| 3 | `geocodarProtocolosPendentes` e `extrairProtocolo` (gasta cota de IA) sem verificação de admin. | Médio | `exigirAdmin()`. |
| 4 | `sugerirLocalizacaoIA`, `geocodeAddress`, `searchAddresses` públicas (usadas no formulário anônimo) sem limite de tamanho. | Médio | Limite de tamanho das entradas. Sem limite de taxa (abuso de cota de IA permanece). |
| 5 | `GET /api/public/inbound-email/$token` devolvia parte do token. | Baixo | Resposta sem o token. |
| 6 | Sem cabeçalhos de segurança HTTP. | Médio | Exemplo de Caddy em `caddy/Caddyfile.seguranca.exemplo`. |

Verificado sem problema: rotas `/api/public/*` exigem `INGEST_TOKEN`/`CRON_SECRET`; funções de backup/debug/usuários/IA verificam admin; funções `backup_*` executáveis só por `service_role`; consulta pública exige número **e** hash; `.env.local` e `.ia-chaves.json` estão no `.gitignore`.

## 3. Arquivos alterados
- `src/lib/admin-guard.server.ts` (novo) + `admin-guard.test.ts`
- `src/lib/gmail-sync.functions.ts`, `geocode-bulk.functions.ts`, `protocolo-extract.functions.ts`, `location-ia.functions.ts`, `geocode.functions.ts`
- `src/routes/api/public/inbound-email.$token.ts`
- `local-docker/atualizacoes-banco/002_seguranca_triagem.sql` (aplicado automaticamente pelo `deploy.sh atualizar`)
- `local-docker/caddy/Caddyfile.seguranca.exemplo`, este arquivo.

## 4. Testes executados (reais)
- `vitest`: `admin-guard.test.ts` — 3/3 passaram.
- Nuvem: chamada anônima a `rpc/reservar_triagem` → `permission denied` (42501). ACLs conferidas após a migration.
- Typecheck/build automático do projeto.

## 5. Pendentes / limitações
- Não testado na VPS. Teste de usuário comum tentando triar: pendente (requer conta não-admin).
- Sem limite de tentativas de login além do padrão do GoTrue; sem limite de taxa nas funções públicas de IA.
- `testarContaImap` aceita host/porta informados pelo admin (SSRF restrito a admins).
- Container `app` roda como root com imagem não fixada por digest; não alterado para não quebrar volumes/permissões.
- Política de sigilo: usuários comuns leem todos os protocolos `publico` (não há isolamento por secretaria nas regras atuais). **Ambiguidade a decidir por você.**
- `consultar_protocolo_publico` devolve descrição, solicitante e contato a quem tem número+hash (é o próprio munícipe). Mantido.

## 6. Riscos remanescentes
- Revisão de Node (23/10/2026): host, app, agente 1Doc e CI passam a usar linha 24 LTS com mínimo 24.22.1, release oficial de segurança de 20/10/2026. O atualizador baixa a imagem do app e recompila a imagem do agente antes do reinício; o host só instala novamente quando está fora do mínimo. Validar versões e operação na VPS após aplicar. Referência: https://nodejs.org/dist/index.json.
- A varredura de dependências também apontou vulnerabilidades em bibliotecas, incluindo `xlsx`, dependências de `jspdf`, e processamento de e-mail; atualizar Node não corrige esses avisos. Esta alteração não representa auditoria completa nem garantia de ausência de vulnerabilidades.
- **Alto:** ausência de isolamento por secretaria (se for exigência legal); abuso de cota de IA pelo formulário público.
- **Médio:** CSP só em Report-Only até ser validada; container como root.
- **Baixo:** SSRF administrativo no teste IMAP; vazamento de existência de conta pela mensagem de login (padrão do GoTrue).

## 7. Implantação, backup e rollback (VPS)
```bash
# 1. Backup antes de tudo
cd ~/controle-seta/local-docker
DBC=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
mkdir -p backups && docker exec "$DBC" pg_dump -U postgres -d postgres -Fc > backups/antes-seguranca-$(date +%F-%H%M).dump
git -C .. rev-parse HEAD > backups/versao-anterior.txt

# 2. Atualizar (aplica 002_seguranca_triagem.sql e reinicia)
sudo bash ../deploy.sh atualizar

# 3. Cabeçalhos: copie o bloco "header" do exemplo para /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy

# Rollback do app: volte o código para a versão anterior e reinicie
git -C .. reset --hard "$(cat backups/versao-anterior.txt)" && SETA_REEXEC=1 bash ../deploy.sh atualizar
# Rollback do banco (só se necessário):
# docker exec -i "$DBC" pg_restore -U postgres -d postgres --clean --if-exists < backups/ARQUIVO.dump
```
Nenhuma variável de ambiente nova.

## 8. Verificar antes de liberar
1. Admin: triar, concluir, excluir protocolo, coletar e-mails.
2. Usuário comum: não vê Triagem; tentativa direta de triar retorna "forbidden".
3. Formulário público `/ouvidoria` e `/consulta` funcionando.
4. `curl -sI https://ouvidoria.chatizy.com.br | grep -iE 'strict|nosniff|frame|referrer|content-security'`.
5. Console do navegador sem avisos de CSP em todas as telas, antes de passar a CSP para modo obrigatório.
