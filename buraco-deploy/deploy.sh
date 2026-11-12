#!/usr/bin/env bash
# ============================================================
#  Buraco Brusque — comando único de instalação e manutenção
#
#    sudo bash buraco-deploy/deploy.sh             -> menu
#    sudo bash buraco-deploy/deploy.sh instalar    -> instalação nova
#    sudo bash buraco-deploy/deploy.sh atualizar   -> atualização
# ============================================================
set -euo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ACAO="${1:-}"
if [ -z "$ACAO" ]; then
  printf '\n\033[1m== Buraco Brusque ==\033[0m\n\n'
  cat <<EOF
  1) Instalação nova
  2) Atualizar o aplicativo
  0) Sair

EOF
  read -rp "  Escolha: " OP
  case "$OP" in
    1) ACAO=instalar ;; 2) ACAO=atualizar ;; *) exit 0 ;;
  esac
fi

case "$ACAO" in
  instalar)  exec bash "$KIT/instalar.sh" ;;
  atualizar) exec bash "$KIT/atualizar.sh" ;;
  *) echo "Uso: sudo bash buraco-deploy/deploy.sh [instalar|atualizar]"; exit 1 ;;
esac
