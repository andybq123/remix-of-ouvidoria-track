#!/usr/bin/env bash
# Instala o agente de atualização como serviço permanente na VPS.
# Rode uma única vez, como root:  sudo ./instalar.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$DIR/atualizador.sh"

cat > /etc/systemd/system/ouvidesk-atualizador.service <<EOF
[Unit]
Description=OuviDesk - Agente de atualizacao da VPS
After=docker.service
Requires=docker.service

[Service]
ExecStart=$DIR/atualizador.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now ouvidesk-atualizador.service
systemctl --no-pager --full status ouvidesk-atualizador.service | head -5
echo "Agente de atualização instalado e rodando."
