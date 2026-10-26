#!/usr/bin/env bash
# OuviDesk — troca de domínio (chamada por: deploy.sh dominio).
# Troca somente domínio/proxy na instalação existente. Não instala nem limpa dados.
set +x
set -Eeuo pipefail
umask 077
fail() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }
MODE="${1:-}"
[[ "$MODE" == '' || "$MODE" == --simular || "$MODE" == --restaurar ]] || fail 'Uso: bash deploy.sh dominio [--simular | --restaurar CAMINHO_DO_BACKUP]'
[[ $# -le 1 || ( "$MODE" == --restaurar && $# -eq 2 ) ]] || fail 'Argumentos inválidos.'
[[ -r /dev/tty ]] || fail 'Execute em um terminal interativo, não por curl | bash.'
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || fail 'Execute de dentro do clone da aplicação na VPS.'
cd "$ROOT"
[[ $EUID -eq 0 ]] || fail 'Execute com sudo, pois é necessário recarregar o Caddy e acessar o Docker.'
for cmd in node docker caddy systemctl curl flock cp mv df du realpath sha256sum; do
  command -v "$cmd" >/dev/null || fail "Comando ausente: $cmd. Nada foi alterado."
done
[[ "$(git branch --show-current)" == main ]] || fail 'Use a branch main da instalação VPS.'
CONFIG="$ROOT/local-docker/manutencao/dominio-config.mjs"
AUTH="$ROOT/local-docker/manutencao/dominio-auth.mjs"
ENVFILE="$ROOT/local-docker/.env.local"
CADDY=/etc/caddy/Caddyfile
[[ -f "$ENVFILE" && ! -L "$ENVFILE" && -f "$CADDY" && ! -L "$CADDY" ]] || fail 'Configuração ausente ou com links simbólicos. Revisão manual necessária.'
[[ -f "$CONFIG" && -f "$AUTH" ]] || fail 'Atualize primeiro com: bash deploy.sh atualizar'
[[ -z "${DOCKER_HOST:-}" && -z "${DOCKER_CONTEXT:-}" ]] || fail 'Use o Docker local da VPS, sem contexto/host remoto.'
[[ "$(docker context show)" == default ]] || fail 'O contexto Docker deve ser default (socket local).'
exec 9>/tmp/ouvidesk-deploy.lock
flock -n 9 || fail 'Há outra manutenção/atualização em andamento.'
COMPOSE=(docker compose --project-directory "$ROOT/local-docker" -f "$ROOT/local-docker/docker-compose.yml" -f "$ROOT/local-docker/docker-compose.prod.yml")
APP_ID="$("${COMPOSE[@]}" ps --all -q app)"
if [[ -n "$APP_ID" ]]; then
  APP_ROOT="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Source}}{{end}}{{end}}' "$APP_ID")"
  [[ "$APP_ROOT" == "$ROOT" ]] || fail 'O contêiner app pertence a outro clone.'
elif [[ "$MODE" != --restaurar ]]; then fail 'Aplicação deste clone não encontrada.'; fi
if [[ "$MODE" != --restaurar ]]; then
  systemctl is-active --quiet caddy || fail 'Caddy não está ativo.'
  [[ "$(docker inspect --format '{{.State.Running}}' "$APP_ID")" == true ]] || fail 'App não está ativo.'
fi
http_ok() {
  local status
  status="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 "$@")" || return 1
  [[ "$status" == 200 ]]
}
BACKUP=''
MUTATED=0
COMPLETE=0
OUTPUT_MOVED=0
rollback() {
  local error=0
  printf '\n==> Restaurando domínio e serviços anteriores...\n' >&2
  # Se a aplicação atual foi recriada ou estava parada, primeiro interrompa o app.
  "${COMPOSE[@]}" stop app >/dev/null 2>&1 || error=1
  if [[ -d "$BACKUP/output-original" ]]; then
    if [[ -e "$ROOT/.output" ]]; then mv "$ROOT/.output" "$BACKUP/output-failed-$(date +%s)" || error=1; fi
    mv "$BACKUP/output-original" "$ROOT/.output" || error=1
  elif [[ "$OUTPUT_MOVED" == 1 ]]; then
    printf 'Artefato anterior não encontrado. Não continuarei às cegas.\n' >&2
    return 1
  fi
  cp -p "$BACKUP/env.local.original" "$ENVFILE" || error=1
  cp -p "$BACKUP/Caddyfile.original" "$CADDY" || error=1
  node "$AUTH" restaurar "$ROOT" "$BACKUP" || error=1
  if [[ "$error" == 0 ]]; then
    if APP_DOMAIN="$(node "$CONFIG" atual "$ENVFILE")" "${COMPOSE[@]}" up -d --no-deps --force-recreate app >/dev/null 2>&1 && systemctl reload-or-restart caddy; then
      printf 'Arquivos e serviços anteriores restaurados. Confira login e logs.\n' >&2
      printf 'restaurado\n' > "$BACKUP/status.txt"
    else error=1; fi
  fi
  [[ "$error" == 0 ]] || printf 'ATENÇÃO: restauração incompleta. Backup protegido: %s. Revise os serviços antes de repetir.\n' "$BACKUP" >&2
  return "$error"
}
if [[ "$MODE" == --restaurar ]]; then
  [[ -n "${2:-}" ]] || fail 'Informe o caminho do backup mostrado pelo script.'
  BACKUP="$(realpath "$2")"
  [[ "$BACKUP" == "$ROOT/local-docker/backups/domain-"* && -d "$BACKUP" ]] || fail 'Use um backup domain-* deste clone.'
  [[ -f "$BACKUP/root.txt" && "$(cat "$BACKUP/root.txt")" == "$ROOT" ]] || fail 'Backup não pertence a este clone.'
  [[ -f "$BACKUP/status.txt" && "$(cat "$BACKUP/status.txt")" != restaurado ]] || fail 'Backup já restaurado ou incompleto.'
  [[ -d "$BACKUP/output-original" ]] || fail 'Artefato anterior não disponível. Nada foi restaurado.'
  (cd "$BACKUP" && sha256sum -c config.sha256 >/dev/null) || fail 'Integridade das configurações do backup inválida.'
  if [[ "$(cat "$BACKUP/status.txt")" == aplicando ]]; then
    if ! cmp -s "$ENVFILE" "$BACKUP/env.local.new" && ! cmp -s "$ENVFILE" "$BACKUP/env.local.original"; then fail 'Configuração env desconhecida após interrupção.'; fi
    if ! cmp -s "$CADDY" "$BACKUP/Caddyfile.new" && ! cmp -s "$CADDY" "$BACKUP/Caddyfile.original"; then fail 'Configuração Caddy desconhecida após interrupção.'; fi
  elif ! cmp -s "$ENVFILE" "$BACKUP/env.local.new" || ! cmp -s "$CADDY" "$BACKUP/Caddyfile.new"; then
    fail 'Configurações mudaram após a troca; faça uma revisão manual antes de restaurar.'
  fi
  if [[ -d .output ]]; then
    [[ -f .output/VERSION && "$(cat .output/VERSION)" == "$(cat "$BACKUP/versao.txt")" ]] || fail 'Front atualizado após a troca; não restaurarei uma versão antiga automaticamente.'
  else [[ "$(cat "$BACKUP/status.txt")" == aplicando ]] || fail 'Artefato atual desapareceu; revisão manual necessária.'; fi
  node "$AUTH" verificar-rollback "$ROOT" "$BACKUP"
  printf 'Restaurar domínio, app e autenticação a partir de %s? Digite RESTAURAR: ' "$BACKUP" >/dev/tty
  IFS= read -r answer </dev/tty
  [[ "$answer" == RESTAURAR ]] || fail 'Cancelado.'
  rollback
  exit $?
fi
[[ -f .output/server/index.mjs && ! -L .output ]] || fail 'É necessária a instalação em PRODUÇÃO com .output pronta. Atualize primeiro o front.'
# A versão instalada pode ser anterior ao HEAD quando só scripts/banco mudaram.
[[ -f .output/VERSION ]] && git merge-base --is-ancestor "$(cat .output/VERSION)" HEAD 2>/dev/null || fail 'Versão instalada desconhecida. Atualize antes com: bash deploy.sh atualizar'
# Recusar um app em Vite/dev: reiniciar em produção aqui seria uma troca de runtime não solicitada.
APP_CMD="$(docker inspect --format '{{json .Config.Cmd}}' "$APP_ID")"
[[ "$APP_CMD" == *'.output/server/index.mjs'* ]] || fail 'Aplicação não está no runtime de produção reconhecido.'
OLD_DOMAIN="$(node "$CONFIG" atual "$ENVFILE")"
printf '\nDomínio atual: %s\nNovo domínio (sem https://): ' "$OLD_DOMAIN" >/dev/tty
IFS= read -r INPUT </dev/tty
DOMAIN="$(node "$CONFIG" dominio "$INPUT")"
printf '\nProxy Cloudflare final:\n  1) Laranja (ativado)\n  2) Cinza (DNS-only/desativado)\nEscolha [1/2]: ' >/dev/tty
IFS= read -r answer </dev/tty
case "${answer,,}" in 1|laranja) PROXY=laranja ;; 2|cinza) PROXY=cinza ;; *) fail 'Escolha 1 (laranja) ou 2 (cinza).' ;; esac
printf '\nPara emitir o certificado com segurança, o NOVO domínio precisa estar CINZA agora,\ncom registro A para o IPv4 da VPS e sem AAAA. O domínio antigo não é removido do DNS.\n' >/dev/tty
if [[ "$PROXY" == laranja ]]; then
  printf 'Após o certificado, o script pedirá para ativar LARANJA e SSL/TLS Full (strict).\nNão use Flexible. Portas 80/443 abertas; não configure cache de páginas/API privadas.\n' >/dev/tty
