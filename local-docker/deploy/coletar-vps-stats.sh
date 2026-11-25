#!/usr/bin/env bash
# ============================================================
#  OuviDesk — Coleta de estatísticas da VPS (host, 1x por minuto)
#
#  Instalado pelo deploy (instalar_coletor_vps_stats em comum.sh)
#  no cron do root. Grava um JSON que o app lê em
#  local-docker/vps-stats/vps-stats.json (o app vê o repo em /app).
#
#  Uso manual: bash local-docker/deploy/coletar-vps-stats.sh
#  O arquivo é escrito de forma atômica (temporário + mv) e o
#  script nunca falha a coleta inteira por causa de uma métrica.
# ============================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEST_DIR="$RAIZ/local-docker/vps-stats"
DEST="$DEST_DIR/vps-stats.json"
mkdir -p "$DEST_DIR" || exit 0

# ---------- helpers ----------
num() { # imprime o valor se for número, senão 0
  case "$1" in
    ''|*[!0-9.]*|.*|*..*) printf '0' ;;
    *) printf '%s' "$1" ;;
  esac
}
esc() { # escapa uma string para JSON (remove controles, escapa \ e ")
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\000-\037'
}
json_str() { # "valor" escapado, ou null quando vazio
  if [ -n "${1:-}" ]; then printf '"%s"' "$(esc "$1")"; else printf 'null'; fi
}

# ---------- coleta ----------
AGORA="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
HOSTNAME="$(hostname 2>/dev/null | tr -cd 'A-Za-z0-9._-' || true)"
UPTIME="$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)"
read -r LOAD1 LOAD5 LOAD15 _ < /proc/loadavg 2>/dev/null || { LOAD1=0; LOAD5=0; LOAD15=0; }
NUCLEOS="$(nproc 2>/dev/null || echo 0)"

# CPU: diferença de /proc/stat com 1 s de intervalo.
ler_cpu() { awk '/^cpu / {print $2, $3, $4, $5, $6, $7, $8}' /proc/stat 2>/dev/null; }
CPU1="$(ler_cpu)"; sleep 1; CPU2="$(ler_cpu)"
CPU_USO="$(awk -v a="$CPU1" -v b="$CPU2" 'BEGIN {
  n1 = split(a, x); n2 = split(b, y);
  t1 = 0; t2 = 0;
  for (i = 1; i <= n1; i++) t1 += x[i];
  for (i = 1; i <= n2; i++) t2 += y[i];
  idle1 = x[4] + x[5]; idle2 = y[4] + y[5];
  if (t2 > t1) printf "%.1f", 100 * (1 - (idle2 - idle1) / (t2 - t1)); else print "0.0";
}')"

# Memória: usada = total - disponível (o que o sistema não pode usar).
MEM_TOTAL_KB="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
MEM_DISP_KB="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
MEM_LIVRE_KB="$(awk '/^MemFree:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
MEM_TOTAL=$(( $(num "$MEM_TOTAL_KB") * 1024 ))
MEM_DISP=$(( $(num "$MEM_DISP_KB") * 1024 ))
MEM_LIVRE=$(( $(num "$MEM_LIVRE_KB") * 1024 ))
MEM_USADA=$(( MEM_TOTAL - MEM_DISP ))
[ "$MEM_USADA" -lt 0 ] && MEM_USADA=0

# Disco raiz.
read -r DISCO_TOTAL DISCO_USADO DISCO_LIVRE <<<"$(df -B1 --output=size,used,avail / 2>/dev/null | tail -n 1)"
DISCO_TOTAL="$(num "$DISCO_TOTAL")"; DISCO_USADO="$(num "$DISCO_USADO")"; DISCO_LIVRE="$(num "$DISCO_LIVRE")"
if [ "$DISCO_TOTAL" -gt 0 ]; then DISCO_USO="$(awk -v u="$DISCO_USADO" -v t="$DISCO_TOTAL" 'BEGIN {printf "%.1f", 100 * u / t}')"; else DISCO_USO="0.0"; fi

# Containers (nome + status). Sem Docker, lista vazia.
CONTAINERS_JSON=""
if command -v docker >/dev/null 2>&1; then
  while IFS='|' read -r nome estado; do
    [ -n "$nome" ] || continue
    case "$estado" in Up*) em_execucao=true ;; *) em_execucao=false ;; esac
    item="{\"nome\": \"$(esc "$nome")\", \"estado\": \"$(esc "$estado")\", \"emExecucao\": $em_execucao}"
    if [ -z "$CONTAINERS_JSON" ]; then CONTAINERS_JSON="$item"; else CONTAINERS_JSON="$CONTAINERS_JSON, $item"; fi
  done < <(docker ps --format '{{.Names}}|{{.Status}}' 2>/dev/null)
fi

NODE="$(node --version 2>/dev/null || true)"
APP_COMMIT="$(git -C "$RAIZ" rev-parse --short HEAD 2>/dev/null || true)"
APP_VERSAO=""
[ -f "$RAIZ/.output/VERSION" ] && APP_VERSAO="$(tr -d '[:space:]' < "$RAIZ/.output/VERSION" 2>/dev/null || true)"
[ -n "$APP_VERSAO" ] || APP_VERSAO="$APP_COMMIT"

# ---------- grava (atômico) ----------
TMP="$DEST.tmp.$$"
{
  printf '{\n'
  printf '  "versao": 1,\n'
  printf '  "coletadoEm": "%s",\n' "$AGORA"
  printf '  "hostname": %s,\n' "$(json_str "$HOSTNAME")"
  printf '  "uptimeSegundos": %s,\n' "$(num "$UPTIME")"
  printf '  "load": [%s, %s, %s],\n' "$(num "$LOAD1")" "$(num "$LOAD5")" "$(num "$LOAD15")"
  printf '  "cpu": { "nucleos": %s, "usoPercentual": %s },\n' "$(num "$NUCLEOS")" "$(num "$CPU_USO")"
  printf '  "memoria": { "totalBytes": %s, "usadaBytes": %s, "livreBytes": %s, "disponivelBytes": %s },\n' "$MEM_TOTAL" "$MEM_USADA" "$MEM_LIVRE" "$MEM_DISP"
  printf '  "disco": { "totalBytes": %s, "usadoBytes": %s, "livreBytes": %s, "usoPercentual": %s, "pontoMontagem": "/" },\n' "$DISCO_TOTAL" "$DISCO_USADO" "$DISCO_LIVRE" "$(num "$DISCO_USO")"
  printf '  "containers": [%s],\n' "$CONTAINERS_JSON"
  printf '  "node": %s,\n' "$(json_str "$NODE")"
  printf '  "appCommit": %s,\n' "$(json_str "$APP_COMMIT")"
  printf '  "appVersao": %s\n' "$(json_str "$APP_VERSAO")"
  printf '}\n'
} > "$TMP" && mv "$TMP" "$DEST"
