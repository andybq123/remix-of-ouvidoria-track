#!/usr/bin/env bash
# Requer PostgreSQL 16 e Python 3. Nunca conecta à VPS nem a um banco existente.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
if [ ! -x "$PG_BIN/initdb" ] || [ "$(id -u)" = 0 ]; then
  echo 'Execute como usuário não-root com PostgreSQL instalado (ajuste PG_BIN se necessário).' >&2
  exit 2
fi
TEMP="$(mktemp -d /tmp/esic-postgres-test.XXXXXX)"
cleanup() {
  "$PG_BIN/pg_ctl" -D "$TEMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TEMP"
}
trap cleanup EXIT
"$PG_BIN/initdb" -D "$TEMP/data" -A trust --encoding=UTF8 --no-locale >/dev/null
# Sem TCP: somente socket Unix dentro da pasta privada do teste.
"$PG_BIN/pg_ctl" -D "$TEMP/data" -l "$TEMP/postgres.log" -o "-c listen_addresses='' -k $TEMP -p 55439" -w start >/dev/null
export PGHOST="$TEMP" PGPORT=55439 PGUSER="$(id -un)" PGDATABASE=esic_test
unset PGSERVICE PGPASSWORD PGOPTIONS
"$PG_BIN/createdb" esic_test
PSQL=("$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/tests/esic/setup.sql"
# Reutiliza as funções reais do schema: garante a coexistência dos gatilhos.
python3 - "$ROOT" "$TEMP/functions.sql" <<'PY'
import re, sys
from pathlib import Path
root, output = map(Path, sys.argv[1:])
schema = (root/'local-docker/supabase/migrations/20261012000000_schema.sql').read_text()
functions = []
for name in ['force_triagem_para_ouvidoria', 'stamp_triagem_conclusao', 'log_protocolo_changes']:
    start = schema.index(f'CREATE FUNCTION public.{name}(')
    match = re.search(r'AS (\$[^$]*\$)', schema[start:])
    end = schema.index(match.group(1) + ';', start + match.end()) + len(match.group(1)) + 1
    functions.append(schema[start:end])
functions.extend([
    'CREATE TRIGGER trg_force_triagem_ouvidoria BEFORE INSERT ON public.protocolos FOR EACH ROW EXECUTE FUNCTION public.force_triagem_para_ouvidoria();',
    'CREATE TRIGGER trg_stamp_triagem_conclusao BEFORE UPDATE ON public.protocolos FOR EACH ROW EXECUTE FUNCTION public.stamp_triagem_conclusao();',
    'CREATE TRIGGER trg_log_protocolo_changes AFTER INSERT OR UPDATE ON public.protocolos FOR EACH ROW EXECUTE FUNCTION public.log_protocolo_changes();'
])
output.write_text('\n'.join(functions))
PY
"${PSQL[@]}" -f "$TEMP/functions.sql"
MIGRATION="$ROOT/local-docker/atualizacoes-banco/005_esic_campos_triagem.sql"
"${PSQL[@]}" -f "$MIGRATION"
"${PSQL[@]}" -f "$ROOT/tests/esic/assertions.sql"
"${PSQL[@]}" -f "$MIGRATION"
"${PSQL[@]}" -c "DO \$\$ BEGIN ASSERT (SELECT NOT triagem_pendente AND prorrogado FROM public.protocolos WHERE numero = '1001/2026'), 'Reaplicar migration alterou pedido já triado'; END \$\$;"
echo 'Migration, idempotência, triagem, busca, auditoria e prorrogação: OK'

# Duas transações simultâneas para o mesmo Nº externo com zeros diferentes.
"${PSQL[@]}" -c "BEGIN; INSERT INTO public.protocolos (numero, numero_esic, tipo) VALUES ('2001/2026', '099/2026', 'esic'); SELECT pg_sleep(1); COMMIT;" >"$TEMP/concorrente-a.log" 2>&1 &
FIRST=$!
sleep 0.2
if "${PSQL[@]}" -c "INSERT INTO public.protocolos (numero, numero_esic, tipo) VALUES ('2002/2026', '99/2026', 'esic');" >"$TEMP/concorrente-b.log" 2>&1; then
  echo 'ERRO: duplicata concorrente foi aceita' >&2
  exit 1
fi
wait "$FIRST"
grep -q 'Já existe um pedido e-SIC' "$TEMP/concorrente-b.log"
"${PSQL[@]}" -c "DO \$\$ BEGIN ASSERT (SELECT count(*) = 1 FROM public.protocolo_esic_por_numero('99/2026')), 'Concorrência criou duplicata'; END \$\$;"
echo 'Prevenção de duplicata concorrente: OK'
