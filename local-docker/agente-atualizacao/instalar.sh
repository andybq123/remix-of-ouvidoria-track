#!/usr/bin/env bash
# Instala (ou confere) o agente de atualização como serviço permanente.
# Rode como root:  bash instalar.sh
# Idempotente: só reinicia o serviço quando a configuração mudou ou ele não
# está rodando — assim nunca interrompe uma atualização em andamento.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Execute como root:  sudo bash $0"; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$DIR/atualizador.sh" "$DIR/instalar.sh" "$DIR/../../deploy.sh" 2>/dev/null || true

UNIT=/etc/systemd/system/ouvidesk-atualizador.service
NOVO="$(mktemp)"
cat > "$NOVO" <<EOF
[Unit]
Description=OuviDesk - Agente de atualizacao da VPS
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
User=root
Environment=HOME=/root
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=DEBIAN_FRONTEND=noninteractive
Environment=NEEDRESTART_SUSPEND=1
Environment=OUVIDESK_AGENTE_ATUALIZACAO=1
WorkingDirectory=$DIR
ExecStart=/bin/bash $DIR/atualizador.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

MUDOU=0
if ! cmp -s "$NOVO" "$UNIT" 2>/dev/null; then
  install -m 0644 "$NOVO" "$UNIT"
  MUDOU=1
fi
rm -f "$NOVO"

systemctl daemon-reload
systemctl enable ouvidesk-atualizador.service >/dev/null 2>&1
if [ "$MUDOU" = 1 ] || ! systemctl is-active --quiet ouvidesk-atualizador.service; then
  systemctl restart ouvidesk-atualizador.service
  sleep 2
fi

if systemctl is-active --quiet ouvidesk-atualizador.service; then
  echo "Agente de atualização instalado e rodando."
  echo "Para acompanhar ao vivo:  journalctl -u ouvidesk-atualizador -f"
else
  systemctl --no-pager --full status ouvidesk-atualizador.service | head -15 || true
  echo "O agente de atualização não iniciou. Veja: journalctl -u ouvidesk-atualizador -n 50"
  exit 1
fi