fi
IP_DEFAULT="$(curl -4 -fsS --connect-timeout 5 --max-time 8 https://api.ipify.org 2>/dev/null || true)"
printf 'IPv4 público da VPS [%s]: ' "$IP_DEFAULT" >/dev/tty
IFS= read -r IP </dev/tty
IP="${IP:-$IP_DEFAULT}"
node "$CONFIG" dns "$DOMAIN" "$IP" || fail 'Ajuste o DNS no painel e execute novamente. Nada foi alterado.'
# DNS público não prova que o IP é este servidor: verificar resposta na origem local abaixo.
AVAILABLE="$(df -Pk "$ROOT" | awk 'END {print $4}')"
NEEDED="$(du -sk .output | awk '{print $1}')"
[[ "$AVAILABLE" -gt $((NEEDED + 102400)) ]] || fail 'Espaço insuficiente para preparar e guardar o artefato anterior.'
if [[ "$MODE" == --simular ]]; then
  BACKUP="$(mktemp -d /tmp/seta-domain-simulation.XXXXXX)"
else
  printf '\nSerá alterado: domínio público, proxy SETA no Caddy, URL pública do front e GoTrue.\nBanco, usuários, protocolos, chaves, tokens, ingestão e demais sites serão mantidos.\nHaverá uma breve interrupção do app/login e você precisará entrar novamente no novo domínio.\nConfirmar %s com proxy %s? Digite ALTERAR DOMINIO: ' "$DOMAIN" "$PROXY" >/dev/tty
  IFS= read -r answer </dev/tty
  [[ "$answer" == 'ALTERAR DOMINIO' ]] || fail 'Cancelado; nada foi alterado.'
  BACKUP="$ROOT/local-docker/backups/domain-$(date +%Y%m%d-%H%M%S)-$$"
  mkdir -p "$BACKUP"
