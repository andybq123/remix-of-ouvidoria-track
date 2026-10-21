#!/usr/bin/env bash
# ============================================================
#  OuviDesk — Atualizador via GitHub (VPS)
#
#  Uso:
#    ./atualizar.sh           -> atualiza em modo PRODUÇÃO (usa a compilação do GitHub)
#    ./atualizar.sh --rapido  -> só banco + reinício, sem esperar compilação nova
#    ./atualizar.sh --dev     -> modo desenvolvimento (compila na VPS)
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

MODO="prod"
case "${1:-}" in
  --dev) MODO="dev" ;;
  --rapido) MODO="rapido" ;;
esac

# ---------- visual ----------
if [ -t 1 ]; then
  C_R=$'\e[31m'; C_G=$'\e[32m'; C_Y=$'\e[33m'; C_B=$'\e[34m'; C_C=$'\e[36m'
  C_D=$'\e[2m'; C_BOLD=$'\e[1m'; C_0=$'\e[0m'
else
  C_R=""; C_G=""; C_Y=""; C_B=""; C_C=""; C_D=""; C_BOLD=""; C_0=""
fi
INICIO=$(date +%s)
ETAPA=0; ETAPAS=5
LOG="/tmp/ouvidesk-atualizar.log"
etapa()  { ETAPA=$((ETAPA+1)); printf "\n${C_B}${C_BOLD}[%d/%d]${C_0} ${C_BOLD}%s${C_0}\n" "$ETAPA" "$ETAPAS" "$1"; }
ok()     { printf "      ${C_G}✔${C_0} %s\n" "$1"; }
info()   { printf "      ${C_D}•${C_0} %s\n" "$1"; }
aviso()  { printf "      ${C_Y}!${C_0} %s\n" "$1"; }
falha()  { printf "\n${C_R}${C_BOLD}✖ %s${C_0}\n" "$1"; [ -n "${2:-}" ] && printf "  ${C_Y}O que fazer:${C_0} %s\n" "$2"; printf "  ${C_D}Registro completo: %s${C_0}\n\n" "$LOG"; exit 1; }
GIRA=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏'); GI=0
girar()  { printf "\r      ${C_C}%s${C_0} %-60s" "${GIRA[$((GI % 10))]}" "$1"; GI=$((GI+1)); }
limpa()  { printf "\r%-72s\r" ""; }
tempo()  { local s=$(( $(date +%s) - INICIO )); printf "%dm%02ds" $((s/60)) $((s%60)); }

# ---------- 1. baixar código ----------
cd ..
if [ -z "${SETA_REEXEC:-}" ]; then
  : > "$LOG"
  printf "\n${C_C}${C_BOLD}  ╔══════════════════════════════════╗${C_0}\n"
  printf   "${C_C}${C_BOLD}  ║      OuviDesk · Atualização      ║${C_0}\n"
  printf   "${C_C}${C_BOLD}  ╚══════════════════════════════════╝${C_0}\n"
  [ -d .git ] || falha "Esta pasta não é um clone do GitHub." "git clone https://SEU_TOKEN@github.com/USUARIO/REPO.git"
  ANTES="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  etapa "Baixando alterações do GitHub"
  git fetch -q origin >>"$LOG" 2>&1 || falha "Não consegui falar com o GitHub." "Verifique a internet da VPS e o token do repositório."
  git reset -q --hard origin/main >>"$LOG" 2>&1   # o .env NÃO é afetado
  ok "Código: ${ANTES} → $(git rev-parse --short HEAD)  ${C_D}$(git log -1 --format=%s | cut -c1-50)${C_0}"
  cd local-docker; chmod +x atualizar.sh
  SETA_REEXEC=1 SETA_INICIO="$INICIO" exec ./atualizar.sh "$@"   # roda a versão recém-baixada
fi
INICIO="${SETA_INICIO:-$INICIO}"; ETAPA=1

SHA="$(git rev-parse HEAD)"
INSTALADA="$(cat .output/VERSION 2>/dev/null || true)"
# Último commit que muda o sistema compilado (igual ao paths-ignore do GitHub)
IGNORAR_BUILD=(':(exclude)local-docker' ':(exclude,glob)**/*.md' ':(exclude)drizzle' ':(exclude)supabase' ':(exclude)tests' ':(exclude).lovable' ':(exclude,glob)*.sh')
ALVO="$(git log -1 --format=%H HEAD -- . "${IGNORAR_BUILD[@]}")"
[ -n "$ALVO" ] || ALVO="$SHA"

