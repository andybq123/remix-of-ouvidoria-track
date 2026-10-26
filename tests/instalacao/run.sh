#!/usr/bin/env bash
# Instalação limpa do banco num PostgreSQL temporário: aplica o esquema e
# todas as atualizações duas vezes e confere usuários, permissões e áreas.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb || echo /usr/lib/postgresql/16/bin/initdb)")}"
TEMP="$(mktemp -d /tmp/ouvidesk-instalacao.XXXXXX)"; chmod 777 "$TEMP"
RUN=(); [ "$(id -u)" = 0 ] && RUN=(setpriv --reuid=7001 --regid=7001 --clear-groups bash -c)
pg() { if [ ${#RUN[@]} -gt 0 ]; then "${RUN[@]}" "$(printf '%q ' "$@")"; else "$@"; fi; }
cleanup() { pg "$PG_BIN/pg_ctl" -D "$TEMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TEMP"; }
trap cleanup EXIT
pg "$PG_BIN/initdb" -D "$TEMP/data" -A trust -U postgres --encoding=UTF8 --no-locale >/dev/null
pg "$PG_BIN/pg_ctl" -D "$TEMP/data" -l "$TEMP/pg.log" -o "-c listen_addresses='' -k $TEMP -p 55441" -w start >/dev/null
PSQL=("$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -q -h "$TEMP" -p 55441 -U postgres -d postgres)
"${PSQL[@]}" -c "SET client_min_messages=warning" -f "$ROOT/tests/instalacao/stub-plataforma.sql"
for f in "$ROOT"/local-docker/supabase/migrations/*.sql; do
  echo "esquema: $(basename "$f")"; "${PSQL[@]}" -c "SET client_min_messages=warning" -f "$f" >/dev/null
done
for volta in 1 2; do
  for f in "$ROOT"/local-docker/atualizacoes-banco/*.sql; do
    echo "volta $volta: $(basename "$f")"; "${PSQL[@]}" -c "SET client_min_messages=warning" -f "$f" >/dev/null
  done
done
[ -n "${INVENTARIO:-}" ] && "${PSQL[@]}" -At -f "$INVENTARIO" > /tmp/inv-vps.txt
"${PSQL[@]}" -f "$ROOT/local-docker/deploy/conferir-instalacao.sql"
"${PSQL[@]}" -f "$ROOT/tests/instalacao/assertions.sql"
echo "Instalação limpa do banco: OK"
