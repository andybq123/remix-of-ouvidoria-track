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

echo "==> Baixando alterações do GitHub..."
cd ..
if [ ! -d .git ]; then
  echo "ERRO: esta pasta não é um clone do GitHub."
  echo "Clone primeiro: git clone https://SEU_TOKEN@github.com/USUARIO/REPO.git"
  exit 1
fi
git pull --ff-only
cd local-docker

echo "==> Reconstruindo e reiniciando o sistema (modo: $MODO)..."
if [ "$MODO" = "prod" ]; then
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
else
  docker compose up -d
fi

echo "==> Aguardando o sistema subir..."
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8080 >/dev/null 2>&1; then
    echo "==> Sistema atualizado e no ar!"
    exit 0
  fi
  sleep 5
done

echo "ATENÇÃO: o sistema ainda não respondeu. Veja os logs com:"
echo "  docker compose logs -f app"
exit 1
