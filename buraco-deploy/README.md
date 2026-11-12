# Buraco Brusque na VPS

Instala o aplicativo **Buraco Brusque** na mesma VPS do OuviDesk, de forma
totalmente independente: banco de dados, login e fotos próprios, em
contêineres separados. Nada do OuviDesk é alterado.

## Antes de começar

1. A VPS já deve ter o OuviDesk instalado (ele prepara Docker, Caddy e firewall).
2. No provedor de domínio, crie o apontamento `buraco` → IP da VPS (registro A).
3. O projeto Buraco Brusque precisa estar conectado a um repositório no GitHub
   (o endereço será pedido na instalação).

## Instalar

De dentro do clone do OuviDesk na VPS:

```bash
sudo bash buraco-deploy/deploy.sh instalar
```

O instalador pergunta:

- o endereço do site (padrão: `buraco.brusque.app.br`);
- o e-mail e a senha do primeiro administrador;
- o endereço do repositório no GitHub (só na primeira vez).

Ao final, o site estará no ar em `https://buraco.brusque.app.br` e o painel
administrativo em `https://buraco.brusque.app.br/auth`.

## Atualizar

```bash
sudo bash /opt/buraco-brusque/buraco-deploy/atualizar.sh
```

Baixa a versão nova do GitHub, aplica mudanças de banco pendentes e recompila
somente o Buraco Brusque.

## Adicionar outro domínio sem remover o atual

No DNS de `chatizy.com.br`, crie o registro **A** `buraco` apontando para o
mesmo IP público da VPS. Não mantenha um AAAA apontando para outro servidor.
Depois, no clone do OuviDesk:

```bash
git pull
sudo bash buraco-deploy/deploy.sh dominio buraco.chatizy.com.br
```

Os dois endereços servem o mesmo aplicativo, banco e fotos, sem redirecionar
um para o outro. Não reinstala nem recompila o aplicativo, nem altera o
OuviDesk. O servidor valida a configuração e restaura a anterior se não
conseguir aplicá-la. HTTPS é emitido automaticamente após o DNS apontar
corretamente. Login já existente continua disponível; a sessão do navegador
é separada por endereço. A URL principal do serviço de login não é alterada.

## Como fica na VPS

| Item | OuviDesk | Buraco Brusque |
| --- | --- | --- |
| Código | clone atual | `/opt/buraco-brusque` |
| Porta interna do app | 8080 | 8081 |
| Porta do banco/login | 54321 | 54331 |
| Contêineres | `supabase_*_seta-local` | `supabase_*_buraco-local`, `buraco-app-1` |

## Observações

- O bloco do `buraco.brusque.app.br` é **anexado** ao Caddyfile entre as marcas
  `# >>> buraco-deploy` e `# <<< buraco-deploy`. Se você reinstalar o OuviDesk
  ou trocar o domínio dele (ações que reescrevem o Caddyfile), rode novamente
  o instalador do Buraco para recriar o bloco.
- Outros administradores são criados pelo próprio painel, na página de
  administração.
- Registros de instalação/atualização: `/tmp/buraco-instalar.log` e
  `/tmp/buraco-atualizar.log` na VPS.
