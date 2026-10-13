#!/usr/bin/env bash
# SOMENTE cluster temporário privado, sem TCP nem dados reais.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
[[ -x "$PG_BIN/initdb" && "$(id -u)" != 0 ]] || { echo 'Requer PostgreSQL e usuário não-root.' >&2; exit 2; }
TEMP="$(mktemp -d /tmp/seta-clean-test.XXXXXX)"
cleanup() { "$PG_BIN/pg_ctl" -D "$TEMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TEMP"; }
trap cleanup EXIT
"$PG_BIN/initdb" -D "$TEMP/data" -A trust --encoding=UTF8 --no-locale >/dev/null
"$PG_BIN/pg_ctl" -D "$TEMP/data" -l "$TEMP/server.log" -o "-c listen_addresses='' -k $TEMP -p 55438" -w start >/dev/null
PGUSER="$(id -un)"
export PGHOST="$TEMP" PGPORT=55438 PGUSER PGDATABASE=clean_test
unset PGSERVICE PGPASSWORD PGOPTIONS
"$PG_BIN/createdb" clean_test
PSQL=("$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/tests/esic/setup.sql"
"${PSQL[@]}" -f "$ROOT/tests/limpeza/setup.sql"
"${PSQL[@]}" -f "$ROOT/local-docker/atualizacoes-banco/005_esic_campos_triagem.sql"
"${PSQL[@]}" -f "$ROOT/local-docker/atualizacoes-banco/006_esic_importacao_backup.sql"
"${PSQL[@]}" -f "$ROOT/tests/limpeza/importacao.sql"
# Dependência desconhecida: não usar CASCADE nem deixar dados parcialmente apagados.
"${PSQL[@]}" -c 'CREATE TABLE public.dependencia_extra (protocolo_id uuid REFERENCES public.protocolos(id));'
if "${PSQL[@]}" -f "$ROOT/local-docker/manutencao/limpar_para_importacao.sql" >"$TEMP/restrict.log" 2>&1; then
  echo 'ERRO: limpeza não recusou dependência desconhecida' >&2; exit 1
fi
"${PSQL[@]}" -c "DO \$\$ BEGIN ASSERT (SELECT count(*) > 0 FROM public.protocolos), 'Rollback não manteve protocolos'; ASSERT (SELECT count(*) = 1 FROM public.ai_config), 'Rollback não manteve IA'; END \$\$; DROP TABLE public.dependencia_extra;"
"${PSQL[@]}" -f "$ROOT/local-docker/manutencao/limpar_para_importacao.sql"
"${PSQL[@]}" -f "$ROOT/tests/limpeza/assertions.sql"
"${PSQL[@]}" -f "$ROOT/local-docker/manutencao/limpar_para_importacao.sql"
"${PSQL[@]}" -f "$ROOT/tests/limpeza/assertions.sql"
echo 'Limpeza restrita, cadastros preservados, rollback e repetição: OK'
