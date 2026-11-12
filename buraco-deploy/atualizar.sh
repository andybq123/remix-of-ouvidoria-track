#!/usr/bin/env bash
# ============================================================
#  Buraco Brusque — atualização na VPS
#
#    sudo bash /opt/buraco-brusque/buraco-deploy/atualizar.sh
#
#  Baixa a versão nova do GitHub, aplica mudanças de banco
#  pendentes e recompila só o Buraco Brusque (OuviDesk intacto).
# ============================================================
set -Eeuo pipefail
umask 077

APP_DIR="/opt/buraco-brusque"
LOG="/tmp/buraco-atualizar.log"
: >"$LOG"; chmod 600 "$LOG"

titulo() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
ok()     { printf '  \033[32m✓\033[0m %s\n' "$*"; }
falha()  { printf '\n\033[31mERRO: %s\033[0m\n' "$*" >&2; [ -n "${2:-}" ] && printf '%s\n' "$2" >&2; exit 1; }
rodar()  { local msg="$1"; shift; printf '  … %s\n' "$msg"; "$@" >>"$LOG" 2>&1 || { tail -n 15 "$LOG" >&2; falha "$msg — falhou." "Envie o registro $LOG para o suporte."; }; ok "$msg"; }

# Procura o contêiner do banco do Buraco (pelo nome ou pela etiqueta do projeto),
# esperando até 90 s; se não achar, mostra o motivo na tela.
buraco_db() {
  local i c
  for i in $(seq 1 30); do
    c="$(docker ps --filter 'label=com.supabase.cli.project=buraco-local' --format '{{.Names}}' | grep -E '^supabase_db_' | head -1 || true)"
    [ -n "$c" ] || c="$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_buraco' | head -1 || true)"
    if [ -n "$c" ] && timeout 5 docker exec "$c" pg_isready -U postgres -q 2>/dev/null; then printf '\r  ✓ Banco respondendo            \n' >&2; echo "$c"; return 0; fi
    printf '\r  … Aguardando o banco responder (%ss de 90s)' "$((i*3))" >&2
    sleep 3
  done
  echo >&2
  {
    echo "--- contêineres do Buraco ---"
    docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -i buraco || echo "(nenhum)"
    c="$(docker ps -a --format '{{.Names}}' | grep -E '^supabase_db_buraco' | head -1 || true)"
    [ -n "$c" ] && { echo "--- últimas linhas do banco ($c) ---"; docker logs --tail 30 "$c" 2>&1; }
    echo "--- memória / disco ---"; free -m; df -h / | tail -1
  } | tee -a "$LOG" >&2
  return 1
}

titulo "Buraco Brusque — atualização"
[ "$EUID" -eq 0 ] || falha "Execute com sudo."
[ -d "$APP_DIR/.git" ] || falha "Instalação não encontrada em $APP_DIR. Rode o instalar.sh primeiro."
cd "$APP_DIR"

rodar "Baixando a versão nova" git pull --ff-only

# Mudanças de banco pendentes (mesma regra da instalação)
DBC="$(buraco_db)" || falha "O banco local não está rodando." "Mande para o suporte as linhas acima."
rodar "Aplicando mudanças de banco pendentes" bash -c "
  set -e
  docker exec -i $DBC psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS public._migracoes_aplicadas (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now());
SQL
  for f in drizzle/migrations/*.sql; do
    n=\$(basename \"\$f\")
    if ! docker exec -i $DBC psql -X -qtA -U postgres -d postgres -c \"SELECT 1 FROM public._migracoes_aplicadas WHERE nome='\$n'\" | grep -q 1; then
      docker exec -i $DBC psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < \"\$f\"
      docker exec -i $DBC psql -X -q -U postgres -d postgres -c \"INSERT INTO public._migracoes_aplicadas(nome) VALUES ('\$n')\"
    fi
  done
  docker exec -i $DBC psql -X -q -U postgres -d postgres -c \"NOTIFY pgrst, 'reload schema'\"
"

rodar "Recompilando o aplicativo" bash -c "rm -rf .output && docker compose --project-directory '$APP_DIR' -f '$APP_DIR/docker-compose.yml' up -d --force-recreate app"
printf '  … Aguardando o aplicativo responder\n'
for i in $(seq 1 120); do
  if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:8081/" 2>/dev/null; then break; fi
  [ "$i" -eq 120 ] && falha "O aplicativo não respondeu a tempo." "Veja: docker logs buraco-app-1 — e o registro $LOG"
  sleep 10
done
ok "Aplicativo atualizado e no ar"
