#!/usr/bin/env bash
# ============================================================
#  OuviDesk — Atualização (chamada por: deploy.sh atualizar)
#
#    deploy.sh atualizar           -> usa a versão compilada no GitHub
#    deploy.sh atualizar --rapido  -> só banco + reinício, sem versão nova
#    deploy.sh atualizar --dev     -> compila dentro da VPS
#
#  As etapas "[n/5]" são lidas pelo serviço do botão "Atualizar".
# ============================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comum.sh"

MODO="prod"
case "${1:-}" in
  --dev) MODO="dev" ;;
  --rapido) MODO="rapido" ;;
esac

INICIO=$(date +%s)
ETAPA=0; ETAPAS=5
etapa() { ETAPA=$((ETAPA+1)); printf "\n${C_B}${C_BOLD}[%d/%d]${C_0} ${C_BOLD}%s${C_0}\n" "$ETAPA" "$ETAPAS" "$1"; }
GIRA=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏'); GI=0
girar() { printf "\r      ${C_C}%s${C_0} %-60s" "${GIRA[$((GI % 10))]}" "$1"; GI=$((GI+1)); }
limpa() { printf "\r%-72s\r" ""; }
tempo() { local s=$(( $(date +%s) - INICIO )); printf "%dm%02ds" $((s/60)) $((s%60)); }

# ---------- 1. baixar código ----------
cd "$RAIZ"
if [ -z "${SETA_REEXEC:-}" ]; then
  : > "$LOG"
  titulo "Atualização"
  [ -d .git ] || falha "Esta pasta não é um clone do GitHub." "git clone https://SEU_TOKEN@github.com/USUARIO/REPO.git"
  ANTES="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  etapa "Baixando alterações do GitHub"
  git fetch -q origin >>"$LOG" 2>&1 || falha "Não consegui falar com o GitHub." "Verifique a internet da VPS e o token do repositório."
  git reset -q --hard origin/main >>"$LOG" 2>&1   # arquivos locais ignorados (.env.local, licença) são mantidos
  ok "Código: ${ANTES} → $(git rev-parse --short HEAD)  ${C_D}$(git log -1 --format=%s | cut -c1-50)${C_0}"
  # Roda a versão recém-baixada do próprio deploy.
  SETA_REEXEC=1 SETA_INICIO="$INICIO" exec bash "$RAIZ/deploy.sh" atualizar "$@"
fi
INICIO="${SETA_INICIO:-$INICIO}"; ETAPA=1

SHA="$(git rev-parse HEAD)"
INSTALADA="$(cat .output/VERSION 2>/dev/null || true)"
# Último commit que muda o sistema compilado (igual ao paths-ignore de .github/workflows/build-vps.yml)
IGNORAR_BUILD=(':(exclude)local-docker' ':(exclude,glob)**/*.md' ':(exclude)drizzle' ':(exclude)supabase' ':(exclude)tests' ':(exclude).lovable' ':(exclude,glob)*.sh')
ALVO="$(git log -1 --format=%H HEAD -- . "${IGNORAR_BUILD[@]}")"
[ -n "$ALVO" ] || ALVO="$SHA"
# Um pacote serve se foi compilado a partir do ALVO ou de um commit mais novo da main.
serve() {
  local v="${1:-}"
  [ -n "$v" ] && git cat-file -e "${v}^{commit}" 2>/dev/null \
    && git merge-base --is-ancestor "$ALVO" "$v" 2>/dev/null \
    && git merge-base --is-ancestor "$v" "$SHA" 2>/dev/null
}

ORIGEM="$(git config --get remote.origin.url)"
TOKEN="$(printf '%s' "$ORIGEM" | sed -nE 's#https://([^@:]+:)?([^@]+)@.*#\2#p')"
REPO="$(printf '%s' "$ORIGEM" | sed -E 's#https://[^@]*@#https://#; s#\.git$##; s#https://github.com/##')"
REPO_URL="https://github.com/$REPO"
api() {
  local h=(-H "Accept: application/vnd.github+json")
  [ -n "$TOKEN" ] && h+=(-H "Authorization: Bearer $TOKEN")
  curl -fsS --max-time 10 "${h[@]}" "https://api.github.com/repos/$REPO/$1" 2>/dev/null
}
# Leitura do JSON só com ferramentas do sistema.
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
  else docker run --rm --pull=always -v "$PWD:$PWD" -w "$PWD" node:24.22.1-alpine node "$@"; fi
}

