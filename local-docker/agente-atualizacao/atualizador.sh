#!/usr/bin/env bash
# ============================================================
#  OuviDesk — Agente de atualização da VPS
#
#  Roda na VPS (fora do Docker), em segundo plano. A cada 15 s
#  confere se há pedido de atualização na fila (tabela
#  atualizacao_jobs) e, se houver, executa ./atualizar.sh,
#  gravando a etapa e o resultado de volta na fila.
# ============================================================
set -uo pipefail
cd "$(dirname "$0")/.."   # pasta local-docker

exec 9>/tmp/ouvidesk-agente-atualizacao.lock
flock -n 9 || { echo "Já há um agente de atualização rodando."; exit 0; }

dbc() { docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -1; }
sql() { docker exec -i "$(dbc)" psql -tA -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$1"; }
esc() { printf '%s' "$1" | sed "s/'/''/g"; }
sem_cor() { sed 's/\x1b\[[0-9;]*m//g'; }

echo "Agente de atualização OuviDesk iniciado."
while true; do
  ID="$(sql "update atualizacao_jobs set status='rodando', mensagem='Iniciando a atualização', updated_at=now() where id = (select id from atualizacao_jobs where status='pendente' order by created_at limit 1 for update skip locked) returning id" 2>/dev/null || true)"
  if [ -n "$ID" ]; then
    LOGF="/tmp/ouvidesk-update-$ID.log"
    ( ./atualizar.sh >"$LOGF" 2>&1 ) &
    PID=$!
    while kill -0 "$PID" 2>/dev/null; do
      ET="$(grep -aoE '\[[0-9]/5\]' "$LOGF" | tail -1 | tr -dc '0-9' | cut -c1)"
      MSG="$(grep -aE '✔|!' "$LOGF" | tail -1 | sem_cor | cut -c1-200)"
      if [ -n "$ET" ]; then
        sql "update atualizacao_jobs set etapa=$ET, mensagem='$(esc "$MSG")', updated_at=now() where id='$ID'" 2>/dev/null || true
      fi
      sleep 5
    done
    wait "$PID"; RC=$?
    TAIL="$(tail -n 30 "$LOGF" | sem_cor)"
    if [ "$RC" -eq 0 ]; then
      sql "update atualizacao_jobs set status='concluido', etapa=etapas_total, mensagem='Sistema atualizado e no ar', log='$(esc "$TAIL")', updated_at=now() where id='$ID'" 2>/dev/null || true
    else
      sql "update atualizacao_jobs set status='erro', mensagem='A atualização falhou (código $RC)', log='$(esc "$TAIL")', updated_at=now() where id='$ID'" 2>/dev/null || true
    fi
  fi
  sleep 15
done
