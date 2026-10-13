# Trocar o domínio da instalação VPS

O comando `alterar_dominio.sh` foi feito para a instalação **existente em produção** deste projeto: Caddy instalado na VPS, Supabase local iniciado pela CLI e app Node via Docker Compose com `.output` pronta. Não é um instalador e não executa migrations, limpeza, importação nem atualização do código.

## 1. Receber o script

Depois do merge do PR e de o build VPS do GitHub terminar com sucesso:

```bash
cd ~/controle-seta
./atualizar_front.sh
```

O script deve estar na **raiz** do clone, não em `local-docker`. Execute o comando pelo arquivo, nunca por `curl | bash`, pois ele precisa de perguntas/confirmacões no terminal.

## 2. Preparar o DNS

- Crie um registro **A** do novo domínio/subdomínio para o **IPv4 público desta VPS**.
- Mantenha esse registro **cinza/DNS-only temporariamente**, inclusive se você pretende usar laranja ao final. Isso permite emitir e validar o certificado público da origem antes de ligar o proxy.
- Remova temporariamente registros **AAAA** do novo hostname. O comando aborta se houver IPv6, pois não presume que sua origem IPv6 esteja corretamente configurada. Depois, só recoloque AAAA com IPv6 funcional, firewall e Caddy conferidos.
- Deixe as portas **80 e 443** acessíveis na VPS. Não abra as portas internas 8080, 54321 ou 54322.
- Aguarde a propagação. O comando recusa múltiplos IPs no registro A ou IPs diferentes do IPv4 informado.
- **Não remova o DNS antigo** enquanto estiver testando a troca. Ele ajuda no rollback, mas o script não mantém uma segunda cópia do app no domínio anterior.

O IPv4 sugerido é consultado em `https://api.ipify.org`; confira e corrija o valor no terminal se necessário. Essa consulta não envia tokens, chaves ou conteúdo do sistema.

## 3. Simular e aplicar

```bash
cd ~/controle-seta
sudo ./alterar_dominio.sh --simular
sudo ./alterar_dominio.sh
```

Na simulação e na execução real, o script pergunta:

1. Novo domínio, **sem** `https://`, porta ou caminho.
2. Proxy final: **1 = laranja**, **2 = cinza**.
3. IPv4 público da VPS.

Na execução real, depois de mostrar o escopo, exige a frase **ALTERAR DOMINIO**. Na simulação, prepara arquivos em diretório temporário, lê a configuração do GoTrue e valida o Caddy, mas **não modifica arquivos instalados, contêineres, DNS nem banco**. A simulação não comprova que o certificado será emitido: isso ocorre na aplicação real.

### O que muda

- `APP_DOMAIN`, `VITE_SUPABASE_URL` e `SETA_PROXY_MODE` em `local-docker/.env.local`.
- URLs públicas dos bundles já compilados; remoção das cópias comprimidas desses arquivos que ficariam desatualizadas; ajuste do mapa interno de tamanhos/ETags do servidor.
- Somente o bloco do sistema em `/etc/caddy/Caddyfile`, preservando o bloco global e os demais sites.
- URLs públicas do **GoTrue realmente em execução**: site de login, callbacks da origem antiga e URL externa quando existente. Callbacks de terceiros são preservados.
- Recriação somente do contêiner `app` e troca reversível somente do contêiner de autenticação, com a mesma imagem imutável, configuração, credenciais, redes e volumes.

### O que permanece

Banco e volumes do Supabase; usuários/senhas/permissões; protocolos/e-SIC; secretarias/assuntos; logs; IA; contas, cursores e tokens de e-mail; `.env` da raiz; chaves pública/service-role/JWT; tokens cron e ingestão; regras dos demais sites; configurações locais de pausa da ingestão.

**Haverá uma breve interrupção de app e login.** Como o hostname muda, você deverá entrar novamente no novo domínio. O banco não é parado nem recriado.

### Instalações personalizadas

Para não quebrar sua configuração, o comando recusa bloco compartilhado por múltiplos hostnames, configuração importada sem bloco SETA reconhecível, personalizações não reconhecidas ou modificações posteriores no bloco gerenciado. Também recusa runtime de desenvolvimento, contexto Docker remoto, GoTrue com IP estático e links simbólicos nos arquivos editados. Nesses casos, é preciso revisar a configuração antes, não forçar a execução.

## 4. Posso usar laranja?

**Sim.** Configure Cloudflare com **SSL/TLS → Full (strict)**. O certificado público válido emitido pelo Caddy protege o trecho Cloudflare → VPS. **Não use Flexible**, pois o redirecionamento HTTPS da origem pode causar loop.

Se escolher laranja, o comando:

1. Faz a troca com o DNS ainda cinza.
2. Valida app, GoTrue e HTTPS na própria origem, sem `-k`/sem ignorar certificados.
3. Valida o acesso pelo domínio público.
4. Pausa e pede que você configure **Full (strict)** e ative **laranja** no painel.
5. Depois do ENTER, verifica o domínio novamente e exige resposta com `CF-Ray`, além da saúde de autenticação.

**O script não altera sua conta Cloudflare, DNS, SSL/TLS, WAF ou cache via API.** A pergunta escolhe a configuração da VPS e orienta os passos do painel; não muda sozinho a cor da nuvem. Não solicita API token Cloudflare.

### Renovação do certificado

O modo laranja usa o desafio **HTTP-01**, pois TLS-ALPN não atravessa um proxy que termina TLS. Para renovação funcionar, a rota `/.well-known/acme-challenge/*` precisa alcançar o Caddy pela **porta 80**, sem cache, bloqueios/desafios WAF ou redirecionamento para HTTPS **na borda** nessa rota.

