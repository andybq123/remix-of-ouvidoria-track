#!/usr/bin/env bash
# Atalho mantido só para instalações antigas: o comando oficial é  deploy.sh atualizar
exec bash "$(cd "$(dirname "$0")/.." && pwd)/deploy.sh" atualizar "$@"
