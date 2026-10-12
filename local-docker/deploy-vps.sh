#!/usr/bin/env bash
# Instala e sobe o Controle SETA numa VPS Linux (Ubuntu/Debian) com subdomínio + HTTPS.
# Uso:  sudo bash deploy-vps.sh seta.seudominio.com.br seu@email.com
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
[ -z "$DOMAIN" ] && read -rp "Subdomínio (ex: seta.seudominio.com.br): " DOMAIN
[ -z "$EMAIL" ] && read -rp "E-mail do admin (também usado no certificado HTTPS): " EMAIL
[ -z "$DOMAIN" ] || [ -z "$EMAIL" ] && { echo "Subdomínio e e-mail são obrigatórios"; exit 1; }

cd "$(dirname "$0")"
DIR="$(pwd)"
echo "==> Instalando em $DIR para https://$DOMAIN"

# 1. Pacotes base
apt-get update -y
apt-get install -y ca-certificates curl gnupg openssl debian-keyring debian-archive-keyring apt-transport-https

# 2. Docker
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

# 3. Node.js 22
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# 4. Caddy (proxy reverso com HTTPS automático)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

# 5. Ajusta URLs de login para o subdomínio
sed -i "s#^site_url = .*#site_url = \"https://$DOMAIN\"#" supabase/config.toml
sed -i "s#^additional_redirect_urls = .*#additional_redirect_urls = [\"https://$DOMAIN\"]#" supabase/config.toml

# 6. Sobe o banco
npx --yes supabase start
eval "$(npx --yes supabase status -o env | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"

# 7. Gera .env.local (mantém tokens se já existir)
INGEST_TOKEN="$(grep -s '^INGEST_TOKEN=' .env.local | cut -d= -f2- || true)"
CRON_SECRET="$(grep -s '^CRON_SECRET=' .env.local | cut -d= -f2- || true)"
[ -z "$INGEST_TOKEN" ] && INGEST_TOKEN="$(openssl rand -hex 24)"
[ -z "$CRON_SECRET" ] && CRON_SECRET="$(openssl rand -hex 24)"
cat > .env.local <<EOF
VITE_SUPABASE_URL=https://$DOMAIN
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=seta-local
SUPABASE_URL=http://host.docker.internal:54321
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
INGEST_TOKEN=$INGEST_TOKEN
CRON_SECRET=$CRON_SECRET
APP_DOMAIN=$DOMAIN
EOF
chmod 600 .env.local

# 8. Caddy: app e banco no mesmo subdomínio
cat > /etc/caddy/Caddyfile <<EOF
{
  email $EMAIL
}
$DOMAIN {
  encode gzip
  @supabase path /auth/v1/* /rest/v1/* /realtime/v1/* /storage/v1/* /functions/v1/*
  reverse_proxy @supabase 127.0.0.1:54321
  reverse_proxy 127.0.0.1:8080
}
EOF
systemctl reload caddy || systemctl restart caddy

# 9. Bloqueia acesso externo direto às portas internas (banco, painel, app)
for P in 8080 54321 54322 54323 54324; do
  iptables -C DOCKER-USER ! -i lo -p tcp --dport $P -j DROP 2>/dev/null || \
  iptables -I DOCKER-USER ! -s 127.0.0.1 -i "$(ip route | awk '/default/ {print $5; exit}')" -p tcp --dport $P -j DROP || true
done

# 10. Sobe o app (reinicia sozinho se a VPS reiniciar)
docker compose up -d

# 11. Cria admin com senha aleatória (só aparece aqui no terminal)
if [ ! -f .admin-criado ]; then
  ADMIN_PASS="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
  echo "==> Aguardando banco..."; sleep 5
  SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node create-admin.mjs "$EMAIL" "$ADMIN_PASS"
  touch .admin-criado
  echo ""
  echo "=========== GUARDE ESTES DADOS ==========="
  echo " Login: $EMAIL"
  echo " Senha: $ADMIN_PASS"
  echo "=========================================="
fi

echo ""
echo "Pronto! Acesse: https://$DOMAIN   (o app leva ~1-2 min para compilar na 1a vez)"
echo "Logs do app:  cd $DIR && docker compose logs -f app"
