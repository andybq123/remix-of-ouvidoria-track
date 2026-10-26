# OuviDesk — Sistema de Ouvidoria e Transparência

O OuviDesk é o sistema da Ouvidoria da Prefeitura de Brusque para receber, organizar, encaminhar e acompanhar manifestações dos cidadãos (ouvidorias) e pedidos de acesso à informação (e-SIC/LAI) até a resposta final, dentro do prazo legal.

Ele roda **inteiro em um servidor próprio (VPS)**: site, banco de dados, login, coleta de e-mails e agentes ficam na mesma máquina. Nenhum dado de cidadão é guardado em nuvem de terceiros.

---

## O que o sistema faz

### 1. Recebe as manifestações sozinho
- Lê a caixa de e-mail da Ouvidoria (Gmail ou IMAP) a cada 3 minutos.
- Cada e-mail de ouvidoria ou de e-SIC vira um **protocolo** com número, data original, solicitante, assunto e texto.
- Uma IA (Groq ou Gemini, com uma principal e outra de reserva) lê o e-mail e sugere tipo, secretaria e assunto. Se a leitura não for confiável, o protocolo vai para a **triagem**.
- O número interno do e-SIC é sempre igual ao número oficial do e-SIC.
- Na tela **E-mail** é possível buscar em toda a caixa os e-SIC que faltaram, ou só números específicos.

### 2. Triagem
- Fila de protocolos que precisam de conferência humana: secretaria, assunto, endereço e ponto no mapa (obrigatório para Obras/SOSU).
- Só administradores e usuários com permissão de modificar podem triar.

### 3. Controle de prazos
- Ouvidoria: 30 dias, prorrogáveis por mais 30. e-SIC: 20 dias, prorrogáveis por mais 10.
- Selos de prazo (em dia, vencendo, atrasado) nas listas e na ficha do protocolo.
- Lista de atrasados por secretaria e sino de avisos.

### 4. Ficha do protocolo
- Histórico completo de cada mudança, link do 1Doc, endereço, conclusão, prorrogação e reabertura.
- Conclusão em lote colando uma lista de protocolos, datas e links.

### 5. Agente 1Doc
- Abre o link do 1Doc de cada ouvidoria e confere situação, assunto, finalidade, endereço e a linha de baixa.
- Só conclui a ouvidoria quando encontra a linha de baixa; caso contrário mantém aberta e só atualiza os dados.
- Pode conferir uma ouvidoria, uma secretaria, um local ou todo o painel de atrasados, em segundo plano, com aviso ao terminar.
- Toda alteração fica no histórico e pode ser revertida.
- Tela **Sem link 1Doc** para preencher os links que faltam.

### 6. Painel, mapas e relatórios
- Painel com indicadores, resolução no prazo, concentração por local e atrasados.
- Mapas da Saúde (unidades) e de Obras/SOSU (pontos), com filtro de prazo e ícone escolhido por secretaria.
- Relatórios por secretaria e por unidade, com gráficos e PDF.
- **BI público** em `/bi`: só números (por mês, secretaria, tipo, bairro e mapas), sem dados pessoais.

### 7. Usuários e permissões
- **Administrador**: acesso total.
- **Usuário**: somente leitura, limitado às áreas escolhidas no cadastro (ex.: só Saúde, só Vigilância Sanitária, só Obras).
- **Pode modificar o sistema**: opção por usuário que libera editar, concluir, prorrogar e triar nas suas áreas. Excluir protocolos é só do administrador.
- Senha forte obrigatória (8+ caracteres, maiúscula, minúscula, número e símbolo).
- Só e-mails autorizados pelo administrador conseguem entrar.

### 8. Registro do sistema e backup
- **Registro do sistema**: toda criação, alteração e exclusão, com data, autor e valor antes/depois.
- **Backup**: exportação e importação completas pela tela; cópias automáticas do banco antes de cada atualização.

### 9. Atualização pelo próprio sistema
- Em **Configurações → Atualização**, o administrador clica em "Atualizar sistema agora" e acompanha a barra de progresso. O servidor executa o mesmo comando do terminal.

