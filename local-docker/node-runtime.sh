#!/usr/bin/env bash
# Política única para o Node instalado no host da VPS.
NODE_LTS_MAJOR=24
NODE_MIN_VERSION=24.22.1

node_host_atualizado() {
  command -v node >/dev/null 2>&1 || return 1
  local versao
  versao="$(node --version 2>/dev/null)" || return 1
  versao="${versao#v}"
  [[ "$versao" =~ ^24\.[0-9]+\.[0-9]+$ ]] || return 1
  [ "$(printf '%s\n' "$NODE_MIN_VERSION" "$versao" | sort -V | head -1)" = "$NODE_MIN_VERSION" ]
}

atualizar_node_host() {
  if node_host_atualizado; then
    printf 'Node %s: versão LTS corrigida já instalada.\n' "$(node --version)"
    return 0
  fi
  if [ "$(id -u)" -ne 0 ]; then
    echo 'Para atualizar o Node da VPS, execute este comando como root (sudo -i).' >&2
    return 1
  fi
  local setup
  setup="$(mktemp /tmp/ouvidesk-node-setup.XXXXXX)" || return 1
  if ! curl -fsSL --retry 3 "https://deb.nodesource.com/setup_${NODE_LTS_MAJOR}.x" -o "$setup"; then
    rm -f "$setup"
    return 1
  fi
  if ! bash "$setup" || ! apt-get install -y nodejs; then
    rm -f "$setup"
    return 1
  fi
  rm -f "$setup"
  hash -r
  if ! node_host_atualizado; then
    echo "O repositório não disponibilizou Node $NODE_MIN_VERSION ou superior da linha $NODE_LTS_MAJOR; atualização interrompida." >&2
    return 1
  fi
  printf 'Node atualizado: %s\n' "$(node --version)"
}

if [[ "${BASH_SOURCE[0]}" = "$0" ]]; then
  set -euo pipefail
  atualizar_node_host
fi