ORIGEM="$(git config --get remote.origin.url)"
TOKEN="$(printf '%s' "$ORIGEM" | sed -nE 's#https://([^@:]+:)?([^@]+)@.*#\2#p')"
REPO="$(printf '%s' "$ORIGEM" | sed -E 's#https://[^@]*@#https://#; s#\.git$##; s#https://github.com/##')"
REPO_URL="https://github.com/$REPO"
api() {
  local h=(-H "Accept: application/vnd.github+json")
  [ -n "$TOKEN" ] && h+=(-H "Authorization: Bearer $TOKEN")
  curl -fsS --max-time 10 "${h[@]}" "https://api.github.com/repos/$REPO/$1" 2>/dev/null
}
# Leitura do JSON só com ferramentas do sistema (a VPS não tem node fora do Docker).
rel_sha() { tr -d '\n' | grep -oE '"(body|target_commitish)": *"[0-9a-f]{40}' | head -1 | grep -oE '[0-9a-f]{40}$' || true; }
run_status() {
  local seg; seg="$(tr -d '\n' | grep -oE '"name": *"Compilar vers[^"]*VPS"[^{}]*' | head -1 || true)"
  [ -n "$seg" ] || return 0
  local st co
  st="$(printf '%s' "$seg" | grep -oE '"status": *"[a-z_]+"' | head -1 | sed -E 's/.*"([a-z_]+)"$/\1/' || true)"
  co="$(printf '%s' "$seg" | grep -oE '"conclusion": *"[a-z_]+"' | head -1 | sed -E 's/.*"([a-z_]+)"$/\1/' || true)"
  printf '%s|%s' "$st" "$co"
}
rodar_node() {
  if command -v node >/dev/null 2>&1; then node "$@"
  else docker run --rm -v "$PWD:$PWD" -w "$PWD" node:22-alpine node "$@"; fi
}

cd local-docker
PRONTO=0; LOCAL_BUILD=0; TOTAL=120

# ---------- 2. compilação ----------
etapa "Preparando a versão compilada"
if [ "$MODO" = "rapido" ]; then
  info "Modo rápido: mantendo a versão já instalada."
elif [ "$MODO" = "dev" ]; then
  info "Modo desenvolvimento: compila dentro da VPS."
elif [ -n "$INSTALADA" ] && [ "$INSTALADA" = "$ALVO" ]; then
  ok "A versão instalada já está atualizada — só scripts/banco mudaram."
else
  NOVO_DIR=/tmp/seta-build
  baixar() {
    rm -rf "$NOVO_DIR" && mkdir -p "$NOVO_DIR"
    limpa
    curl -fL --progress-bar "$REPO_URL/releases/download/vps-latest/vps-build.tar.gz" -o "$NOVO_DIR/b.tgz" \
      && tar -xzf "$NOVO_DIR/b.tgz" -C "$NOVO_DIR" \
      && [ "$(cat "$NOVO_DIR/.output/VERSION" 2>/dev/null)" = "$ALVO" ]
  }
  LIMITE=$(( $(date +%s) + 600 )); ULTIMO_API=0; ESTADO="consultando"; TENTOU_SEM_API=0
  while [ "$(date +%s)" -lt "$LIMITE" ]; do
    AGORA=$(date +%s)
    if [ $((AGORA - ULTIMO_API)) -ge 8 ]; then
      ULTIMO_API=$AGORA
      REL="$(api releases/tags/vps-latest || true)"
      REL_SHA="$(printf '%s' "$REL" | rel_sha)"
      if [ "$REL_SHA" = "$ALVO" ]; then
        printf "\r      ${C_G}✔${C_0} %-60s\n" "Compilação pronta no GitHub. Baixando..."
        if baixar; then PRONTO=1; break; fi
        aviso "Pacote baixado não confere; tentando de novo."
      fi
      RUN="$(api "actions/runs?head_sha=$ALVO&per_page=5" || true)"
      ST="$(printf '%s' "$RUN" | run_status)"
      case "$ST" in
        queued*|waiting*|pending*|requested*) ESTADO="na fila do GitHub" ;;
        in_progress*) ESTADO="compilando no GitHub" ;;
        completed\|success) ESTADO="publicando pacote" ;;
        completed\|*) limpa; aviso "A compilação no GitHub ${C_R}falhou${C_0} (${ST#completed|})."; break ;;
        *)
          if [ -z "$REL" ] && [ "$TENTOU_SEM_API" = 0 ]; then
            # Sem acesso à API: confere o pacote diretamente (como antes)
            TENTOU_SEM_API=1; ESTADO="aguardando compilação"
            if baixar; then PRONTO=1; break; fi
          fi
          [ -z "$REL" ] && { TENTOU_SEM_API=0; ULTIMO_API=$((AGORA + 2)); }
          ESTADO="aguardando compilação" ;;
      esac
    fi
    RESTA=$(( LIMITE - $(date +%s) ))
    girar "${ESTADO}... $(tempo) ${C_D}(desiste em $((RESTA/60))m)${C_0}"
    sleep 0.2
  done
  limpa
  if [ "$PRONTO" = "1" ]; then
    NOVO="$NOVO_DIR/.output"
    # A compilação do GitHub aponta para o banco da nuvem: troca pelo banco LOCAL (.env.local).
    pega() { grep -E "^$1=" "$2" | head -1 | cut -d= -f2- | tr -d '"'; }
    LOCAL_URL="$(pega VITE_SUPABASE_URL .env.local)"; LOCAL_KEY="$(pega VITE_SUPABASE_PUBLISHABLE_KEY .env.local)"; LOCAL_PID="$(pega VITE_SUPABASE_PROJECT_ID .env.local)"
    CLOUD_URL="$(pega VITE_SUPABASE_URL ../.env)"; CLOUD_KEY="$(pega VITE_SUPABASE_PUBLISHABLE_KEY ../.env)"; CLOUD_PID="$(pega VITE_SUPABASE_PROJECT_ID ../.env)"
    [ -n "$LOCAL_URL" ] && [ -n "$LOCAL_KEY" ] && [ -n "$CLOUD_URL" ] && [ -n "$CLOUD_KEY" ] \
      || falha ".env.local sem VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY." "Confira o arquivo local-docker/.env.local."
    grep -rlF -e "$CLOUD_URL" -e "$CLOUD_KEY" "$NOVO" 2>/dev/null | while read -r f; do
      sed -i -e "s#${CLOUD_URL}#${LOCAL_URL}#g" -e "s#${CLOUD_KEY}#${LOCAL_KEY}#g" "$f"
      [ -n "$CLOUD_PID" ] && [ -n "$LOCAL_PID" ] && sed -i "s#${CLOUD_PID}#${LOCAL_PID}#g" "$f"
    done
    grep -rqF "$CLOUD_URL" "$NOVO" 2>/dev/null && falha "Não consegui apontar o sistema para o banco local."
    # Arquivos mudaram de tamanho: atualiza o mapa interno do servidor (evita tela em branco).
    rodar_node ./corrigir-tamanhos.mjs "$NOVO" >>"$LOG" 2>&1 || falha "Não consegui ajustar os tamanhos dos arquivos."
    ok "Versão $(printf '%s' "$ALVO" | cut -c1-7) baixada e apontada para o banco local."
  else
    aviso "Compilação do GitHub indisponível; compilando na VPS (pode levar ~10 min)."
    LOCAL_BUILD=1; TOTAL=900
    rm -rf ../.output ../node_modules/.vite 2>/dev/null || true
  fi
