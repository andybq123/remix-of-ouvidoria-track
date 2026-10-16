#!/usr/bin/env bash
# ============================================================
#  Controle SETA — Instalador para VPS Linux (Ubuntu/Debian)
#  Instala tudo 100% local (app + banco + login) em MODO PRODUÇÃO,
#  com domínio próprio e HTTPS automático.
#
#  Uso:  sudo bash deploy-vps.sh                 (modo interativo)
#        sudo bash deploy-vps.sh dominio email   (direto)
# ============================================================
set -euo pipefail

# ---------- Visual ----------
if [ -t 1 ]; then
  B=$'\e[1m'; D=$'\e[2m'; R=$'\e[0m'
  AZ=$'\e[38;5;39m'; VD=$'\e[38;5;42m'; AM=$'\e[38;5;214m'; VM=$'\e[38;5;196m'
else B=""; D=""; R=""; AZ=""; VD=""; AM=""; VM=""; fi

TOTAL_ETAPAS=10; ETAPA=0
LOG=/tmp/controle-seta-instalacao.log; : > "$LOG"

linha()  { printf "${AZ}%s${R}\n" "────────────────────────────────────────────────────────────"; }
etapa()  { ETAPA=$((ETAPA+1)); echo; printf "${B}${AZ}[%d/%d]${R} ${B}%s${R}\n" "$ETAPA" "$TOTAL_ETAPAS" "$1"; }
ok()     { printf "   ${VD}✔${R} %s\n" "$1"; }
info()   { printf "   ${D}•${R} %s\n" "$1"; }
aviso()  { printf "   ${AM}!${R} %s\n" "$1"; }
falha()  { printf "\n${VM}${B}✖ ERRO:${R} %s\n   Detalhes em: %s\n\n" "$1" "$LOG"; exit 1; }
rodar()  { # rodar "descrição" comando...
  local msg="$1"; shift
  ( "$@" >>"$LOG" 2>&1 ) & local pid=$!
  local s='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r   ${AZ}%s${R} %s " "${s:i++%10:1}" "$msg"; sleep 0.15
  done
  if wait "$pid"; then printf "\r   ${VD}✔${R} %s   \n" "$msg"; else printf "\r   ${VM}✖${R} %s\n" "$msg"; echo; tail -n 15 "$LOG"; falha "$msg"; fi
}

trap 'printf "\n${VM}Instalação interrompida.${R} Log: %s\n" "$LOG"' INT

[ "$(id -u)" -eq 0 ] || { echo "Execute como root:  sudo bash $0"; exit 1; }

clear 2>/dev/null || true
cat <<EOF
${AZ}${B}
   ╔══════════════════════════════════════════════════════╗
   ║                                                      ║
   ║        CONTROLE SETA  ·  Instalador da VPS           ║
   ║        Ouvidoria · Triagem · Mapas · Relatórios      ║
   ║                                                      ║
   ╚══════════════════════════════════════════════════════╝${R}

  Este assistente vai instalar o sistema ${B}completo e local${R}:
   ${VD}✔${R} Banco de dados e login na própria VPS (nada na nuvem)
   ${VD}✔${R} Modo ${B}produção${R} (rápido e otimizado)
   ${VD}✔${R} HTTPS automático no seu domínio
   ${VD}✔${R} Coleta de e-mails a cada 3 minutos

EOF

IP_PUBLICO="$(curl -fsS -m 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
linha
printf "  ${B}Antes de continuar:${R} no seu DNS (ex.: Cloudflare), crie um\n"
printf "  registro ${B}Tipo A${R} do domínio apontando para: ${AM}${B}%s${R}\n" "$IP_PUBLICO"
linha; echo

# ---------- Perguntas ----------
DOMAIN="${1:-}"; EMAIL="${2:-}"
while [ -z "$DOMAIN" ]; do
  read -rp "  ${B}1)${R} Domínio do sistema ${D}(ex.: ouvidoria.prefeitura.gov.br)${R}: " DOMAIN
