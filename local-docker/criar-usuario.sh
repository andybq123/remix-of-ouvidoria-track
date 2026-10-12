#!/usr/bin/env bash
# Cria um usuário ou redefine a senha de um existente.
# Uso: ./criar-usuario.sh email senha [admin|user] [Nome]
set -euo pipefail
cd "$(dirname "$0")"
if [ $# -lt 2 ]; then
  read -rp "E-mail: " EMAIL
  read -rsp "Senha (mín. 6): " SENHA; echo
  read -rp "Perfil (admin/user) [admin]: " PERFIL
  set -- "$EMAIL" "$SENHA" "${PERFIL:-admin}"
fi
if command -v node >/dev/null; then
  node create-admin.mjs "$@"
else
  docker run --rm --network host -v "$PWD":/w -w /w node:22-alpine node create-admin.mjs "$@"
fi
