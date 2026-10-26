#!/usr/bin/env bash
# Funções compartilhadas pelos comandos do deploy.sh. Use com: source comum.sh
# Define RAIZ (clone do projeto) e LD (pasta local-docker).

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LD="$(cd "$DEPLOY_DIR/.." && pwd)"
RAIZ="$(cd "$LD/.." && pwd)"
export RAIZ LD DEPLOY_DIR

# ---------- visual ----------
if [ -t 1 ]; then
  C_R=$'\e[31m'; C_G=$'\e[32m'; C_Y=$'\e[33m'; C_B=$'\e[34m'; C_C=$'\e[36m'
  C_D=$'\e[2m'; C_BOLD=$'\e[1m'; C_0=$'\e[0m'
else
  C_R=""; C_G=""; C_Y=""; C_B=""; C_C=""; C_D=""; C_BOLD=""; C_0=""
fi
LOG="${LOG:-/tmp/ouvidesk-deploy-$(id -u).log}"
ok()    { printf "      ${C_G}✔${C_0} %s\n" "$1"; }
info()  { printf "      ${C_D}•${C_0} %s\n" "$1"; }
aviso() { printf "      ${C_Y}!${C_0} %s\n" "$1"; }
falha() {
  printf "\n${C_R}${C_BOLD}✖ %s${C_0}\n" "$1"
  [ -n "${2:-}" ] && printf "  ${C_Y}O que fazer:${C_0} %s\n" "$2"
  printf "  ${C_D}Registro completo: %s${C_0}\n\n" "$LOG"
  exit 1
}
titulo() {
  printf "\n${C_C}${C_BOLD}  ╔══════════════════════════════════════╗${C_0}\n"
  printf   "${C_C}${C_BOLD}  ║  %-36s║${C_0}\n" "OuviDesk · $1"
  printf   "${C_C}${C_BOLD}  ╚══════════════════════════════════════╝${C_0}\n"
}

exigir_root() { [ "$(id -u)" -eq 0 ] || falha "Execute como root." "sudo -i  e depois  bash $RAIZ/deploy.sh"; }

# ---------- espaço em disco ----------
# Falta de espaço já derrubou atualizações (imagem do agente 1Doc). Avisa antes.
conferir_espaco() {
  local minimo_mb="${1:-3072}" livre
  livre="$(df -Pm "$RAIZ" | awk 'END {print $4}')"
  if [ "${livre:-0}" -lt "$minimo_mb" ]; then
    docker builder prune -af >>"$LOG" 2>&1 || true
    livre="$(df -Pm "$RAIZ" | awk 'END {print $4}')"
  fi
  [ "${livre:-0}" -ge "$minimo_mb" ] || falha "Pouco espaço em disco (${livre} MB livres; precisa de ${minimo_mb} MB)." \
    "Libere espaço (ex.: apague backups antigos em local-docker/backups) ou aumente o disco da VPS."
}