done
DOMAIN="$(echo "$DOMAIN" | sed -E 's#^https?://##; s#/.*$##' | tr 'A-Z' 'a-z')"
while ! [[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; do
  read -rp "  ${B}2)${R} E-mail do administrador ${D}(login e certificado HTTPS)${R}: " EMAIL
done

IP_DNS="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
echo
printf "  Domínio : ${B}https://%s${R}\n  E-mail  : ${B}%s${R}\n" "$DOMAIN" "$EMAIL"
if [ -z "$IP_DNS" ]; then aviso "O domínio ainda não responde no DNS. O HTTPS só ativa depois que apontar."
elif [ "$IP_DNS" != "$IP_PUBLICO" ]; then aviso "DNS aponta para $IP_DNS (normal se usar Cloudflare laranja)."
else ok "DNS já aponta para esta VPS."; fi
echo
read -rp "  Tudo certo? Iniciar instalação [S/n]: " RESP
[[ "${RESP:-S}" =~ ^[SsYy]$ ]] || { echo "  Cancelado."; exit 0; }

cd "$(dirname "$0")"; DIR="$(pwd)"
INICIO=$(date +%s)

# ---------- 1. Pacotes ----------
etapa "Preparando o sistema operacional"
export DEBIAN_FRONTEND=noninteractive
rodar "Atualizando lista de pacotes" apt-get update -y
rodar "Instalando ferramentas básicas" apt-get install -y ca-certificates curl gnupg openssl git debian-keyring debian-archive-keyring apt-transport-https

# ---------- 2. Memória ----------
etapa "Verificando memória (swap)"
if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
  rodar "Criando 4 GB de memória extra" bash -c 'fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096; chmod 600 /swapfile; mkswap /swapfile; swapon /swapfile; grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab'
else ok "Memória extra já configurada"; fi

# ---------- 3. Docker ----------
etapa "Docker"
if ! command -v docker >/dev/null; then rodar "Instalando Docker" bash -c 'curl -fsSL https://get.docker.com | sh'
else ok "Docker já instalado"; fi
rodar "Ativando Docker" systemctl enable --now docker

# ---------- 4. Node ----------
etapa "Node.js"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  rodar "Instalando Node.js 22" bash -c 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs'
else ok "Node.js $(node -v) já instalado"; fi

# ---------- 5. Caddy ----------
etapa "Servidor web com HTTPS (Caddy)"
if ! command -v caddy >/dev/null; then
  rodar "Instalando Caddy" bash -c "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list && apt-get update -y && apt-get install -y caddy"
else ok "Caddy já instalado"; fi

# ---------- 6. Banco ----------
etapa "Banco de dados e login locais"
sed -i "s#^site_url = .*#site_url = \"https://$DOMAIN\"#" supabase/config.toml
sed -i "s#^additional_redirect_urls = .*#additional_redirect_urls = [\"https://$DOMAIN\"]#" supabase/config.toml
npx --yes supabase stop --no-backup >>"$LOG" 2>&1 || true
rodar "Iniciando banco de dados (pode levar alguns minutos)" npx --yes supabase start -x vector,logflare,studio,imgproxy,edge-runtime,mailpit,inbucket,postgres-meta --ignore-health-check
eval "$(npx --yes supabase status -o env 2>>"$LOG" | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"
[ -n "${ANON_KEY:-}" ] || falha "Não consegui ler as chaves do banco local."
DBC="$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -1 || true)"
if [ -n "$DBC" ] && ls ./atualizacoes-banco/*.sql >/dev/null 2>&1; then
  rodar "Aplicando otimizações e índices do banco" bash -c "for f in ./atualizacoes-banco/*.sql; do docker exec -i $DBC psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres < \"\$f\" || exit 1; done"
fi

# ---------- 7. Configuração ----------
etapa "Gerando configuração segura"
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
ok "Arquivo de configuração criado (protegido)"

# ---------- 8. Caddy + firewall ----------
etapa "Publicando no domínio com HTTPS"
cat > /etc/caddy/Caddyfile <<EOF
{
  email $EMAIL
}
$DOMAIN {
  encode zstd gzip
  @assets path /assets/* /favicon.png /icons/*
  header @assets Cache-Control "public, max-age=31536000, immutable"
  @supabase path /auth/v1/* /rest/v1/* /realtime/v1/* /storage/v1/* /functions/v1/*
  reverse_proxy @supabase 127.0.0.1:54321
  reverse_proxy 127.0.0.1:8080
}
EOF
rodar "Aplicando configuração do servidor web" bash -c 'systemctl reload caddy || systemctl restart caddy'
IFACE="$(ip route | awk '/default/ {print $5; exit}')"
for P in 8080 54321 54322 54323 54324; do
  iptables -C DOCKER-USER ! -s 127.0.0.1 -i "$IFACE" -p tcp --dport $P -j DROP 2>/dev/null || \
  iptables -I DOCKER-USER ! -s 127.0.0.1 -i "$IFACE" -p tcp --dport $P -j DROP 2>/dev/null || true
done
ok "Portas internas bloqueadas para acesso externo"

# ---------- 9. App em produção ----------
etapa "Instalando o sistema em MODO PRODUÇÃO"
if [ -d ../.git ] && [ -x ./atualizar.sh ]; then
  info "Usando a versão compilada do GitHub (mais rápido)..."
  ./atualizar.sh || falha "Falha ao instalar a versão de produção."
else
  info "Compilando na VPS (pode levar 5–10 minutos na primeira vez)..."
  rm -rf ../.output 2>/dev/null || true
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate >>"$LOG" 2>&1 \
    || falha "Não consegui iniciar o sistema."
  T=0
  until curl -fsS -m 3 -o /dev/null http://127.0.0.1:8080/; do
    T=$((T+5)); printf "\r   ${AZ}⏳${R} Compilando e iniciando... %ds " "$T"; sleep 5
    [ "$T" -ge 1500 ] && falha "O sistema não respondeu a tempo. Veja: docker compose logs app"
  done; echo
fi
ok "Sistema no ar em modo produção"

# ---------- 10. Admin ----------
etapa "Criando acesso de administrador"
ADMIN_PASS=""
if [ ! -f .admin-criado ]; then
  ADMIN_PASS="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
  sleep 3
  SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
    node create-admin.mjs "$EMAIL" "$ADMIN_PASS" >>"$LOG" 2>&1 || falha "Não consegui criar o administrador."
  touch .admin-criado
  ok "Administrador criado"
else ok "Administrador já existia (senha mantida)"; fi

DUR=$(( $(date +%s) - INICIO ))
echo
printf "${VD}${B}"
cat <<EOF
   ╔══════════════════════════════════════════════════════╗
   ║           ✔  INSTALAÇÃO CONCLUÍDA COM SUCESSO         ║
   ╚══════════════════════════════════════════════════════╝
EOF
printf "${R}"
printf "   Tempo total: %dm%02ds\n\n" $((DUR/60)) $((DUR%60))
printf "   🌐 Acesse:  ${B}https://%s${R}\n" "$DOMAIN"
if [ -n "$ADMIN_PASS" ]; then
  echo
  printf "   ${AM}${B}GUARDE ESTES DADOS (só aparecem agora):${R}\n"
  printf "   Login: ${B}%s${R}\n   Senha: ${B}%s${R}\n" "$EMAIL" "$ADMIN_PASS"
  printf "   ${D}Troque a senha após o primeiro acesso.${R}\n"
fi
echo
linha
printf "  ${B}Cloudflare (nuvem laranja):${R}\n"
echo "   • SSL/TLS: Full (strict)    • WebSockets: ativado"
echo "   • Rocket Loader: desativado"
linha
printf "  ${B}Comandos úteis${R} (em %s):\n" "$DIR"
echo "   ./atualizar.sh                      atualizar o sistema"
echo "   docker compose logs -f app          ver logs do sistema"
echo "   docker compose logs -f coletor-email  ver coleta de e-mails"
linha
echo
