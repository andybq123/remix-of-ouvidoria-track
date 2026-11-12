#!/usr/bin/env bash
# ============================================================
#  Buraco Brusque — instalação nova na VPS (ao lado do OuviDesk)
#
#    sudo bash buraco-deploy/instalar.sh
#
#  Não toca no OuviDesk: usa portas 54331+ e 8081, contêineres
#  próprios (buraco-local / buraco-app) e apenas ANEXA um bloco
#  marcado ao Caddyfile.
# ============================================================
set -Eeuo pipefail
umask 077

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/opt/buraco-brusque"
LOG="/tmp/buraco-instalar.log"
: >"$LOG"; chmod 600 "$LOG"

titulo() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
ok()     { printf '  \033[32m✓\033[0m %s\n' "$*"; }
aviso()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
falha()  { printf '\n\033[31mERRO: %s\033[0m\n' "$*" >&2; [ -n "${2:-}" ] && printf '%s\n' "$2" >&2; exit 1; }
rodar()  { local msg="$1"; shift; printf '  … %s\n' "$msg"; "$@" >>"$LOG" 2>&1 || { tail -n 15 "$LOG" >&2; falha "$msg — falhou." "Envie o registro $LOG para o suporte."; }; ok "$msg"; }

# Procura o contêiner do banco do Buraco (pelo nome ou pela etiqueta do projeto),
# esperando até 90 s; se não achar, mostra o motivo na tela.
buraco_db() {
  local i c
  for i in $(seq 1 30); do
    c="$(docker ps --filter 'label=com.supabase.cli.project=buraco-local' --format '{{.Names}}' | grep -E '^supabase_db_' | head -1 || true)"
    [ -n "$c" ] || c="$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_buraco' | head -1 || true)"
    if [ -n "$c" ] && timeout 5 docker exec "$c" pg_isready -U postgres -q 2>/dev/null; then printf '\r  ✓ Banco respondendo            \n' >&2; echo "$c"; return 0; fi
    printf '\r  … Aguardando o banco responder (%ss de 90s)' "$((i*3))" >&2
    sleep 3
  done
  echo >&2
  {
    echo "--- contêineres do Buraco ---"
    docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -i buraco || echo "(nenhum)"
    c="$(docker ps -a --format '{{.Names}}' | grep -E '^supabase_db_buraco' | head -1 || true)"
    [ -n "$c" ] && { echo "--- últimas linhas do banco ($c) ---"; docker logs --tail 30 "$c" 2>&1; }
    echo "--- memória / disco ---"; free -m; df -h / | tail -1
  } | tee -a "$LOG" >&2
  return 1
}

titulo "Buraco Brusque — instalação"
[ "$EUID" -eq 0 ] || falha "Execute com sudo."
[ -r /dev/tty ] || falha "Execute em um terminal interativo, não por curl | bash."
for cmd in git docker caddy systemctl curl node npx openssl iptables; do
  command -v "$cmd" >/dev/null || falha "Comando ausente: $cmd. Instale o OuviDesk primeiro (ele prepara a VPS)."
done
docker info >/dev/null 2>&1 || falha "Docker não está rodando."

# ---------- 1. Perguntas ----------
titulo "Configuração"
read -rp "  Endereço do site [buraco.brusque.app.br]: " DOMAIN </dev/tty
DOMAIN="${DOMAIN:-buraco.brusque.app.br}"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+$ ]] || falha "Endereço inválido: $DOMAIN"

