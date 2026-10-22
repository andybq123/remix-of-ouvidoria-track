#!/usr/bin/env bash
# Instala (ou reinstala) o agente de atualização como serviço permanente.
# Rode como root:  bash instalar.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$DIR/atualizador.sh" "$DIR/instalar.sh" "$DIR/../atualizar.sh" 2>/dev/null || true

cat > /etc/systemd/system/ouvidesk-atualizador.service <<EOF
[Unit]
Description=OuviDesk - Agente de atualizacao da VPS
After=docker.service
Requires=docker.service

[Service]
User=root
Environment=HOME=/root
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WorkingDirectory=$DIR
ExecStart=/bin/bash $DIR/atualizador.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ouvidesk-atualizador.service >/dev/null
systemctl restart ouvidesk-atualizador.service
sleep 2
systemctl --no-pager --full status ouvidesk-atualizador.service | head -8
echo
echo "Agente de atualização instalado e rodando."
echo "Para acompanhar ao vivo:  journalctl -u ouvidesk-atualizador -f"