cd "$LD"
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1
source ./node-runtime.sh
info "Conferindo Node da VPS (LTS com correções de segurança)."
atualizar_node_host >>"$LOG" 2>&1 || falha "Não consegui atualizar o Node da VPS." "Execute como root (sudo -i) e confira o registro."
# Garante o serviço do botão "Atualizar". Não roda quando o próprio serviço
# chamou esta atualização, para não reiniciá-lo no meio.
if [ "$(id -u)" -eq 0 ] && [ -z "${OUVIDESK_AGENTE_ATUALIZACAO:-}" ] && command -v systemctl >/dev/null 2>&1; then
  bash ./agente-atualizacao/instalar.sh >>"$LOG" 2>&1 \
    && info "Serviço do botão de atualização ativo." \
    || aviso "Não consegui ativar o serviço do botão de atualização (veja $LOG)."
fi
PRONTO=0; LOCAL_BUILD=0; TOTAL=120

# ---------- 2. compilação ----------
etapa "Preparando a versão compilada"
if [ "$MODO" = "rapido" ]; then
  info "Modo rápido: mantendo a versão já instalada."
elif [ "$MODO" = "dev" ]; then
  info "Modo desenvolvimento: compila dentro da VPS."
elif serve "$INSTALADA"; then
  ok "A versão instalada já está atualizada — só scripts/banco mudaram."
