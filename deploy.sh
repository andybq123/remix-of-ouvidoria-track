#!/usr/bin/env bash
# ============================================================
#  OuviDesk — comando único de instalação e manutenção da VPS
#
#    sudo bash deploy.sh                 -> menu
#    sudo bash deploy.sh instalar        -> instalação nova
#    sudo bash deploy.sh atualizar       -> atualização (usado pelo botão "Atualizar")
#    sudo bash deploy.sh dominio         -> troca de domínio
#    sudo bash deploy.sh ferramentas     -> usuários, backup, licença, conferências
# ============================================================
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
D="$RAIZ/local-docker/deploy"
source "$D/comum.sh"

ACAO="${1:-}"; [ $# -gt 0 ] && shift
if [ -z "$ACAO" ]; then
  titulo "Deploy"
  cat <<EOF

  1) Instalação nova
  2) Atualizar o sistema
  3) Alterar o domínio
  4) Ferramentas (usuários, backup, licença, conferências)
  0) Sair

EOF
  read -rp "  Escolha: " OP
  case "$OP" in
    1) ACAO=instalar ;; 2) ACAO=atualizar ;; 3) ACAO=dominio ;; 4) ACAO=ferramentas ;; *) exit 0 ;;
  esac
fi

case "$ACAO" in
  instalar)
    exigir_root
    exec bash "$D/instalar.sh" "$@" ;;
  atualizar)
    exigir_root
    if [ -z "${SETA_REEXEC:-}" ]; then
      travar
      conferir_espaco 3072
      validar_licenca
    fi
    exec bash "$D/atualizar.sh" "$@" ;;
  dominio)
    exigir_root
    exec bash "$D/dominio.sh" "$@" ;;
  ferramentas)
    exigir_root
    exec bash "$D/ferramentas.sh" "$@" ;;
  *)
    echo "Uso: sudo bash deploy.sh [instalar|atualizar|dominio|ferramentas]"; exit 1 ;;
esac
