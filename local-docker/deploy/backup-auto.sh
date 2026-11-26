#!/usr/bin/env bash
# ============================================================
#  OuviDesk — Backup automático (rotina da VPS)
#
#  Chamado pelo timer systemd ouvidesk-backup (a cada 15 min).
#  Lê a configuração de public.backup_config, decide se o backup
#  está vencido (ou foi solicitado pelo painel), faz o dump completo
#  do banco + .env.local e envia aos destinos ativos:
#    - pasta na VPS (local-docker/<vps_pasta>/auto-<data>)
#    - Google Drive, via rclone + conta de serviço (JSON no banco)
#    - S3 compatível (B2, Wasabi, MinIO...), via rclone
#  Cada execução é gravada em public.backup_runs (o painel mostra o
#  histórico e o alerta semanal lê o último backup com sucesso).
#
#  O .zip de cada execução se chama ouvidesk-backup-AAAAMMDD-HHMMSS.zip
#  e contém database.dump (+ sha256) e .env.local. Para restaurar numa
#  VPS nova: descompacte, copie o .env.local para local-docker/ e
#  restaure o dump com pg_restore -d postgres database.dump.
#  (O formato é diferente do .zip de exportação do painel, que é CSV.)
#
#  Sem rclone, os destinos remotos falham com erro registrado (a
#  cópia local, se ativa, continua valendo). O script tenta instalar
#  rclone/zip na primeira vez que precisar deles.
# ============================================================
set -euo pipefail
LOG="${LOG:-/tmp/ouvidesk-backup.log}"
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source ./deploy/comum.sh

RUN_ID=""
DESTINOS_OK=()
TMPDIR_BACKUP=""
RC_CONF=""
ARQ_ZIP=""

sql_esc() { printf "%s" "$1" | sed "s/'/''/g"; }

# Registra a execução como erro (quando já existe uma linha) e sai.
registrar_erro() {
  local msg="$1"
  echo "[backup] ERRO: $msg" >>"$LOG" 2>/dev/null || true
  if [ -n "$RUN_ID" ]; then
    local destinos_sql="{$(IFS=,; echo "${DESTINOS_OK[*]}")}"
    sql "UPDATE public.backup_runs SET status='erro', finalizado_em=now(), destinos='$destinos_sql', erro='$(sql_esc "$msg")' WHERE id='$RUN_ID';" >>"$LOG" 2>&1 || true
  fi
  exit 1
}

limpar_tmp() {
  [ -n "$TMPDIR_BACKUP" ] && rm -rf "$TMPDIR_BACKUP"
}
trap limpar_tmp EXIT

