#!/usr/bin/env bash
# Limpeza MANUAL. Nunca é chamada por atualizar_front.sh ou por migrations.
set -Eeuo pipefail
fail() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }
MODE="${1:-}"
[[ "$MODE" == "" || "$MODE" == "--simular" ]] || fail 'Uso: ./limpar_para_importacao.sh [--simular]'
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || fail 'Execute de dentro do clone da aplicação na VPS.'
cd "$ROOT"
for cmd in docker flock sha256sum; do command -v "$cmd" >/dev/null || fail "Comando ausente: $cmd"; done
[[ -f local-docker/.env.local && -f local-docker/manutencao/limpar_para_importacao.sql ]] || fail 'Clone/configuração VPS incompletos.'
[[ -f .output/VERSION && -f .output/server/index.mjs ]] || fail 'Atualize primeiro a aplicação com ./atualizar_front.sh.'
[[ "$(cat .output/VERSION)" == "$(git rev-parse HEAD)" ]] || fail 'O artefato instalado não corresponde ao checkout. Execute ./atualizar_front.sh antes.'
[[ "$(git branch --show-current)" == main ]] || fail 'Execute somente no clone de produção na branch main.'
[[ -z "$(git diff --name-only -- src local-docker/manutencao limpar_para_importacao.sh)" ]] || fail 'Há código local alterado. Revise antes de limpar.'
# Mesma trava do atualizador: impede atualização e limpeza concorrentes.
exec 9>/tmp/controle-seta-atualizar-front.lock
flock -n 9 || fail 'Há atualização/limpeza em andamento.'
COMPOSE=(docker compose --project-directory "$ROOT/local-docker" -f "$ROOT/local-docker/docker-compose.yml" -f "$ROOT/local-docker/docker-compose.prod.yml")
APP_ID="$("${COMPOSE[@]}" ps -q app)"
[[ -n "$APP_ID" ]] || fail 'A aplicação deste clone não está em execução.'
APP_ROOT="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Source}}{{end}}{{end}}' "$APP_ID")"
[[ "$APP_ROOT" == "$ROOT" ]] || fail 'O contêiner da aplicação pertence a outro clone. Nada foi apagado.'
DBS=()
while IFS= read -r name; do [[ -z "$name" ]] || DBS+=("$name"); done < <(docker ps --format '{{.Names}}' | grep -E '^supabase_db_' || true)
[[ ${#DBS[@]} -eq 1 ]] || fail 'É necessário exatamente um banco supabase_db_ em execução. Não vou escolher entre bancos.'
DB="${DBS[0]}"
USER_DB=postgres
if ! docker exec "$DB" psql -X -U "$USER_DB" -d postgres -Atc 'select 1' >/dev/null 2>&1; then
  USER_DB=supabase_admin
  docker exec "$DB" psql -X -U "$USER_DB" -d postgres -Atc 'select 1' >/dev/null 2>&1 || fail 'Banco inacessível.'
fi
# Compara a API realmente usada pelo app com o banco selecionado.
SUMMARY="SELECT json_build_object('profiles',COALESCE((SELECT json_agg(id ORDER BY id) FROM public.profiles),'[]'::json),'allowed_emails',COALESCE((SELECT json_agg(id ORDER BY id) FROM public.allowed_emails),'[]'::json),'user_roles',COALESCE((SELECT json_agg(id ORDER BY id) FROM public.user_roles),'[]'::json),'secretarias',COALESCE((SELECT json_agg(id ORDER BY id) FROM public.secretarias),'[]'::json),'locais',COALESCE((SELECT json_agg(id ORDER BY id) FROM public.locais),'[]'::json),'secretaria_responsaveis',COALESCE((SELECT json_agg(id ORDER BY id) FROM public.secretaria_responsaveis),'[]'::json),'assuntos',COALESCE((SELECT json_agg(id ORDER BY id) FROM public.assuntos),'[]'::json),'email_inbox_accounts',COALESCE((SELECT json_agg(id ORDER BY id) FROM public.email_inbox_accounts),'[]'::json),'protocolos',COALESCE((SELECT json_agg(id ORDER BY id) FROM public.protocolos),'[]'::json));"
docker exec "$DB" psql -X -U "$USER_DB" -d postgres -At -v ON_ERROR_STOP=1 -c "$SUMMARY" | docker exec -i "$APP_ID" node /app/local-docker/manutencao/conferir-banco.mjs || fail 'Banco alvo não confirmado; nada foi apagado.'
printf '\nSERÃO APAGADOS: protocolos (inclusive e-SIC/triagem), histórico, conclusões antigas, logs de e-mail, coletas e configuração de IA do banco.\n'
printf 'SERÃO MANTIDOS: usuários/senhas/permissões, secretarias, locais, responsáveis, assuntos, contas e cursores de e-mail, .env e configuração da VPS.\n'
printf 'A ingestão e a restauração automática de chaves IA em arquivo ficarão pausadas.\nBanco: %s\n\n' "$DB"
COUNTS="SELECT 'protocolos', count(*) FROM public.protocolos UNION ALL SELECT 'protocolo_historico', count(*) FROM public.protocolo_historico UNION ALL SELECT 'protocolos_antigos_conclusoes', count(*) FROM public.protocolos_antigos_conclusoes UNION ALL SELECT 'email_inbox_log', count(*) FROM public.email_inbox_log UNION ALL SELECT 'coletas', count(*) FROM public.coletas UNION ALL SELECT 'ai_config', count(*) FROM public.ai_config;"
docker exec "$DB" psql -X -U "$USER_DB" -d postgres -v ON_ERROR_STOP=1 -c "$COUNTS"
if [[ "$MODE" == --simular ]]; then
  printf '\nSIMULAÇÃO: nenhum dado, arquivo ou serviço foi alterado.\n'
  exit 0
fi
[[ -r /dev/tty ]] || fail 'É necessária confirmação em terminal interativo. Não execute via pipe.'
printf '\nPara confirmar o escopo acima, digite LIMPAR PARA IMPORTAR: ' >/dev/tty
IFS= read -r answer </dev/tty
[[ "$answer" == 'LIMPAR PARA IMPORTAR' ]] || fail 'Cancelado. Nenhum dado alterado.'
umask 077
BACKUP="$ROOT/local-docker/backups/clean-import-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$BACKUP"
chmod 700 "$BACKUP"
cp local-docker/.env.local "$BACKUP/env.local"
[[ ! -f .env ]] || cp .env "$BACKUP/root.env"
[[ ! -f local-docker/.ia-chaves.json ]] || cp local-docker/.ia-chaves.json "$BACKUP/ia-chaves.json"
printf '%s\n' "$(git rev-parse HEAD)" > "$BACKUP/versao.txt"
# Os dois marcadores sobrevivem a atualizações; não alteram as contas de e-mail.
printf 'Importação de backup em andamento.\n' > local-docker/.ingestao-pausada
printf 'Não recuperar chaves antigas do arquivo para o banco.\n' > local-docker/.ia-restauracao-bloqueada
STOPPED=0
on_exit() {
  local rc=$?
  if [[ $rc -ne 0 ]]; then
    printf '\nOperação interrompida (código %s). Backup: %s\n' "$rc" "$BACKUP" >&2
    printf 'Não repita a limpeza sem revisar. Ingestão permanece pausada.\n' >&2
    if [[ $STOPPED == 1 ]]; then printf 'Aplicação parada por segurança. Após revisar: cd "%s/local-docker" && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d app\n' "$ROOT" >&2; fi
  fi
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '\n==> Parando aplicação e coletor para obter backup consistente...\n'
"${COMPOSE[@]}" stop -t 180 coletor-email app
STOPPED=1
printf '==> Criando e verificando backup completo...\n'
docker exec "$DB" pg_dump -U "$USER_DB" -d postgres -Fc > "$BACKUP/database.dump.partial"
[[ -s "$BACKUP/database.dump.partial" ]] || fail 'Dump vazio. Limpeza não executada.'
docker exec -i "$DB" pg_restore --list < "$BACKUP/database.dump.partial" > "$BACKUP/dump-objects.txt" || fail 'Dump inválido. Limpeza não executada.'
for objeto in 'auth users' 'auth identities' 'public profiles' 'public allowed_emails' 'public user_roles' 'public secretarias' 'public locais' 'public secretaria_responsaveis' 'public assuntos' 'public email_inbox_accounts'; do
  grep -Fq "TABLE DATA $objeto " "$BACKUP/dump-objects.txt" || fail "Dump não contém os dados obrigatórios de $objeto. Limpeza não executada."
done
mv "$BACKUP/database.dump.partial" "$BACKUP/database.dump"
(cd "$BACKUP" && sha256sum database.dump > database.sha256)
docker exec "$DB" psql -X -U "$USER_DB" -d postgres -At -v ON_ERROR_STOP=1 -c "$COUNTS" > "$BACKUP/contagens-antes.txt"
printf '==> Limpando somente as tabelas aprovadas, em uma transação...\n'
docker exec -i "$DB" psql -X -U "$USER_DB" -d postgres -v ON_ERROR_STOP=1 < local-docker/manutencao/limpar_para_importacao.sql
docker exec "$DB" psql -X -U "$USER_DB" -d postgres -At -v ON_ERROR_STOP=1 -c "$COUNTS" > "$BACKUP/contagens-depois.txt"
awk -F'|' '$2 != 0 { exit 1 }' "$BACKUP/contagens-depois.txt" || fail 'Verificação final não está zerada.'
printf '==> Iniciando somente a aplicação; ingestão permanece pausada...\n'
"${COMPOSE[@]}" up -d app
STOPPED=0
printf '\nLimpeza concluída. Backup protegido: %s\n' "$BACKUP"
printf 'Importe seu backup pela tela Backup. A ingestão não voltará até executar ./retomar_ingestao.sh.\n'
printf 'As chaves/modelos IA do banco foram removidos; configure novamente quando necessário.\n'
