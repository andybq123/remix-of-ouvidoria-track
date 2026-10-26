#!/usr/bin/env bash
# OuviDesk — ferramentas de manutenção (chamada por: deploy.sh ferramentas)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comum.sh"
cd "$RAIZ"

titulo "Ferramentas"
cat <<EOF

  1) Criar usuário ou redefinir senha
  2) Conferir o sistema (banco, permissões e serviços)
  3) Importar backup (.zip do sistema)
  4) Preparar o banco para importar backup pela tela (simular antes)
  5) Retomar a coleta de e-mails após a importação
  6) Trocar a licença
  7) Reinstalar o serviço do botão "Atualizar"
  0) Sair

EOF
read -rp "  Escolha: " OP
case "$OP" in
  1) bash "$DEPLOY_DIR/criar-usuario.sh" ;;
  2)
    : > "$LOG"
    [ -n "$(banco_container)" ] && ok "Banco local rodando." || falha "Banco local parado." "Reinicie a VPS ou rode: bash deploy.sh atualizar --rapido"
    aplicar_banco
    sql "select count(*) from public.user_roles where role = 'admin'" | grep -qv '^0$' \
      && ok "Existe pelo menos um administrador." || aviso "Nenhum administrador cadastrado. Use a opção 1."
    curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:8080 && ok "Sistema respondendo." || aviso "O sistema não respondeu na porta interna."
    systemctl is-active --quiet ouvidesk-atualizador && ok "Serviço do botão Atualizar ativo." || aviso "Serviço do botão Atualizar parado (opção 7)."
    docker ps --format '{{.Names}}' | grep -q agente-1doc && ok "Agente 1Doc rodando." || aviso "Agente 1Doc parado."
    printf "      ${C_D}•${C_0} Espaço livre: %s\n" "$(df -Ph "$RAIZ" | awk 'END {print $4}')"
    ;;
  3)
    read -rp "  Caminho do arquivo .zip do backup: " ZIP
    travar
    backup_banco antes-importacao
    bash "$DEPLOY_DIR/importar-backup.sh" "$ZIP"
    ;;
  4)
    read -rp "  Apenas simular (nada é apagado)? [S/n]: " SIM
    if [[ "${SIM:-S}" =~ ^[SsYy]$ ]]; then bash "$DEPLOY_DIR/limpar-para-importacao.sh" --simular
    else bash "$DEPLOY_DIR/limpar-para-importacao.sh"; fi
    ;;
  5) bash "$DEPLOY_DIR/retomar-ingestao.sh" ;;
  6) pedir_licenca; validar_licenca ;;
  7) bash "$LD/agente-atualizacao/instalar.sh" ;;
  *) exit 0 ;;
esac
