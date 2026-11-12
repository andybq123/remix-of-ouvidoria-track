#!/usr/bin/env bash
# Acrescenta um endereço ao MESMO app/banco, sem reinstalar serviços.
set -Eeuo pipefail
umask 077
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CADDY=/etc/caddy/Caddyfile
[ "$EUID" -eq 0 ] || { echo 'Execute com sudo.' >&2; exit 1; }
DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  read -rp 'Novo domínio (sem https://): ' DOMAIN
fi
[ -f "$CADDY" ] || { echo 'Configuração do servidor web não encontrada.' >&2; exit 1; }
TMP="$(mktemp /etc/caddy/.buraco-dominio.XXXXXX)"
BACKUP="$(mktemp /etc/caddy/.buraco-backup.XXXXXX)"
trap 'rm -f "$TMP" "$BACKUP"' EXIT
node --input-type=module - "$KIT/dominio-config.mjs" "$CADDY" "$TMP" "$DOMAIN" <<'JS'
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const [modulePath, input, output, domain] = process.argv.slice(2);
const { adicionarDominio } = await import(pathToFileURL(modulePath).href);
fs.writeFileSync(output, adicionarDominio(fs.readFileSync(input, 'utf8'), domain));
JS
if cmp -s "$CADDY" "$TMP"; then
  echo 'Esse domínio já está configurado; nada foi alterado.'
  exit 0
fi
caddy validate --config "$TMP" --adapter caddyfile
cp -p "$CADDY" "$BACKUP"
# Mantém proprietário e permissões do arquivo original.
cat "$TMP" > "$CADDY"
if ! systemctl reload caddy; then
  cat "$BACKUP" > "$CADDY"
  systemctl reload caddy || true
  echo 'Não foi possível aplicar. A configuração anterior foi restaurada.' >&2
  exit 1
fi
printf '\nEndereço adicionado: https://%s\nO endereço anterior continua atendendo o mesmo aplicativo e banco.\n' "$DOMAIN"
echo 'No DNS do novo domínio, aponte o registro A para o IP público desta VPS.'
echo 'O HTTPS será emitido quando o DNS estiver correto; não há redirecionamento entre os endereços.'