fi
chmod 700 "$BACKUP"
on_exit() {
  local rc=$?
  trap - EXIT INT TERM
  if [[ "$MODE" == --simular ]]; then
    rm -rf -- "$BACKUP"
  elif [[ "$MUTATED" == 1 && "$COMPLETE" != 1 ]]; then
    rollback || true
  fi
  if [[ "$rc" != 0 ]]; then printf '\nOperação não concluída (código %s). Nenhum dado do banco foi apagado.\n' "$rc" >&2; fi
  exit "$rc"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cp -p "$ENVFILE" "$BACKUP/env.local.original"
cp -p "$CADDY" "$BACKUP/Caddyfile.original"
printf '%s\n' "$ROOT" > "$BACKUP/root.txt"
cp .output/VERSION "$BACKUP/versao.txt"
printf 'preparado\n' > "$BACKUP/status.txt"
cp -a .output "$BACKUP/output-new"
node "$CONFIG" preparar "$ROOT" "$BACKUP" "$DOMAIN" "$PROXY" "$CADDY"
node "$AUTH" snapshot "$ROOT" "$BACKUP" "$DOMAIN"
caddy validate --config "$BACKUP/Caddyfile.new" --adapter caddyfile >/dev/null
(cd "$BACKUP" && sha256sum env.local.original Caddyfile.original auth-inspect.json root.txt versao.txt > config.sha256)
if [[ "$MODE" == --simular ]]; then
  printf '\nSIMULAÇÃO APROVADA: domínio %s, proxy %s; configurações preparadas e Caddy validado.\nNenhum arquivo instalado, contêiner, DNS ou dado do banco foi modificado.\n' "$DOMAIN" "$PROXY"
  exit 0
fi
printf '==> Backup protegido: %s\n' "$BACKUP"
MUTATED=1
printf 'aplicando\n' > "$BACKUP/status.txt"
"${COMPOSE[@]}" stop app >/dev/null
mv .output "$BACKUP/output-original"
OUTPUT_MOVED=1
mv "$BACKUP/output-new" .output
cp "$BACKUP/env.local.new" "$ENVFILE"
chmod 600 "$ENVFILE"
node "$AUTH" aplicar "$ROOT" "$BACKUP"
cp "$BACKUP/Caddyfile.new" "$CADDY"
# Preserve acesso de leitura do usuário caddy como no arquivo original.
chmod --reference="$BACKUP/Caddyfile.original" "$CADDY"
APP_DOMAIN="$DOMAIN" "${COMPOSE[@]}" up -d --no-deps --force-recreate app >/dev/null
systemctl reload caddy
printf '==> Aguardando app, autenticação e certificado público (cerca de 180 segundos)...\n'
READY=0
DEADLINE=$((SECONDS + 180))
for i in $(seq 1 60); do
  [[ "$SECONDS" -lt "$DEADLINE" ]] || break
  if http_ok http://127.0.0.1:8080/auth >/dev/null 2>&1 &&
     http_ok --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/auth" >/dev/null 2>&1 &&
     node "$CONFIG" saude "$ENVFILE" http://127.0.0.1:54321 >/dev/null 2>&1; then READY=1; break; fi
  printf '    verificação %s/60...\n' "$i"
  sleep 3
done
[[ "$READY" == 1 ]] || fail 'Origem/HTTPS/autenticação não confirmou saúde. Restaurarei a configuração anterior.'
# Sem -k: certificado emitido pelo Caddy precisa ser válido publicamente antes de ativar o proxy.
http_ok "https://$DOMAIN/auth" || fail 'Novo domínio não respondeu HTTP 200 pela internet.'
node "$CONFIG" saude "$ENVFILE" "https://$DOMAIN"
if [[ "$PROXY" == laranja ]]; then
  printf '\nCertificado da origem validado. Agora, no painel Cloudflare:\n1. Ative SSL/TLS: FULL (STRICT) — nunca Flexible.\n2. Ative o proxy LARANJA no registro do NOVO domínio.\n3. Não use Cache Everything; desative Rocket Loader para este hostname.\n4. Para renovar HTTPS: deixe /.well-known/acme-challenge/* chegar à origem pela porta 80,\n   sem cache, bloqueio WAF, desafio ou redirecionamento HTTPS na borda nessa rota.\n   O Caddy fará o redirecionamento HTTPS das demais rotas.\nPressione ENTER após configurar (ou Ctrl+C para restaurar): ' >/dev/tty
  IFS= read -r _ </dev/tty
  EDGE=0
  for i in $(seq 1 24); do
    if http_ok -D "$BACKUP/edge-headers.txt" "https://$DOMAIN/auth" >/dev/null 2>&1 &&
       grep -qi '^cf-ray:' "$BACKUP/edge-headers.txt"; then EDGE=1; break; fi
    printf '    aguardando proxy Cloudflare: %s/24...\n' "$i"
    sleep 5
  done
  [[ "$EDGE" == 1 ]] || fail 'Proxy Cloudflare não respondeu com HTTPS saudável. Restaurarei a origem anterior; reveja o DNS no painel.'
  node "$CONFIG" saude "$ENVFILE" "https://$DOMAIN"
fi
printf 'concluido\n' > "$BACKUP/status.txt"
COMPLETE=1
printf '\nDomínio alterado: https://%s\nProxy selecionado: %s\nBackup: %s\n' "$DOMAIN" "$PROXY" "$BACKUP"
printf 'Rollback: sudo bash deploy.sh dominio --restaurar "%s"\n' "$BACKUP"
printf 'DNS/SSL/WAF do painel não são alterados pela VPS e devem ser revertidos manualmente se necessário.\n'
printf 'Atualize também callbacks OAuth Gmail, webhooks externos, links e favoritos que usavam o domínio anterior.\n'