---

## Instalação, atualização e manutenção

Tudo é feito por **um único comando** na raiz do projeto, como root:

```bash
sudo -i
cd /root/controle-seta     # pasta onde o projeto foi clonado
bash deploy.sh
```

Ele mostra o menu:

| Opção | Para que serve |
|---|---|
| 1) Instalação nova | Instala tudo numa VPS vazia: Docker, banco, login, HTTPS, sistema, agentes e o primeiro administrador. |
| 2) Atualizar o sistema | Baixa a versão nova, faz cópia do banco, aplica as mudanças do banco, troca a versão e confere se voltou ao ar. |
| 3) Alterar o domínio | Troca o endereço do site com simulação, cópia de segurança e restauração automática se algo falhar. |
| 4) Ferramentas | Criar usuário/senha, conferir o sistema, importar backup, preparar/retomar importação, trocar licença, reativar o serviço do botão Atualizar. |

Também dá para chamar direto: `bash deploy.sh instalar`, `bash deploy.sh atualizar`, `bash deploy.sh dominio`, `bash deploy.sh ferramentas`.

### Instalação em uma VPS nova (Ubuntu/Debian)

1. No DNS, crie um registro **A** do domínio apontando para o IP da VPS e libere as portas **80** e **443**.
2. Na VPS:
   ```bash
   sudo -i
   apt-get update && apt-get install -y git curl
   git clone https://SEU_TOKEN@github.com/USUARIO/REPOSITORIO.git /root/controle-seta
   cd /root/controle-seta
   bash deploy.sh instalar
   ```
3. Informe o domínio e o e-mail do administrador (e a licença, se o servidor de licenças estiver ativo).
4. Ao final, a tela mostra o login e a senha do administrador. **Guarde e troque no primeiro acesso.**

A instalação confere sozinha, antes de terminar, se o banco tem todas as tabelas, regras de acesso, funções de permissão, gatilho de cadastro de usuários e registro do sistema.

### Atualizar

```bash
sudo bash deploy.sh atualizar
```
Ou pelo botão **Atualizar** no sistema. Variações: `--rapido` (só banco e reinício) e `--dev` (compila no próprio servidor).

### Importar um backup

Pela tela **Backup** do sistema, ou por `bash deploy.sh ferramentas` → "Importar backup". Usuários citados no backup que não existem na instalação nova (por exemplo, quem cadastrou a conta de e-mail) são desvinculados automaticamente, sem perder os dados — evita o erro "responsável inexistente" na coleta.

### Licença

Quando o servidor de licenças estiver no ar, preencha `LICENCA_URL` em `local-docker/deploy/licenca.conf`. A partir daí, instalação e atualização pedem e conferem a chave (salva em `local-docker/.licenca`, fora do Git). O sistema em uso não para se o servidor de licenças cair; só a instalação e a atualização dependem dele.

Contrato esperado do servidor de licenças:
```
POST {LICENCA_URL}/api/public/validar
{ "chave": "...", "dominio": "ouvidoria.exemplo.gov.br", "instalacao_id": "uuid", "versao": "abc1234" }
→ { "valida": true, "expira_em": "2027-12-31", "mensagem": "Licença ativa" }
```

---

## Tecnologias

- React 19 + TanStack Start + Tailwind CSS
- PostgreSQL com regras de acesso por linha em todas as tabelas
- Docker, Caddy (HTTPS automático) e Node.js LTS
- Agente 1Doc com navegador automatizado (Playwright), rodando como fila separada
- IA: Groq e Gemini com chaves próprias

## Estrutura

```text
deploy.sh                      comando único (menu)
local-docker/deploy/           instalar, atualizar, domínio, ferramentas e funções comuns
local-docker/atualizacoes-banco/  mudanças do banco, aplicadas em ordem e repetíveis
local-docker/agente-1doc/      agente que confere o 1Doc
local-docker/agente-atualizacao/  serviço do botão "Atualizar"
src/                           sistema (telas e servidor)
tests/                         testes automáticos (inclui instalação limpa do banco)
```
