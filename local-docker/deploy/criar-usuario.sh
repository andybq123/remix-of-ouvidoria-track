#!/usr/bin/env bash
# Cria um usuário ou redefine a senha de um existente.
# Uso: bash deploy.sh ferramentas  (ou: criar-usuario.sh email senha [admin|user] [Nome])
set -euo pipefail
cd "$(dirname "$0")/.."
if [ $# -lt 2 ]; then
  read -rp "E-mail: " EMAIL
  read -rsp "Senha (mín. 8, com maiúscula, minúscula, número e símbolo): " SENHA; echo
  read -rp "Perfil (admin/user) [admin]: " PERFIL
  set -- "$EMAIL" "$SENHA" "${PERFIL:-admin}"
fi
source ./node-runtime.sh
if node_host_atualizado; then
  node create-admin.mjs "$@"
else
  docker run --rm --pull=always --network host -v "$PWD":/w -w /w node:24.22.1-alpine node create-admin.mjs "$@"
fi