# ---------- banco local ----------
banco_container() { docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -1 || true; }
# sql "comando"  — executa como postgres no banco local
sql() { docker exec -i "$(banco_container)" psql -X -qtA -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$1"; }
sql_arquivo() { docker exec -i "$(banco_container)" psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SET client_min_messages=warning" -f - < "$1"; }

# Aplica todas as mudanças de banco (idempotentes, em ordem) e confere o resultado.
aplicar_banco() {
  local f n=0
  [ -n "$(banco_container)" ] || falha "Banco local não está rodando." "Rode: bash $RAIZ/deploy.sh ferramentas  e escolha 'Conferir o sistema'."
  for f in "$LD"/atualizacoes-banco/*.sql; do
    sql_arquivo "$f" >>"$LOG" 2>&1 || falha "Erro ao aplicar $(basename "$f") no banco." "Envie o registro $LOG para o suporte."
    n=$((n+1))
  done
  sql "select public.limpar_vinculos_usuarios_inexistentes()" >>"$LOG" 2>&1 || true
  sql "NOTIFY pgrst, 'reload schema'" >>"$LOG" 2>&1 || true
  conferir_banco
  ok "$n mudanças de banco conferidas."
}

conferir_banco() {
  sql_arquivo "$DEPLOY_DIR/conferir-instalacao.sql" >>"$LOG" 2>&1 \
    || { tail -n 5 "$LOG"; falha "O banco não passou na conferência da instalação." "Envie o registro $LOG para o suporte."; }
}

# Cópia protegida do banco antes de mudanças grandes. Uso: backup_banco motivo
backup_banco() {
  local dbc pasta
  dbc="$(banco_container)"; [ -n "$dbc" ] || return 0
  pasta="$LD/backups/$1-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$pasta"; chmod 700 "$LD/backups" "$pasta"
  docker exec "$dbc" pg_dump -U postgres -d postgres -Fc > "$pasta/database.dump" 2>>"$LOG" \
    && [ -s "$pasta/database.dump" ] \
    || { rm -rf "$pasta"; falha "Não consegui fazer a cópia de segurança do banco. Nada foi alterado."; }
  chmod 600 "$pasta/database.dump"
  (cd "$pasta" && sha256sum database.dump > database.sha256)
  # Mantém só as 5 cópias mais recentes de cada tipo, para não lotar o disco.
  ls -1dt "$LD/backups/$1-"* 2>/dev/null | tail -n +6 | xargs -r rm -rf
  BACKUP_FEITO="$pasta"
}

# Uma operação por vez (atualização, domínio, limpeza).
travar() {
  exec 9>/tmp/ouvidesk-deploy.lock
  flock -n 9 || falha "Já existe outra operação do deploy em andamento."
}

compose_prod() { docker compose --project-directory "$LD" -f "$LD/docker-compose.yml" -f "$LD/docker-compose.prod.yml" "$@"; }

# ---------- licença ----------
# Chave salva em local-docker/.licenca (fora do Git). O endereço do servidor de
# licenças vem de LICENCA_URL (ambiente, .env.local ou deploy/licenca.conf); sem ele, não verifica.
LICENCA_ARQ="$LD/.licenca"
licenca_url() {
  local u="${LICENCA_URL:-}"
  [ -n "$u" ] || u="$(grep -shE '^LICENCA_URL=' "$LD/.env.local" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  [ -n "$u" ] || u="$(grep -shE '^LICENCA_URL=' "$DEPLOY_DIR/licenca.conf" | head -1 | cut -d= -f2- | tr -d '"' || true)"
  printf '%s' "$u"
}
instalacao_id() {
  local f="$LD/.instalacao-id"
  [ -s "$f" ] || { { cat /proc/sys/kernel/random/uuid 2>/dev/null || openssl rand -hex 16; } > "$f"; chmod 600 "$f"; }
  cat "$f"
}
salvar_licenca() {
  umask 077; printf '%s\n' "$1" > "$LICENCA_ARQ"; chmod 600 "$LICENCA_ARQ"
}
pedir_licenca() {
  local chave=""
  while [ -z "$chave" ]; do
    read -rp "  Chave de licença do OuviDesk: " chave </dev/tty
    chave="$(printf '%s' "$chave" | tr -d '[:space:]')"
  done
  salvar_licenca "$chave"
}
# validar_licenca [dominio]  — retorna 0 se pode seguir.
validar_licenca() {
  local url chave dominio resp valida msg
  url="$(licenca_url)"
  if [ -z "$url" ]; then
    info "Verificação de licença desligada (LICENCA_URL não configurada)."
    return 0
  fi
  [ -s "$LICENCA_ARQ" ] || { [ -r /dev/tty ] && [ -t 0 ] && pedir_licenca; }
  [ -s "$LICENCA_ARQ" ] || falha "Licença não cadastrada." "Rode: bash $RAIZ/deploy.sh ferramentas  e escolha 'Trocar a licença'."
  chave="$(cat "$LICENCA_ARQ")"
  dominio="${1:-$(grep -sE '^APP_DOMAIN=' "$LD/.env.local" | cut -d= -f2-)}"
  resp="$(curl -fsS --max-time 10 -H 'Content-Type: application/json' \
    -d "{\"chave\":\"$chave\",\"dominio\":\"$dominio\",\"instalacao_id\":\"$(instalacao_id)\",\"versao\":\"$(git -C "$RAIZ" rev-parse --short HEAD 2>/dev/null)\"}" \
    "${url%/}/api/public/validar" 2>>"$LOG")" \
    || falha "Não consegui falar com o servidor de licenças." "Confira a internet da VPS e tente de novo. O sistema em uso continua funcionando."
  valida="$(printf '%s' "$resp" | grep -oE '"valida" *: *(true|false)' | grep -oE 'true|false' || true)"
  msg="$(printf '%s' "$resp" | grep -oE '"mensagem" *: *"[^"]*"' | sed -E 's/.*: *"(.*)"/\1/' || true)"
  [ "$valida" = "true" ] || falha "Licença inválida ou expirada${msg:+: $msg}." "Rode: bash $RAIZ/deploy.sh ferramentas  e escolha 'Trocar a licença'."
  ok "Licença válida.${msg:+ $msg}"
}