else
  NOVO_DIR="/tmp/seta-build-$(id -u)"
  baixar() {
    rm -rf "$NOVO_DIR" && mkdir -p "$NOVO_DIR"
    limpa
    curl -fsSL --max-time 300 "$REPO_URL/releases/download/vps-latest/vps-build.tar.gz" -o "$NOVO_DIR/b.tgz" \
      && tar -xzf "$NOVO_DIR/b.tgz" -C "$NOVO_DIR" \
      && serve "$(cat "$NOVO_DIR/.output/VERSION" 2>/dev/null)"
  }
  LIMITE=$(( $(date +%s) + 600 )); ULTIMO_API=0; ULTIMO_DL=0; ESTADO="consultando"
  while [ "$(date +%s)" -lt "$LIMITE" ]; do
    AGORA=$(date +%s)
    if [ $((AGORA - ULTIMO_API)) -ge 8 ]; then
      ULTIMO_API=$AGORA
      REL="$(api releases/tags/vps-latest || true)"
      REL_SHA="$(printf '%s' "$REL" | rel_sha)"
      if [ -n "$REL_SHA" ]; then
        if serve "$REL_SHA"; then
          girar "Compilação pronta no GitHub. Baixando..."
          if baixar; then PRONTO=1; break; fi
          aviso "Pacote baixado não confere; tentando de novo."
        fi
        RUN="$(api "actions/runs?branch=main&event=push&per_page=5" || true)"
        ST="$(printf '%s' "$RUN" | run_status)"
        case "$ST" in
          queued*|waiting*|pending*|requested*) ESTADO="na fila do GitHub" ;;
          in_progress*) ESTADO="compilando no GitHub" ;;
          completed\|success) ESTADO="publicando pacote" ;;
          completed\|cancelled) ESTADO="aguardando nova compilação" ;;
          completed\|*) limpa; aviso "A compilação no GitHub ${C_R}falhou${C_0} (${ST#completed|})."; break ;;
          *) ESTADO="aguardando compilação" ;;
        esac
      elif [ $((AGORA - ULTIMO_DL)) -ge 45 ]; then
        ULTIMO_DL=$AGORA; ESTADO="aguardando compilação"
        girar "Conferindo pacote do GitHub..."
        if baixar; then PRONTO=1; break; fi
      fi
    fi
    RESTA=$(( LIMITE - $(date +%s) ))
    girar "${ESTADO}... $(tempo) ${C_D}(desiste em $((RESTA/60))m)${C_0}"
    sleep 0.2
  done
  limpa
  if [ "$PRONTO" = "1" ]; then
    NOVO="$NOVO_DIR/.output"
    # O pacote do GitHub vem com o endereço de compilação: troca pelo banco desta VPS (.env.local).
    pega() { grep -E "^$1=" "$2" | head -1 | cut -d= -f2- | tr -d '"'; }
    LOCAL_URL="$(pega VITE_SUPABASE_URL .env.local)"; LOCAL_KEY="$(pega VITE_SUPABASE_PUBLISHABLE_KEY .env.local)"; LOCAL_PID="$(pega VITE_SUPABASE_PROJECT_ID .env.local)"
    BUILD_URL="$(pega VITE_SUPABASE_URL ../.env)"; BUILD_KEY="$(pega VITE_SUPABASE_PUBLISHABLE_KEY ../.env)"; BUILD_PID="$(pega VITE_SUPABASE_PROJECT_ID ../.env)"
    [ -n "$LOCAL_URL" ] && [ -n "$LOCAL_KEY" ] && [ -n "$BUILD_URL" ] && [ -n "$BUILD_KEY" ] \
      || falha "Configuração local incompleta (endereço/chave do banco)." "Confira o arquivo local-docker/.env.local."
    grep -rlF -e "$BUILD_URL" -e "$BUILD_KEY" "$NOVO" 2>/dev/null | while read -r f; do
      sed -i -e "s#${BUILD_URL}#${LOCAL_URL}#g" -e "s#${BUILD_KEY}#${LOCAL_KEY}#g" "$f"
      [ -n "$BUILD_PID" ] && [ -n "$LOCAL_PID" ] && sed -i "s#${BUILD_PID}#${LOCAL_PID}#g" "$f"
    done
    grep -rqF "$BUILD_URL" "$NOVO" 2>/dev/null && falha "Não consegui apontar o sistema para o banco local."
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
if [ -n "$(banco_container)" ]; then
  if [ -z "${DEPLOY_INSTALANDO:-}" ]; then
    backup_banco atualizacao
    info "Cópia de segurança: ${BACKUP_FEITO#"$RAIZ"/}"
  fi
  aplicar_banco
else
  aviso "Banco local não encontrado; etapa ignorada."
fi

# ---------- 4. troca ----------
etapa "Trocando a versão e reiniciando"
if [ "$PRONTO" = "1" ]; then
  rm -rf ../.output.antiga
  [ -d ../.output ] && mv ../.output ../.output.antiga
  mv "/tmp/seta-build-$(id -u)/.output" ../.output
  info "Versão anterior guardada em .output.antiga"
fi
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
[ "$MODO" = "dev" ] && COMPOSE=(docker compose)
"${COMPOSE[@]}" pull app >>"$LOG" 2>&1 || falha "Não consegui baixar a imagem corrigida do Node."
"${COMPOSE[@]}" build --pull agente-1doc >>"$LOG" 2>&1 \
  || falha "Não consegui preparar o agente 1Doc." "Se o registro citar 'no space left on device', rode: docker builder prune -af"
"${COMPOSE[@]}" rm -sf app >>"$LOG" 2>&1 || true
( "${COMPOSE[@]}" up -d --force-recreate --renew-anon-volumes >>"$LOG" 2>&1 ) &
PID_COMPOSE=$!
ok "Reinício solicitado."

# ---------- 5. conferência ----------
etapa "Conferindo se o sistema está no ar"
FIM=$(( $(date +%s) + TOTAL ))
while [ "$(date +%s)" -lt "$FIM" ]; do
  if curl -fsS --max-time 3 http://127.0.0.1:8080 >/dev/null 2>&1; then
    limpa; ok "Sistema respondendo."
    VER="$(cut -c1-7 ../.output/VERSION 2>/dev/null || true)"
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
