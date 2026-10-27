# OuviDesk — pasta do servidor

Tudo o que roda na VPS fica aqui. O ponto de entrada é sempre o comando da raiz do projeto:

```bash
sudo bash deploy.sh          # menu: instalar, atualizar, domínio, ferramentas
```

## Conteúdo

| Pasta/arquivo | O que é |
|---|---|
| `deploy/` | Instalação, atualização, troca de domínio, ferramentas e funções comuns usadas pelo `deploy.sh`. |
| `deploy/conferir-instalacao.sql` | Conferência do banco ao final de cada instalação/atualização. |
| `deploy/licenca.conf` | Endereço padrão de licença codificado em `LICENCA_URL_B64`, lido pelos comandos e heartbeat. Configurado = licença exigida para instalar/atualizar; sem endereço = verificação desligada. |
| `atualizacoes-banco/` | Mudanças do banco, numeradas, aplicadas em ordem a cada atualização. Todas podem rodar mais de uma vez sem erro. |
| `supabase/` | Estrutura inicial do banco e configuração do login local. |
| `agente-1doc/` | Agente que confere as ouvidorias no 1Doc (fila de pedidos). |
| `agente-atualizacao/` | Serviço que atende o botão "Atualizar" do sistema e executa `deploy.sh atualizar`. |
| `manutencao/` | Auxiliares da troca de domínio e da limpeza para importação. |
| `docker-compose*.yml` | Sistema, coletor de e-mails e agente 1Doc. |
| `.env.local` | Configuração desta VPS (gerada na instalação, protegida, fora do Git). |
| `backups/` | Cópias automáticas do banco antes de atualizar, importar ou trocar domínio (as 5 mais recentes de cada tipo). |

## Uso em computador de desenvolvimento

Requisitos: Docker e Node.js 24 LTS.

```bash
cd local-docker
npx supabase start            # banco + login locais, já com a estrutura
cp .env.local.example .env.local   # cole as chaves mostradas por: npx supabase status
for f in atualizacoes-banco/*.sql; do docker exec -i "$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -1)" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"; done
node create-admin.mjs admin@exemplo.local 'SenhaForte#2026' admin
docker compose up             # http://localhost:8080
```

## Coleta de e-mails

- O coletor chama `/api/public/email-sync` a cada 3 minutos com `Authorization: Bearer $CRON_SECRET`.
- Gmail usa cursor de histórico; IMAP usa UID/UIDVALIDITY. Se alguma mensagem falhar, o cursor não avança e a mensagem é tentada de novo.
- Se o servidor IMAP trocar UIDVALIDITY, a conta pausa e mostra o motivo em **Último erro**.

## Guias

- [e-SIC](../docs/esic.md)
- [Limpeza e importação de backup](../docs/limpeza-importacao.md)
- [Troca de domínio e Cloudflare](../docs/alterar-dominio.md)
- [Segurança](SEGURANCA.md)