read -rp "  E-mail do primeiro administrador: " ADMIN_EMAIL </dev/tty
[[ "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || falha "E-mail inválido."
while true; do
  read -rsp "  Senha do administrador (mín. 8 caracteres): " ADMIN_PASS </dev/tty; echo
  [ "${#ADMIN_PASS}" -ge 8 ] && break
  aviso "Senha muito curta."
done

# ---------- 2. Código-fonte ----------
titulo "Código-fonte do aplicativo"
if [ -d "$APP_DIR/.git" ]; then
  ok "Código já presente em $APP_DIR"
else
  read -rp "  Endereço do repositório no GitHub (ex.: https://github.com/prefeitura/buraco-brusque.git): " REPO </dev/tty
  [ -n "$REPO" ] || falha "Repositório não informado."
  rodar "Baixando o código do aplicativo" git clone "$REPO" "$APP_DIR"
fi

# Arquivos de instalação entram no clone (supabase/, compose, scripts)
mkdir -p "$APP_DIR/supabase"
cp -r "$KIT/supabase/." "$APP_DIR/supabase/"
cp "$KIT/docker-compose.yml" "$APP_DIR/docker-compose.yml"
cp "$KIT/criar-admin.mjs" "$APP_DIR/criar-admin.mjs"
ok "Arquivos de instalação copiados"

# ---------- 3. Banco de dados e login locais ----------
titulo "Banco de dados e login locais"
cd "$APP_DIR"
sed -i "s#^site_url = .*#site_url = \"https://$DOMAIN\"#" supabase/config.toml
sed -i "s#^additional_redirect_urls = .*#additional_redirect_urls = [\"https://$DOMAIN\"]#" supabase/config.toml
npx --yes supabase stop --no-backup >>"$LOG" 2>&1 || true
rodar "Iniciando banco de dados (pode levar alguns minutos)" npx --yes supabase start -x vector,logflare,studio,imgproxy,edge-runtime,mailpit,postgres-meta --ignore-health-check
eval "$(timeout 120 npx --yes supabase status -o env 2>>"$LOG" | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"
[ -n "${ANON_KEY:-}" ] || falha "Não consegui ler as chaves do banco local."
DBC="$(buraco_db)" || falha "O banco local não iniciou." "Mande para o suporte as linhas acima."

# Estrutura do banco: aplica as migrações do próprio repositório (drizzle/migrations)
rodar "Aplicando a estrutura do banco" bash -c "
  set -e
  docker exec -i $DBC psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS public._migracoes_aplicadas (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now());
SQL
  for f in drizzle/migrations/*.sql; do
    n=\$(basename \"\$f\")
    if ! docker exec -i $DBC psql -X -qtA -U postgres -d postgres -c \"SELECT 1 FROM public._migracoes_aplicadas WHERE nome='\$n'\" | grep -q 1; then
      docker exec -i $DBC psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < \"\$f\"
      docker exec -i $DBC psql -X -q -U postgres -d postgres -c \"INSERT INTO public._migracoes_aplicadas(nome) VALUES ('\$n')\"
    fi
  done
  docker exec -i $DBC psql -X -q -U postgres -d postgres -c \"NOTIFY pgrst, 'reload schema'\"
"

# Área privada para as fotos (tolerante a reinstalação)
if curl -fsS "http://127.0.0.1:54331/storage/v1/bucket/fotos" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" >>"$LOG" 2>&1; then
  ok "Área de fotos já existia"
else
  rodar "Criando a área de fotos" curl -fsS -X POST "http://127.0.0.1:54331/storage/v1/bucket" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"id":"fotos","name":"fotos","public":false}'
fi

# ---------- 4. Configuração segura ----------
titulo "Gerando configuração segura"
cat > .env.local <<EOF
VITE_SUPABASE_URL=https://$DOMAIN
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=buraco-local
SUPABASE_URL=http://host.docker.internal:54331
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
APP_DOMAIN=$DOMAIN
EOF
chmod 600 .env.local
ok "Arquivo de configuração criado (protegido)"

# ---------- 5. Caddy (apenas anexa o bloco do Buraco) ----------
titulo "Publicando em $DOMAIN com HTTPS"
CADDY=/etc/caddy/Caddyfile
if [ -f "$CADDY" ] && grep -q "^$DOMAIN {" "$CADDY"; then
  ok "Bloco do $DOMAIN já existe no Caddy"
else
  [ -f "$CADDY" ] || : >"$CADDY"
  cat >>"$CADDY" <<EOF

# >>> buraco-deploy (não editar à mão; removido por buraco-deploy/remover.sh)
$DOMAIN {
  encode zstd gzip
  @assets path /assets/* /favicon.png /icons/* /manifest.webmanifest
  header @assets Cache-Control "public, max-age=31536000, immutable"
  @supabase path /auth/v1/* /rest/v1/* /realtime/v1/* /storage/v1/*
  reverse_proxy @supabase 127.0.0.1:54331
  reverse_proxy 127.0.0.1:8081
}
# <<< buraco-deploy
EOF
  rodar "Validando configuração do servidor web" caddy validate --config "$CADDY" --adapter caddyfile
fi
if ! bash -c 'systemctl reload caddy 2>/dev/null || systemctl restart caddy' >>"$LOG" 2>&1; then
  sleep 3
  bash -c 'systemctl reset-failed caddy 2>/dev/null; systemctl restart caddy' >>"$LOG" 2>&1 \
    && ok "Servidor web aplicado" \
    || aviso "HTTPS não ativou agora (DNS ainda propagando?). Ativa depois com: systemctl restart caddy"
else ok "Servidor web aplicado"; fi

IFACE="$(ip route | awk '/default/ {print $5; exit}')"
for P in 8081 54331 54332 54333 54334; do
  iptables -C DOCKER-USER ! -s 127.0.0.1 -i "$IFACE" -p tcp --dport $P -j DROP 2>/dev/null || \
  iptables -I DOCKER-USER ! -s 127.0.0.1 -i "$IFACE" -p tcp --dport $P -j DROP 2>/dev/null || true
done
ok "Portas internas bloqueadas para acesso externo"

# ---------- 6. Aplicativo em produção ----------
titulo "Instalando o aplicativo em MODO PRODUÇÃO"
aviso "A primeira compilação pode levar de 5 a 10 minutos."
rodar "Subindo o aplicativo" docker compose --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.yml" up -d
printf '  … Aguardando o aplicativo responder\n'
for i in $(seq 1 120); do
  if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:8081/" 2>/dev/null; then break; fi
  [ "$i" -eq 120 ] && falha "O aplicativo não respondeu a tempo." "Veja: docker logs buraco-app-1 — e o registro $LOG"
  sleep 10
done
ok "Aplicativo no ar"

# ---------- 7. Primeiro administrador ----------
titulo "Criando o primeiro administrador"
rodar "Criando administrador" env SUPABASE_URL="http://127.0.0.1:54331" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  node "$APP_DIR/criar-admin.mjs" "$ADMIN_EMAIL" "$ADMIN_PASS"

titulo "Instalação concluída"
cat <<EOF

  Site:   https://$DOMAIN
  Admin:  https://$DOMAIN/auth  ($ADMIN_EMAIL)

  Para atualizar no futuro:
    sudo bash $APP_DIR/buraco-deploy/atualizar.sh

EOF
