#!/usr/bin/env bash
# Heartbeat da licença (roda a cada 5 min pelo timer ouvidesk-licenca.timer).
# Grava o resultado em public.licenca_estado. Servidor fora do ar = nada muda.
# Regra espelhada em src/lib/licenca-estado.ts (decidirEstado) e seus testes.
set -uo pipefail
source "$(dirname "$0")/comum.sh"
LOG=/var/log/ouvidesk-licenca.log
registrar() { printf '%s %s\n' "$(date -Is)" "$1" >>"$LOG" 2>/dev/null || true; }

url="$(licenca_url)" || { registrar "configuração de licença inválida; estado mantido"; exit 1; }
[ -n "$url" ] || { registrar "LICENCA_URL vazia; heartbeat desligado"; exit 0; }
[ -s "$LICENCA_ARQ" ] || { registrar "sem chave de licença em $LICENCA_ARQ"; exit 0; }
[ -n "$(banco_container)" ] || { registrar "banco não está rodando"; exit 0; }

chave="$(tr -d '[:space:]"\\' < "$LICENCA_ARQ")"
dominio="$(grep -sE '^APP_DOMAIN=' "$LD/.env.local" | head -1 | cut -d= -f2- | tr -d '"')"
versao="$(git -C "$RAIZ" rev-parse --short HEAD 2>/dev/null || echo desconhecida)"
corpo="{\"chave\":\"$chave\",\"dominio\":\"$dominio\",\"instalacao_id\":\"$(instalacao_id)\",\"versao\":\"$versao\"}"

if ! resp="$(curl -fsS --max-time 15 -H 'Content-Type: application/json' -d "$corpo" "${url%/}/api/public/heartbeat" 2>/dev/null)"; then
  registrar "servidor de licenças indisponível; estado mantido"; exit 0
fi
valida="$(printf '%s' "$resp" | grep -oE '"valida" *: *(true|false)' | grep -oE 'true|false' || true)"
codigo="$(printf '%s' "$resp" | grep -oE '"codigo" *: *"[^"]*"' | sed -E 's/.*: *"(.*)"/\1/' | tr -cd 'a-zA-Z0-9_-' || true)"
msg="$(printf '%s' "$resp" | grep -oE '"mensagem" *: *"[^"]*"' | sed -E 's/.*: *"(.*)"/\1/' | tr -d '$\\' | cut -c1-500 || true)"

case "$codigo" in
  instance_blocked|revoked|suspended|expired) bloq=true; motivo="${msg:-$codigo}" ;;
  *) if [ "$valida" = "true" ]; then bloq=false; motivo=""; else
       registrar "resposta sem decisão (valida=$valida codigo=$codigo); estado mantido"; exit 0; fi ;;
esac
if sql "INSERT INTO public.licenca_estado (id, bloqueado, motivo, codigo, verificado_em)
        VALUES (1, $bloq, NULLIF(\$m\$$motivo\$m\$, ''), NULLIF('$codigo', ''), now())
        ON CONFLICT (id) DO UPDATE SET bloqueado=EXCLUDED.bloqueado, motivo=EXCLUDED.motivo,
          codigo=EXCLUDED.codigo, verificado_em=EXCLUDED.verificado_em;" >/dev/null 2>>"$LOG"; then
  registrar "bloqueado=$bloq codigo=${codigo:-?}"
else
  registrar "falha ao gravar no banco"
fi
