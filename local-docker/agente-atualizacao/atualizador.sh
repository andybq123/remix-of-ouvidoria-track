#!/usr/bin/env bash
# ============================================================
#  OuviDesk — Agente de atualização da VPS
#
#  Roda na VPS (fora do Docker), como serviço. A cada 3 s confere
#  a fila (atualizacao_jobs); se houver pedido, executa
#  ./atualizar.sh exatamente como no terminal e grava etapa,
#  mensagem e as últimas linhas do registro de volta na fila.
#
#  Tudo fica dentro de main(): o bash lê o arquivo inteiro antes
#  de executar, então o "git reset" do atualizar.sh pode trocar
#  este arquivo sem quebrar o serviço em execução.
# ============================================================
main() {
  set -uo pipefail
  export HOME="${HOME:-/root}"
  cd "$(dirname "$0")/.."   # pasta local-docker

  exec 9>/tmp/ouvidesk-agente-atualizacao.lock
  flock -n 9 || { echo "Já há um agente de atualização rodando."; exit 0; }

  dbc() { docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -1; }
  sql() { docker exec -i "$(dbc)" psql -tA -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$1"; }
  esc() { printf '%s' "$1" | sed "s/'/''/g"; }
  limpo() { sed 's/\x1b\[[0-9;]*m//g' | tr '\r' '\n' | grep -av '^[[:space:]]*$'; }

  echo "Agente de atualização OuviDesk iniciado em $(pwd)."
  # Pedido que ficou "rodando" porque o serviço reiniciou no meio: encerra.
  sql "update atualizacao_jobs set status='erro', mensagem='Serviço da VPS reiniciou durante a atualização', updated_at=now() where status='rodando' and updated_at < now() - interval '15 minutes'" >/dev/null 2>&1 || true

  while true; do
    ID="$(sql "update atualizacao_jobs set status='rodando', etapa=0, mensagem='Iniciando a atualização', updated_at=now() where id = (select id from atualizacao_jobs where status='pendente' order by created_at limit 1 for update skip locked) returning id" 2>/dev/null | head -1 || true)"
    if [ -n "$ID" ]; then
      echo "Atualização $ID iniciada."
      LOGF="/tmp/ouvidesk-update-$ID.log"
      : > "$LOGF"
      ( ./atualizar.sh </dev/null >"$LOGF" 2>&1 ) &
      PID=$!
      while kill -0 "$PID" 2>/dev/null; do
        sleep 2
        ET="$(grep -aoE '\[[0-9]/[0-9]\]' "$LOGF" | tail -1 | cut -c2)"
        TXT="$(limpo < "$LOGF")"
        MSG="$(printf '%s\n' "$TXT" | tail -1 | sed 's/^[[:space:]]*//' | cut -c1-200)"
        TAIL="$(printf '%s\n' "$TXT" | tail -n 15)"
        sql "update atualizacao_jobs set etapa=${ET:-0}, mensagem='$(esc "$MSG")', log='$(esc "$TAIL")', updated_at=now() where id='$ID'" >/dev/null 2>&1 || true
      done
      wait "$PID"; RC=$?
      TAIL="$(limpo < "$LOGF" | tail -n 40)"
      # O banco pode estar reiniciando logo após a troca: tenta por até 1 min.
      for _ in $(seq 1 20); do
        if [ "$RC" -eq 0 ]; then
          sql "update atualizacao_jobs set status='concluido', etapa=etapas_total, mensagem='Sistema atualizado e no ar', log='$(esc "$TAIL")', updated_at=now() where id='$ID'" >/dev/null 2>&1 && break
        else
          sql "update atualizacao_jobs set status='erro', mensagem='A atualização falhou (código $RC)', log='$(esc "$TAIL")', updated_at=now() where id='$ID'" >/dev/null 2>&1 && break
        fi
        sleep 3
      done
      echo "Atualização $ID terminou (código $RC)."
    fi
    sleep 3
  done
}
main "$@"
exit