A forma mais simples é deixar **Always Use HTTPS desativado na Cloudflare** para este fluxo, usando o redirecionamento automático do Caddy. Se sua zona atende outros sites, não altere regras de toda a zona às cegas: crie a exceção apropriada ao hostname/rota ou peça uma revisão. Se usar Redirect Rules, Page Rules, Access, Workers, Bot Fight ou outra proteção, confira também a rota ACME. O script valida o HTTPS atual, mas **não certifica suas regras de renovação futura**. Acompanhe os logs do Caddy e mantenha a rota disponível.

### Cache, WebSockets e limites

- **Não use Cache Everything** ou regra que sobrescreva `Cache-Control` para o sistema. Respostas do bloco SETA recebem `Cache-Control: no-store`, incluindo APIs, HTML e assets alterados, para evitar cache indevido durante as atualizações e vazamento de respostas privadas. Regras explícitas de Edge TTL podem ignorar o header: revise-as no painel.
- Desative **Rocket Loader** neste hostname para não alterar os scripts do front.
- WebSockets são suportados pela Cloudflare; confirme que estão ativados se usar realtime.
- Laranja adiciona limites: upload de **100 MB em Free/Pro**, **200 MB em Business**; timeout de leitura da origem padrão de **125 segundos** e escrita de **30 segundos**, sujeito às opções do plano. Um backup grande ou operação longa pode exigir cinza ou um fluxo em lotes.
- O script encaminha o IP real do visitante apenas para conexões originadas das faixas oficiais Cloudflare. Headers forjados em acesso direto não são tratados como IP confiável. A lista estática foi conferida em **13/10/2026** e deve ser mantida atualizada se as faixas mudarem.

## 5. Verificar após a troca

Abra `https://NOVO_DOMINIO`, faça login e confira protocolos, e-SIC, dashboard, backup/importação e a tela de contas de e-mail. Depois:

- Atualize no Google Cloud os **redirect URIs OAuth de Gmail** que usavam o hostname anterior. A coleta com token já emitido pode continuar, mas uma nova autorização precisa do callback correto.
- Atualize URLs externas de webhooks e integrações, favoritos e links enviados a terceiros.
- Confira a renovação HTTPS e os logs:

```bash
sudo journalctl -u caddy --no-pager -n 80
cd ~/controle-seta/local-docker
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail 80 app
```

Não publique logs com credenciais ou conteúdo pessoal.

## 6. Backup e rollback

O backup fica em `local-docker/backups/domain-DATA-HORA-PID/`, ignorado pelo Git e com diretório **700**. Inclui `.env.local`, Caddyfile, configuração/estado do GoTrue e artefato anterior. **Há segredos nesses arquivos; não envie ao GitHub e copie apenas para armazenamento protegido.** Não é um dump do banco: a troca não modifica dados do banco.

Em falha detectada ou Ctrl+C após começar a alteração, o comando **tenta restaurar** arquivos e serviços anteriores. Se a VPS perder energia ou a restauração falhar, confira o estado dos contêineres e o backup antes de repetir. Ele não promete recuperação automática quando o processo é encerrado por `kill -9` ou falta de energia.

Após uma troca bem-sucedida, o comando mostra:

```bash
sudo ./alterar_dominio.sh --restaurar "/caminho/real/mostrado/pelo/script"
```

O rollback manual exige a palavra **RESTAURAR** e recusa sobrescrever mudanças posteriores de configuração, versão do front ou contêiner GoTrue. O contêiner GoTrue anterior fica **parado, sem reinício automático**, com nome contendo `_dominio_`, para viabilizar essa restauração. Não o exclua enquanto quiser preservar o rollback.

**DNS/SSL/cache/WAF do painel não são revertidos pelo script**: se você já mudou a cor ou regras, volte manualmente às escolhas anteriores quando necessário.

## 7. Atualizações futuras

`./atualizar_front.sh` continua lendo `local-docker/.env.local`; por isso, novos builds apontarão ao novo domínio. A troca não gera alterações em arquivos rastreados nem interfere no preflight do atualizador.

O contêiner GoTrue novo mantém sua configuração em reinícios normais do Docker e da VPS. O script **não edita o `supabase/config.toml` rastreado**: ele serve como modelo do instalador, não como configuração ativa do contêiner já criado. **Não rode `deploy-vps.sh` novamente nem faça `supabase stop/start` para trocar domínio**, pois esses procedimentos podem recriar a autenticação com as URLs do modelo antigo. Se precisar recriar a stack Supabase, revise o modelo/configuração de implantação e reaplique a troca de domínio antes de liberar o acesso.

## 8. Testes de desenvolvimento

Sem VPS ou credenciais reais:

```bash
bash -n alterar_dominio.sh
shellcheck alterar_dominio.sh
node --test tests/dominio/*.node.mjs
```

Requer Node 22 e Caddy disponível no PATH. Os testes usam fixtures, API Docker simulada, socket HTTP local e Caddy real em portas de loopback; cobrem validação, isolamento de sites, preservação de segredos, troca/recovery do GoTrue, bundles/tamanhos e proteção de headers de proxy. A execução na sua VPS não foi realizada pelo autor do PR.

## Referências oficiais

- [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
- [Loops de redirecionamento](https://developers.cloudflare.com/ssl/troubleshooting/too-many-redirects/)
- [Limites de conexão e timeout](https://developers.cloudflare.com/fundamentals/reference/connection-limits/)
- [Limites de upload/cache](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)
- [WebSockets](https://developers.cloudflare.com/network/websockets/)
- [IPs Cloudflare IPv4](https://www.cloudflare.com/ips-v4) e [IPv6](https://www.cloudflare.com/ips-v6)
- [Caddy: HTTPS automático](https://caddyserver.com/docs/automatic-https)
