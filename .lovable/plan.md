# Buraco Brusque na mesma VPS do OuviDesk

## Objetivo
Instalar o app Buraco Brusque (mapa público de buracos + painel admin) na mesma VPS do OuviDesk, 100% local (banco, login e fotos em contêineres próprios), no endereço `buraco.brusque.app.br`, sem interferir no OuviDesk.

## Como vai funcionar
- O OuviDesk continua intacto: mesmo Caddy, mesmo Docker, portas diferentes.
- O Buraco Brusque terá sua própria pilha local (banco PostgreSQL + login + armazenamento de fotos), igual ao modelo que o OuviDesk já usa na VPS, mas em portas livres (54331+ em vez de 54321+) e com o app na porta interna 8081 (OuviDesk usa 8080).
- O Caddy (já instalado) ganha um bloco novo para `buraco.brusque.app.br`, com HTTPS automático, sem mexer no bloco do OuviDesk.
- Os dados do Buraco Brusque ficam em contêineres próprios: nada é compartilhado com o banco do OuviDesk.

## O que será criado neste projeto (pasta `buraco-deploy/`)
1. **`buraco-deploy/supabase/config.toml`** — configuração do backend local do Buraco (id próprio, portas 54331–54337, fotos privadas habilitadas, endereço `https://buraco.brusque.app.br`).
2. **`buraco-deploy/supabase/migrations/0000_buracos.sql`** — cópia da estrutura do banco do projeto Buraco Brusque (tabela de buracos, agrupamento por proximidade de 20 m, papéis de administrador, fotos).
3. **`buraco-deploy/docker-compose.yml`** — app em modo produção (Node 24, compilação local na primeira instalação), escutando só em 127.0.0.1:8081.
4. **`buraco-deploy/instalar.sh`** — instalador interativo (estilo do `deploy.sh` do OuviDesk):
   - verifica Docker e Caddy (já existem na VPS);
   - clona o repositório do Buraco Brusque em `/opt/buraco-brusque`;
   - copia os arquivos de instalação para dentro do clone;
   - sobe o backend local, aplica a estrutura do banco e cria a área de fotos;
   - gera a configuração segura (chaves locais, sem segredo no código);
   - adiciona o bloco `buraco.brusque.app.br` no Caddy (sem tocar no do OuviDesk) e ativa o HTTPS;
   - compila o app em modo produção;
   - pergunta e cria o primeiro administrador (e-mail + senha).
5. **`buraco-deploy/atualizar.sh`** — atualização: baixa a versão nova do GitHub, recompila e reinicia só o Buraco Brusque.
6. **`buraco-deploy/deploy.sh`** — menu único: instalar / atualizar.
7. **`buraco-deploy/README.md`** — instruções em linguagem simples.

## O que você precisa fazer na VPS (depois)
1. No provedor de domínio, criar o apontamento `buraco` → IP da VPS (registro A).
2. Rodar: `sudo bash buraco-deploy/deploy.sh instalar` (de dentro do clone do OuviDesk na VPS).
3. Informar e-mail e senha do primeiro administrador quando pedido.

## Validação antes de entregar
- Compilar o código do Buraco Brusque localmente (cópia em /tmp) para garantir que o build de produção funciona fora da Lovable.
- Conferir que o instalador não toca em portas, contêineres ou no Caddy do OuviDesk.
- Testes de instalação limpa não serão possíveis aqui (não há Docker na caixa de testes); o instalador terá as mesmas proteções do instalador do OuviDesk (trava, log, verificação de cada etapa).

## Limites
- O código do app em si não será alterado (ele já está pronto no projeto Buraco Brusque).
- O botão "Atualizar" dentro do app Buraco Brusque não existirá nesta etapa — atualização é pelo comando na VPS.
- Qualquer administrador cadastrado poderá gerenciar os buracos e outros administradores (já é assim no app).
