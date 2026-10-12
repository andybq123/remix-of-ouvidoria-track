# Controle SETA — Sistema de Ouvidoria e Transparência

Sistema completo de gestão de ouvidoria para prefeituras: cadastro e acompanhamento de protocolos, triagem inteligente de e-mails com IA, controle de prazos legais, mapa de unidades da Saúde e relatórios gerenciais.

> ⚠️ **EM DESENVOLVIMENTO** — O código está público apenas para fins de versionamento. **A instalação ainda NÃO está liberada** (veja a seção [Instalador](#-instalador--bloqueado-temporariamente)).

---

## O que o sistema faz

### Protocolos
- **Cadastro de protocolos** de Ouvidoria, LAI/E-SIC e outros tipos, com assunto, conteúdo, secretaria responsável e unidade.
- **Controle de prazos legais centralizado**:
  - Ouvidoria: 30 dias, com prorrogação de mais 30.
  - LAI/E-SIC: 20 dias, com prorrogação de mais 10.
  - Badges visuais de prazo (em dia, próximo do vencimento, atrasado) na listagem e na ficha do protocolo.
- **Ficha completa do protocolo**: histórico, anexos, tramitação e responsável.
- **Conclusão em massa**: cole uma lista em texto com protocolo, data e link do documento (1Doc) e o sistema conclui vários de uma vez; protocolos inexistentes podem ser criados e concluídos direto na triagem.
- **Protocolos antigos**: importação e consulta de acervos anteriores, com localização por número/source.
- **Validações de triagem** para evitar cadastros duplicados ou incompletos.

### Triagem inteligente de e-mails (IA)
- **Coleta automática de e-mails (Gmail/IMAP)** a cada 3 minutos, com histórico de processamento e ressincronização individual das mensagens que falharam.
- **Triagem com IA** (Groq e Gemini, configuráveis individualmente, com IA principal e reserva): extrai protocolo, tipo de pedido, secretaria e assunto do e-mail.
- **Configuração da conta Gmail pela própria tela do sistema** (senha de app, teste de conexão).
- Histórico de e-mails processados com badge indicando qual IA fez a triagem.

### Painel e relatórios
- **Dashboard operacional** com KPIs, atrasados e prazos a vencer.
- **Relatórios com filtro de unidade** e gráficos (incluindo pizza dos relatórios da Saúde).
- **Busca global avançada** por assunto e conteúdo das ouvidorias.
- **Notificações em tempo real** entre usuários conectados.

### Mapa da Saúde
- Mapa com **pontos apenas das unidades da Saúde**, com popup de resumo dos últimos 3 meses.
- Cadastro de **novo ponto vinculado à secretaria**.

### Administração
- **Secretarias, assuntos, usuários e tarefas**.
- **Responsáveis por secretaria** (titular e substituto).
- Perfis de acesso: **administrador** (acesso total) e **usuário** (leitura de protocolos, sem configuração).

---

## Tecnologias

- **Frontend/Backend**: React 19 + TanStack Start (SSR) + Tailwind CSS v4
- **Banco de dados**: PostgreSQL (com Row Level Security em todas as tabelas)
- **IA**: Groq e Gemini (via chave própria, configurável na tela do sistema)
- **E-mail**: coleta IMAP de Gmail via serviço agendado
- **Hospedagem**: Lovable Cloud (nuvem) ou VPS Linux própria (Docker + Caddy)

---

## 🚫 Instalador — bloqueado temporariamente

O instalador para VPS (`local-docker/deploy-vps.sh`) e o instalador local (`local-docker/`) **existem no repositório, mas a instalação pública ainda não está habilitada**, porque o projeto está em desenvolvimento ativo.

**Etapa pendente (não publicada):** a configuração segura do ambiente — o arquivo de chaves do banco de dados e o provisionamento do primeiro administrador. **Sem essa etapa o sistema não sobe**, o que impede instalações não autorizadas enquanto o projeto está aberto.

Quando a versão final for liberada, esta seção será substituída pelo passo a passo completo (requisitos, instalação em VPS com subdomínio e HTTPS automático, criação do admin e configuração do Gmail).

Enquanto isso, **não execute** os scripts da pasta `local-docker/`: além de não funcionarem por falta da etapa pendente, um deploy novo criaria um banco de dados vazio.

---

## Status

| Módulo | Status |
|---|---|
| Protocolos, prazos e SLA | ✅ Em uso |
| Triagem de e-mails com IA (Groq/Gemini) | ✅ Em uso |
| Coleta automática de Gmail (3 min) | ✅ Em uso |
| Dashboard, relatórios e gráficos | ✅ Em uso |
| Mapa da Saúde | ✅ Em uso |
| Responsáveis por secretaria | ✅ Em uso |
| Instalador público | 🔒 Bloqueado até a versão final |
