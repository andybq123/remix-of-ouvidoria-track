#!/usr/bin/env bash
# ============================================================
#  Controle SETA — Atualizador via GitHub (VPS)
#  Baixa as alterações mais recentes e reinicia o sistema.
#
#  Uso:
#    ./atualizar.sh          -> atualiza e roda em modo PRODUÇÃO (rápido)
#    ./atualizar.sh --dev    -> atualiza e roda em modo desenvolvimento
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

MODO="prod"
[ "${1:-}" = "--dev" ] && MODO="dev"

cd ..
if [ -z "${SETA_REEXEC:-}" ]; then echo "==> Baixando alterações do GitHub..."; fi
if [ ! -d .git ]; then
  echo "ERRO: esta pasta não é um clone do GitHub."
  echo "Clone primeiro: git clone https://SEU_TOKEN@github.com/USUARIO/REPO.git"
  exit 1
fi
git fetch origin
git reset --hard origin/main   # descarta alterações locais (o .env NÃO é afetado)
cd local-docker
chmod +x atualizar.sh
# Reinicia com a versão recém-baixada do script (evita rodar a versão antiga)
if [ -z "${SETA_REEXEC:-}" ]; then
  SETA_REEXEC=1 exec ./atualizar.sh "$@"
fi

LOG_BUILD="/tmp/controle-seta-build.log"
: > "$LOG_BUILD"
TOTAL=900
PRONTO=0

if [ "$MODO" = "prod" ]; then
  # Baixa a compilação pronta feita pelo GitHub (rápido, sem compilar na VPS)
  SHA="$(git -C .. rev-parse HEAD)"
  REPO_URL="$(git -C .. config --get remote.origin.url | sed -E 's#https://[^@]*@#https://#; s#\.git$##')"
  URL="$REPO_URL/releases/download/vps-latest/vps-build.tar.gz"
  echo "==> Baixando versão já compilada do GitHub (até 6 min se acabou de ser alterada)..."
  for i in $(seq 1 36); do
    rm -rf /tmp/seta-build && mkdir -p /tmp/seta-build
    if curl -fsSL "$URL" -o /tmp/seta-build/b.tgz 2>/dev/null \
       && tar -xzf /tmp/seta-build/b.tgz -C /tmp/seta-build \
       && [ "$(cat /tmp/seta-build/.output/VERSION 2>/dev/null)" = "$SHA" ]; then
      PRONTO=1; break
    fi
    printf "\r   aguardando compilação no GitHub... %ds   " $(( i * 10 ))
    sleep 10
  done
  echo ""
  if [ "$PRONTO" = "1" ]; then
    rm -rf ../.output && mv /tmp/seta-build/.output ../.output
    echo "==> Versão compilada baixada. Reiniciando..."
    TOTAL=120
  else
    echo "==> Compilação do GitHub indisponível; compilando na VPS (lento)..."
    rm -rf ../.output ../node_modules/.vite 2>/dev/null || true
  fi
fi

echo "==> Reiniciando o sistema (modo: $MODO)..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml rm -sf app >/dev/null 2>&1 || true
if [ "$MODO" = "prod" ]; then
  ( docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate >"$LOG_BUILD" 2>&1 ) &
else
  ( docker compose up -d --force-recreate >"$LOG_BUILD" 2>&1 ) &
fi
PID_COMPOSE=$!

INTERVALO=2
ELAPSED=0

draw_bar() {
  local pct=$(( ELAPSED * 100 / TOTAL ))
  [ "$pct" -gt 99 ] && pct=99
  local preenchido=$(( pct * 30 / 100 ))
  local vazio=$(( 30 - preenchido ))
  local mm=$(( ELAPSED / 60 ))
  local ss=$(( ELAPSED % 60 ))
  printf "\r[%s%s] %3d%%  %02d:%02d decorridos   " \
    "$(printf '%*s' "$preenchido" '' | tr ' ' '#')" \
    "$(printf '%*s' "$vazio" '' | tr ' ' '-')" \
    "$pct" "$mm" "$ss"
}

echo "==> Aguardando o sistema subir (compilando e iniciando)..."
while [ "$ELAPSED" -lt "$TOTAL" ]; do
  if curl -fsS http://127.0.0.1:8080 >/dev/null 2>&1; then
    ELAPSED=$TOTAL
    draw_bar
    printf "\n==> Sistema atualizado e no ar!\n"
    exit 0
  fi
  if ! kill -0 "$PID_COMPOSE" 2>/dev/null && [ -z "$(docker compose ps -q --status running app 2>/dev/null)" ]; then
    printf "\nERRO: o build/container terminou antes de responder. Últimas linhas do log:\n"
    tail -n 20 "$LOG_BUILD"
    docker compose logs app --tail 30 2>/dev/null || true
    echo ""
    echo "Veja o log completo em: $LOG_BUILD"
    exit 1
  fi
  draw_bar
  sleep "$INTERVALO"
  ELAPSED=$(( ELAPSED + INTERVALO ))
done

printf "\nATENÇÃO: o sistema ainda não respondeu após 15 minutos.\n"
echo "Últimas linhas do log de build:"
tail -n 20 "$LOG_BUILD"
echo ""
echo "Veja os logs com: docker compose logs -f app"
exit 1