fi

# ---------- 3. banco ----------
etapa "Atualizando o banco de dados local"
DBC="$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -1 || true)"
if [ -n "$DBC" ] && ls ./atualizacoes-banco/*.sql >/dev/null 2>&1; then
  N=0
  for f in ./atualizacoes-banco/*.sql; do
    girar "$(basename "$f")"
    docker exec -i "$DBC" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres -c "SET client_min_messages=warning" -f - < "$f" >>"$LOG" 2>&1 \
      || { limpa; falha "Erro ao aplicar $(basename "$f") no banco local." "Envie o registro para o suporte."; }
    N=$((N+1))
  done
  limpa; ok "$N scripts conferidos."
else
  aviso "Banco local não encontrado; etapa ignorada."
fi

# ---------- 4. troca ----------
etapa "Trocando a versão e reiniciando"
if [ "$PRONTO" = "1" ]; then
  rm -rf ../.output.antiga
  [ -d ../.output ] && mv ../.output ../.output.antiga
  mv /tmp/seta-build/.output ../.output
  info "Versão anterior guardada em .output.antiga"
fi
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
[ "$MODO" = "dev" ] && COMPOSE=(docker compose)
"${COMPOSE[@]}" rm -sf app >>"$LOG" 2>&1 || true
( "${COMPOSE[@]}" up -d --force-recreate >>"$LOG" 2>&1 ) &
PID_COMPOSE=$!
ok "Reinício solicitado."

# ---------- 5. conferência ----------
etapa "Conferindo se o sistema está no ar"
FIM=$(( $(date +%s) + TOTAL ))
while [ "$(date +%s)" -lt "$FIM" ]; do
  if curl -fsS --max-time 3 http://127.0.0.1:8080 >/dev/null 2>&1; then
    limpa; ok "Sistema respondendo."
    VER="$(cat ../.output/VERSION 2>/dev/null | cut -c1-7)"
    printf "\n${C_G}${C_BOLD}  ✔ OuviDesk atualizado e no ar!${C_0}\n"
    printf "    ${C_D}Versão:${C_0} %s   ${C_D}Tempo total:${C_0} %s\n\n" "${VER:-dev}" "$(tempo)"
    exit 0
  fi
  if ! kill -0 "$PID_COMPOSE" 2>/dev/null && [ -z "$("${COMPOSE[@]}" ps -q --status running app 2>/dev/null)" ]; then
    limpa
    "${COMPOSE[@]}" logs app --tail 30 >>"$LOG" 2>&1 || true
    tail -n 15 "$LOG"
    falha "O sistema parou antes de responder." "Veja os detalhes com: docker compose logs -f app"
  fi
  [ "$LOCAL_BUILD" = 1 ] && MSG="compilando e iniciando" || MSG="iniciando"
  girar "${MSG}... $(tempo)"
  sleep 0.5
done
falha "O sistema ainda não respondeu após $((TOTAL/60)) minutos." "Veja os logs com: docker compose logs -f app"