main() {
  exec 9>/tmp/ouvidesk-backup.lock
  flock -n 9 || { echo "[backup] outra execução em andamento; saindo." >>"$LOG"; exit 0; }

  [ -n "$(banco_container)" ] || { echo "[backup] banco local não está rodando." >>"$LOG"; exit 1; }
  command -v python3 >/dev/null || { echo "[backup] python3 não encontrado na VPS." >>"$LOG"; exit 1; }

  # ---------- 1. lê a configuração ----------
  local cfg_json
  cfg_json="$(sql "SELECT row_to_json(c) FROM (SELECT * FROM public.backup_config WHERE id) c;")"
  [ -n "$cfg_json" ] || { echo "[backup] backup automático nunca configurado; nada a fazer." >>"$LOG"; exit 0; }

  TMPDIR_BACKUP="$(mktemp -d)"
  chmod 700 "$TMPDIR_BACKUP"
  local cfg_sh="$TMPDIR_BACKUP/config.sh"
  python3 - "$cfg_json" "$TMPDIR_BACKUP" >"$cfg_sh" <<'PY'
import json, re, shlex, sys

cfg = json.loads(sys.argv[1])
tmp = sys.argv[2]

def q(v):
    return shlex.quote("" if v is None else str(v))

def pasta_id(url):
    if not url:
        return ""
    m = re.search(r"/folders/([A-Za-z0-9_-]{10,})", url)
    if m:
        return m.group(1)
    m = re.search(r"[?&]id=([A-Za-z0-9_-]{10,})", url)
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{10,}", url.strip()):
        return url.strip()
    return ""

# Pasta local: só caminho relativo simples, sem subir de nível.
pasta = (cfg.get("vps_pasta") or "backups").strip()
if pasta.startswith("/") or ".." in pasta.split("/"):
    pasta = "backups"

prefixo = (cfg.get("s3_prefixo") or "ouvidesk-backups/").strip()
if not prefixo.endswith("/"):
    prefixo += "/"

sa = cfg.get("drive_sa_json")
tem_sa = bool(sa)
if tem_sa:
    with open(f"{tmp}/sa.json", "w") as f:
        json.dump(sa, f)

out = {
    "HABILITADO": "true" if cfg.get("habilitado") else "false",
    "INTERVALO_HORAS": cfg.get("intervalo_horas") or 24,
    "MANTER": cfg.get("manter_copias") or 7,
    "SOLICITAR_AGORA": "true" if cfg.get("solicitar_agora") else "false",
    "DESTINO_VPS": "true" if cfg.get("destino_vps") else "false",
    "VPS_PASTA": pasta,
    "DESTINO_DRIVE": "true" if cfg.get("destino_drive") else "false",
    "DRIVE_PASTA_ID": pasta_id(cfg.get("drive_pasta_url")),
    "TEM_SA": "true" if tem_sa else "false",
    "DESTINO_S3": "true" if cfg.get("destino_s3") else "false",
    "S3_ENDPOINT": cfg.get("s3_endpoint") or "",
    "S3_BUCKET": cfg.get("s3_bucket") or "",
    "S3_REGIAO": cfg.get("s3_regiao") or "",
    "S3_PREFIXO": prefixo,
    "S3_ACCESS_KEY": cfg.get("s3_access_key") or "",
    "S3_SECRET_KEY": cfg.get("s3_secret_key") or "",
}
for k, v in out.items():
    print(f"{k}={q(v)}")
PY
  # shellcheck disable=SC1090
  source "$cfg_sh"

  [ "$HABILITADO" = "true" ] || { echo "[backup] rotina desativada no painel; nada a fazer." >>"$LOG"; exit 0; }

  # ---------- 2. está vencido ou foi solicitado? ----------
  local ultimo_ok_s=""
  ultimo_ok_s="$(sql "SELECT COALESCE(EXTRACT(EPOCH FROM now() - max(finalizado_em))::bigint, 999999999) FROM public.backup_runs WHERE status='ok';")"
  if [ "${OUVIDESK_BACKUP_FORCAR:-}" != "1" ] && [ "$SOLICITAR_AGORA" != "true" ] && [ "${ultimo_ok_s:-999999999}" -le $((INTERVALO_HORAS * 3600)) ]; then
    echo "[backup] último backup há ${ultimo_ok_s}s (intervalo ${INTERVALO_HORAS}h); nada a fazer." >>"$LOG"
    exit 0
  fi
  # Limpa a solicitação para a próxima rodada não repetir.
  sql "UPDATE public.backup_config SET solicitar_agora = NULL WHERE id = true;" >>"$LOG" 2>&1 || true

  # ---------- 3. abre a execução ----------
  RUN_ID="$(sql "INSERT INTO public.backup_runs (status) VALUES ('em_andamento') RETURNING id;")"
  [ -n "$RUN_ID" ] || registrar_erro "Não consegui registrar a execução no banco."
  echo "[backup] execução $RUN_ID iniciada." >>"$LOG"

  # ---------- 4. dump do banco (+ .env.local) ----------
  local dbc pasta ts
  dbc="$(banco_container)"
  ts="$(date +%Y%m%d-%H%M%S)"
  pasta="$LD/$VPS_PASTA/auto-$ts"
  mkdir -p "$pasta"; chmod 700 "$LD/$VPS_PASTA" "$pasta" 2>/dev/null || true
  if ! docker exec "$dbc" pg_dump -U postgres -d postgres -Fc > "$pasta/database.dump" 2>>"$LOG" \
      || [ ! -s "$pasta/database.dump" ]; then
    rm -rf "$pasta"
    registrar_erro "Não consegui fazer o dump do banco."
  fi
  chmod 600 "$pasta/database.dump"
  (cd "$pasta" && sha256sum database.dump > database.sha256)
  [ -f "$LD/.env.local" ] && cp "$LD/.env.local" "$pasta/.env.local" && chmod 600 "$pasta/.env.local"
  echo "[backup] dump em $pasta." >>"$LOG"

  # ---------- 5. zipa para os destinos remotos ----------
  ARQ_ZIP="ouvidesk-backup-$ts.zip"
  local zip_path="$TMPDIR_BACKUP/$ARQ_ZIP"
  command -v zip >/dev/null || apt-get install -y zip >>"$LOG" 2>&1 || true
  command -v zip >/dev/null || registrar_erro "O comando zip não está disponível na VPS."
  local arquivos_zip=(database.dump database.sha256)
  [ -f "$pasta/.env.local" ] && arquivos_zip+=(.env.local)
  (cd "$pasta" && zip -q "$zip_path" "${arquivos_zip[@]}") \
    || registrar_erro "Não consegui compactar o backup."
  local tamanho
  tamanho="$(stat -c%s "$zip_path")"

  # ---------- 6. destinos ----------
  local falhas=()
  if [ "$DESTINO_VPS" = "true" ]; then
    DESTINOS_OK+=("vps")
    # Rotação local: mantém só as N pastas auto-* mais recentes.
    local antigas
    antigas="$(ls -1dt "$LD/$VPS_PASTA"/auto-* 2>/dev/null | tail -n +"$((MANTER + 1))" || true)"
    [ -n "$antigas" ] && printf "%s\n" $antigas | xargs -r rm -rf
  fi

  if [ "$DESTINO_DRIVE" = "true" ] || [ "$DESTINO_S3" = "true" ]; then
    command -v rclone >/dev/null || apt-get install -y rclone >>"$LOG" 2>&1 || true
    if ! command -v rclone >/dev/null; then
      [ "$DESTINO_DRIVE" = "true" ] && falhas+=("Drive: rclone não está instalado na VPS")
      [ "$DESTINO_S3" = "true" ] && falhas+=("S3: rclone não está instalado na VPS")
    else
      RC_CONF="$TMPDIR_BACKUP/rclone.conf"
      : > "$RC_CONF"; chmod 600 "$RC_CONF"
      if [ "$DESTINO_DRIVE" = "true" ]; then
        if [ "$TEM_SA" != "true" ] || [ -z "$DRIVE_PASTA_ID" ]; then
          falhas+=("Drive: falta a conta de serviço ou o link da pasta no painel")
        else
          cat >>"$RC_CONF" <<RC
[drive]
type = drive
scope = drive
service_account_file = $TMPDIR_BACKUP/sa.json
root_folder_id = $DRIVE_PASTA_ID
RC
          if rclone --config "$RC_CONF" copyto "$zip_path" "drive:/$ARQ_ZIP" --retries 2 >>"$LOG" 2>&1; then
            DESTINOS_OK+=("drive")
            rotacionar_rclone "drive:/" || falhas+=("Drive: não consegui apagar as cópias antigas")
          else
            falhas+=("Drive: falha no envio (veja $LOG)")
          fi
        fi
      fi
      if [ "$DESTINO_S3" = "true" ]; then
        if [ -z "$S3_ENDPOINT" ] || [ -z "$S3_BUCKET" ] || [ -z "$S3_ACCESS_KEY" ] || [ -z "$S3_SECRET_KEY" ]; then
          falhas+=("S3: faltam endpoint, bucket ou chaves no painel")
        else
          cat >>"$RC_CONF" <<RC
[s3]
type = s3
provider = Other
endpoint = $S3_ENDPOINT
region = $S3_REGIAO
access_key_id = $S3_ACCESS_KEY
secret_access_key = $S3_SECRET_KEY
acl = private
RC
          if rclone --config "$RC_CONF" copyto "$zip_path" "s3:$S3_BUCKET/$S3_PREFIXO$ARQ_ZIP" --retries 2 >>"$LOG" 2>&1; then
            DESTINOS_OK+=("s3")
            rotacionar_rclone "s3:$S3_BUCKET/$S3_PREFIXO" || falhas+=("S3: não consegui apagar as cópias antigas")
          else
            falhas+=("S3: falha no envio (veja $LOG)")
          fi
        fi
      fi
    fi
  fi

  # Sem cópia local, a pasta é só temporária — mas se algum destino
  # remoto falhou, mantém a pasta para recuperação manual.
  if [ "$DESTINO_VPS" != "true" ] && [ "${#falhas[@]}" -eq 0 ]; then
    rm -rf "$pasta"
  fi

  # ---------- 7. fecha a execução ----------
  local destinos_sql="{$(IFS=,; echo "${DESTINOS_OK[*]}")}"
  if [ "${#falhas[@]}" -gt 0 ]; then
    local msg
    msg="Backup feito, mas com falhas: $(IFS="; "; echo "${falhas[*]}")"
    [ "$DESTINO_VPS" != "true" ] && msg="$msg Pasta local mantida em $pasta."
    sql "UPDATE public.backup_runs SET status='erro', finalizado_em=now(), arquivo='$(sql_esc "$ARQ_ZIP")', tamanho_bytes=$tamanho, destinos='$destinos_sql', erro='$(sql_esc "$msg")' WHERE id='$RUN_ID';" >>"$LOG" 2>&1 || true
    echo "[backup] $msg" >>"$LOG"
    exit 1
  fi
  sql "UPDATE public.backup_runs SET status='ok', finalizado_em=now(), arquivo='$(sql_esc "$ARQ_ZIP")', tamanho_bytes=$tamanho, destinos='$destinos_sql' WHERE id='$RUN_ID';" >>"$LOG" 2>&1 \
    || registrar_erro "Backup feito, mas não consegui registrar o resultado no banco."
  echo "[backup] OK: $ARQ_ZIP (${tamanho} bytes) -> ${DESTINOS_OK[*]}." >>"$LOG"
}

# Apaga os arquivos ouvidesk-backup-*.zip mais antigos que os N
# recentes no destino rclone (nomes carregam a data: ordem
# alfabética = cronológica). Devolve 0 mesmo sem nada a apagar.
rotacionar_rclone() {
  local destino="$1" saida nomes=() n excluir i
  saida="$(rclone --config "$RC_CONF" lsf --files-only "$destino" 2>/dev/null)" || return 1
  mapfile -t nomes < <(printf "%s\n" "$saida" | grep "^ouvidesk-backup-.*\.zip$" || true)
  n="${#nomes[@]}"
  [ "$n" -le "$MANTER" ] && return 0
  excluir=$((n - MANTER))
  for ((i = 0; i < excluir; i++)); do
    rclone --config "$RC_CONF" delete "$destino${nomes[$i]}" >>"$LOG" 2>&1 || return 1
  done
  return 0
}

main "$@" || registrar_erro "Falha inesperada na rotina (veja $LOG)."
