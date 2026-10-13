#!/usr/bin/env bash
# Retoma somente a ingestão; não remove o bloqueio de restauração automática de IA.
set -Eeuo pipefail
fail() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || fail 'Execute de dentro do clone do sistema na VPS.'
cd "$ROOT"
[[ -f local-docker/.env.local ]] || fail 'Configuração VPS não encontrada.'
command -v flock >/dev/null || fail 'flock ausente.'
exec 9>/tmp/controle-seta-atualizar-front.lock
flock -n 9 || fail 'Uma atualização/limpeza está em andamento.'
if [[ ! -f local-docker/.ingestao-pausada ]]; then
  printf 'A ingestão não está pausada por este procedimento. Nenhuma alteração feita.\n'
  exit 0
fi
printf 'Ao retomar, as contas preservadas voltarão a coletar mensagens pelos cursores existentes.\n'
printf 'O backup importado pode conter mensagens já presentes na caixa; revise duplicatas e configure IA antes de retomar.\n'
printf 'A cópia antiga de chaves IA não será restaurada automaticamente.\n'
printf 'Importação concluída e revisada? Digite RETOMAR INGESTAO: ' >/dev/tty
IFS= read -r answer </dev/tty
[[ "$answer" == 'RETOMAR INGESTAO' ]] || fail 'Cancelado; ingestão permanece pausada.'
COMPOSE=(docker compose --project-directory "$ROOT/local-docker" -f "$ROOT/local-docker/docker-compose.yml" -f "$ROOT/local-docker/docker-compose.prod.yml")
# Inicia somente app e mantém coletor parado até prontidão e revisão dos cursores.
"${COMPOSE[@]}" stop coletor-email
"${COMPOSE[@]}" up -d app
APP_ID="$("${COMPOSE[@]}" ps -q app)"
RC=0
docker exec "$APP_ID" node /app/local-docker/manutencao/conferir-retomada.mjs || RC=$?
if [[ "$RC" == 3 ]]; then
  printf 'Conta sem cursor: confirme risco de reler mensagens antigas digitando RETOMAR COM RISCO DE RELEITURA: ' >/dev/tty
  IFS= read -r risk </dev/tty
  [[ "$risk" == 'RETOMAR COM RISCO DE RELEITURA' ]] || fail 'Cancelado; ingestão permanece pausada.'
elif [[ "$RC" != 0 ]]; then
  fail 'Pré-verificação falhou; ingestão permanece pausada.'
fi
"${COMPOSE[@]}" up -d coletor-email
rm -- local-docker/.ingestao-pausada
printf 'Ingestão retomada. Contas e cursores mantidos; confira o módulo E-mail após a próxima coleta.\n'
