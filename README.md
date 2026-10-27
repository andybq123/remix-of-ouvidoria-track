# OuviDesk — Plataforma de Gestão de Ouvidoria.

**Gestão centralizada de manifestações, controle de prazos, integração com o 1Doc e inteligência para a administração pública municipal.**

O **OuviDesk** é uma plataforma de gestão desenvolvida para prefeituras e órgãos públicos municipais que precisam centralizar, organizar e acompanhar as informações da Ouvidoria, dos pedidos de acesso à informação (e-SIC/LAI) e dos processos administrativos relacionados às manifestações dos cidadãos.

A plataforma foi projetada para instituições que utilizam o **1Doc** e precisam de uma visão consolidada das demandas, dos encaminhamentos, dos prazos legais, das respostas das secretarias e dos resultados da gestão pública.

Em vez de depender de planilhas isoladas, consultas manuais e controles descentralizados, o OuviDesk reúne informações operacionais em um único ambiente, facilitando o acompanhamento das demandas, a identificação de pendências e a produção de indicadores gerenciais.

> **Importante: o OuviDesk é um software proprietário, disponibilizado mediante licenciamento. A utilização do sistema depende de uma licença válida, conforme as condições comerciais e contratuais aplicáveis. O acesso ao código-fonte deste repositório não concede, por si só, autorização de uso em produção, redistribuição ou exploração comercial.**

---

## Principais benefícios

- **Gestão centralizada:** reúna manifestações, protocolos, prazos, encaminhamentos e respostas em um único ambiente.
- **Integração operacional com o 1Doc:** automatize verificações de informações e acompanhe a situação dos processos vinculados.
- **Controle de prazos legais:** identifique demandas próximas do vencimento ou em atraso.
- **Menos trabalho manual:** automatize a coleta de e-mails, a classificação inicial e as verificações operacionais.
- **Visibilidade gerencial:** acompanhe indicadores, pendências e resultados por secretaria, unidade, assunto e localização.
- **Rastreabilidade:** mantenha registros das alterações realizadas e do histórico dos protocolos.
- **Autonomia tecnológica:** implante a plataforma em infraestrutura própria, sob administração do órgão contratante.
- **Acesso controlado:** gerencie usuários, permissões e áreas de atuação de acordo com as responsabilidades de cada equipe.

## Funcionalidades

### 1. Coleta automatizada de manifestações

- Leitura periódica de caixas de e-mail compatíveis com Gmail ou IMAP.
- Identificação e registro de manifestações e pedidos de acesso à informação.
- Geração de protocolos com informações como número, data, solicitante, assunto e conteúdo.
- Classificação assistida por inteligência artificial, com sugestões de tipo, secretaria e assunto.
- Utilização de provedores de IA compatíveis, como Groq e Gemini, conforme a configuração da instalação.
- Encaminhamento de registros que necessitam de conferência humana para a fila de triagem.
- Pesquisa de mensagens e recuperação de pedidos e-SIC que ainda não foram registrados.

### 2. Triagem e encaminhamento

A triagem permite conferir e complementar as informações necessárias antes do encaminhamento ou da continuidade do tratamento da manifestação.

Entre os dados verificáveis estão:

- Secretaria ou setor responsável.
- Tipo e assunto da manifestação.
- Endereço e localização geográfica, quando aplicáveis.
- Ponto no mapa para demandas que exigem localização.
- Informações necessárias à correta classificação do protocolo.

As ações disponíveis respeitam as permissões atribuídas a cada usuário.

### 3. Controle de prazos e pendências

O OuviDesk oferece recursos para acompanhar os prazos aplicáveis às diferentes modalidades de manifestação.

- Identificação visual de protocolos dentro do prazo, próximos do vencimento ou atrasados.
- Acompanhamento de demandas por secretaria e unidade.
- Listagem de pendências e protocolos em atraso.
- Notificações e indicadores para facilitar a identificação de situações que exigem providências.
- Registro de prorrogações e reaberturas.

Os prazos de referência podem incluir os previstos na Lei Federal nº 13.460/2017 e na Lei Federal nº 12.527/2011 (Lei de Acesso à Informação), observadas a modalidade da demanda, as regras aplicáveis e a regulamentação do ente público.

O sistema auxilia no controle administrativo, mas não substitui a análise jurídica nem a responsabilidade do órgão pelo cumprimento dos prazos legais.

### 4. Gestão completa dos protocolos

Cada protocolo possui uma ficha individual para reunir as informações necessárias ao acompanhamento da demanda.

- Histórico das alterações e movimentações.
- Vinculação ao processo correspondente no 1Doc.
- Registro de endereço, conclusão e prorrogação.
- Possibilidade de reabertura, conforme as permissões.
- Atualização das informações relacionadas ao atendimento.
- Conclusão em lote de protocolos, utilizando os dados de referência disponíveis.

### 5. Agente automatizado de conferência do 1Doc

Um dos recursos centrais do OuviDesk é o agente responsável pela conferência automatizada das informações disponíveis nos processos vinculados ao 1Doc.

Conforme as regras configuradas, o agente pode:

- Acessar os links dos processos relacionados às manifestações.
- Conferir informações como situação, assunto, finalidade e endereço.
- Verificar registros de baixa ou conclusão.
- Atualizar os dados do protocolo com base nas informações identificadas.
- Manter a demanda aberta quando não houver evidência suficiente para concluir o atendimento.
- Executar verificações individuais ou em grupos, incluindo secretarias, locais e painéis de pendências.
- Processar verificações em segundo plano e informar quando forem concluídas.
- Registrar alterações no histórico e permitir reversões conforme as funcionalidades disponíveis.

A plataforma também disponibiliza uma tela para identificar protocolos sem vínculo com o 1Doc e facilitar a regularização desses registros.

**O objetivo é reduzir conferências repetitivas e proporcionar uma visão consolidada das demandas, sem substituir a análise dos servidores responsáveis.**

A integração depende da disponibilidade do 1Doc, dos acessos autorizados, da estrutura dos processos e da compatibilidade com os fluxos utilizados pelo órgão.

### 6. Painéis, mapas e relatórios

O OuviDesk transforma os dados operacionais em informações úteis para a gestão pública.

**Painéis gerenciais**
- Volume de manifestações e pedidos recebidos.
- Indicadores de atendimento e resolução dentro do prazo.
- Demandas em aberto e atrasadas.
- Distribuição dos registros por secretaria, assunto e período.

**Mapas**
- Visualização de demandas georreferenciadas.
- Distribuição territorial das manifestações.
- Identificação de concentrações de ocorrências.
- Visualização de unidades de saúde e outros pontos cadastrados, conforme a configuração da instalação.

**Relatórios**
- Consultas por secretaria, unidade e período.
- Gráficos e indicadores gerenciais.
- Exportação de relatórios em PDF, conforme os recursos disponíveis.

**BI público**

A plataforma pode disponibilizar um painel público de indicadores, acessível pela rota `/bi`, com dados agregados sobre manifestações, períodos, secretarias, tipos, bairros e mapas.

A publicação desse painel deve respeitar as configurações da instalação e os requisitos de privacidade, proteção de dados pessoais e transparência pública.

### 7. Usuários, perfis e permissões

O controle de acesso permite adequar a utilização do sistema à estrutura administrativa do órgão.

- **Administrador:** acesso administrativo completo, incluindo gerenciamento de usuários e operações restritas.
- **Usuário de consulta:** visualização das informações permitidas para as áreas atribuídas.
- **Usuário com permissão de modificação:** execução de operações autorizadas, como triagem, edição, conclusão e prorrogação, dentro do escopo de acesso definido.
- **Restrição de cadastro:** somente endereços de e-mail autorizados podem acessar o sistema.
- **Requisitos de senha:** política de senha forte, conforme as regras implementadas na instalação.
- **Controle de exclusão:** exclusão de protocolos reservada ao perfil administrativo, conforme as permissões do sistema.

As permissões permitem separar as responsabilidades de consulta, operação e administração, reduzindo o acesso desnecessário a informações.

### 8. Auditoria e rastreabilidade

A plataforma disponibiliza recursos de registro para apoiar a rastreabilidade das operações.

Conforme os recursos habilitados, os registros podem incluir:

- Data e hora da operação.
- Usuário responsável.
- Tipo de operação realizada.
- Valores anteriores e posteriores à alteração.
- Registros de criação, modificação e exclusão.

Esses recursos contribuem para a conferência das atividades realizadas e para a análise do histórico de cada protocolo.

### 9. Backup e recuperação

O OuviDesk oferece mecanismos para auxiliar na preservação dos dados e na recuperação da instalação.

- Exportação e importação de backups pela interface do sistema.
- Cópias de segurança do banco de dados antes de atualizações, conforme o fluxo de implantação.
- Ferramentas administrativas para recuperação e continuidade de importações.
- Procedimentos para conferir a integridade dos dados após operações de manutenção.

A política de backup deve considerar também o armazenamento externo das cópias, a proteção dos arquivos, a retenção, o controle de acesso e os testes periódicos de restauração.

### 10. Atualização e manutenção

A plataforma inclui ferramentas para simplificar as operações de manutenção.

Pela área administrativa, o responsável autorizado pode iniciar uma atualização e acompanhar o andamento do procedimento, quando esse recurso estiver habilitado.

O processo de implantação pode contemplar:

- Obtenção da versão mais recente autorizada.
- Backup preventivo do banco de dados.
- Aplicação de atualizações estruturais.
- Reinicialização dos serviços.
- Verificações de funcionamento.
- Procedimentos de recuperação em caso de falhas, conforme a rotina de implantação.

Também estão disponíveis ferramentas administrativas para instalação, atualização, alteração de domínio e manutenção.

---

## Arquitetura e infraestrutura

O OuviDesk foi projetado para implantação em servidor próprio, como uma VPS ou infraestrutura gerenciada pelo órgão contratante.

A arquitetura utiliza componentes conteinerizados para organizar os serviços e facilitar a implantação e a manutenção.

Entre os componentes tecnológicos estão:

- **Frontend e aplicação:** React 19, TanStack Start e Tailwind CSS.
- **Banco de dados:** PostgreSQL.
- **Infraestrutura:** Docker.
- **HTTPS e proxy reverso:** Caddy.
- **Ambiente de execução:** Node.js LTS.
- **Automação do navegador:** Playwright, utilizado pelo agente de conferência do 1Doc.
- **Inteligência artificial:** provedores compatíveis, incluindo Groq e Gemini.

A configuração exata depende da versão e do ambiente de implantação.

### Hospedagem própria e proteção de dados

A implantação em infraestrutura própria permite que o órgão tenha maior controle sobre o ambiente de hospedagem, o banco de dados e os procedimentos de acesso.

Entretanto, **hospedagem própria não significa, por si só, ausência de processamento externo de dados**. A utilização de provedores de inteligência artificial, serviços de e-mail, DNS ou outros serviços externos pode envolver transmissão de informações, conforme a configuração adotada.

Por esse motivo, a instalação deve ser configurada de acordo com as políticas de segurança do órgão, a legislação aplicável e as exigências da Lei Geral de Proteção de Dados Pessoais (LGPD).

---

## Instalação e implantação

O projeto dispõe de um script de implantação para centralizar as principais operações administrativas.

### Requisitos gerais

- Servidor Linux compatível, com suporte aos componentes exigidos pela versão.
- Acesso administrativo ao servidor.
- Domínio configurado para apontar ao endereço IP do servidor.
- Portas necessárias liberadas, incluindo 80 e 443 para o fluxo padrão de HTTPS.
- Recursos de CPU, memória e armazenamento compatíveis com a carga de trabalho.
- Credenciais dos serviços externos que forem utilizados.
- Licença válida do OuviDesk, conforme os requisitos de ativação da instalação.

### Instalação em uma nova VPS

O procedimento geral é:

1. Preparar o servidor e configurar o DNS.
2. Obter o código ou pacote de implantação autorizado.
3. Executar o script de instalação.
4. Informar o domínio e os dados administrativos solicitados.
5. Configurar e validar a licença, quando exigido pelo fluxo de implantação.
6. Configurar os serviços necessários e conferir o funcionamento do sistema.

### Comando completo de instalação (Ubuntu/Debian)

Antes de executar, configure o registro DNS **A** do domínio para o IP público da VPS e libere as portas **80 e 443** no firewall do servidor e do provedor, mantendo o acesso SSH liberado.

Conecte-se à VPS por SSH e execute os comandos abaixo. Execute primeiro `sudo -i`; depois, cole as demais linhas no terminal como root:

```bash
sudo -i
apt-get update && apt-get install -y git curl ca-certificates && \
git clone https://github.com/andybq123/remix-of-ouvidoria-track.git /root/controle-seta && \
cd /root/controle-seta && \
bash deploy.sh instalar
```

O repositório é público: o download não exige login no GitHub. O acesso ao código não dispensa a licença de uso.

O assistente solicita o domínio, o e-mail do administrador e a chave de licença quando a validação estiver habilitada. Ele prepara os serviços locais, o banco e o HTTPS. Ao terminar, siga os dados de acesso exibidos no terminal e abra `https://SEU-DOMINIO`.

**Use esse comando em uma VPS nova**, onde `/root/controle-seta` ainda não existe. Para abrir o menu de manutenção de uma instalação existente:

```bash
sudo bash /root/controle-seta/deploy.sh
```

Se a instalação falhar, consulte o final do registro de execução (revise e oculte credenciais antes de compartilhar):

```bash
tail -n 40 /tmp/ouvidesk-instalacao.log
```

**Atenção:** os comandos, requisitos e opções disponíveis podem variar conforme a versão distribuída. Consulte as instruções e os arquivos de implantação correspondentes à versão licenciada.

Não publique tokens de acesso, senhas, chaves de API, credenciais administrativas ou arquivos de licença em repositórios públicos.

---

## Licenciamento e uso comercial

O **OuviDesk é um software licenciado**. Sua utilização está condicionada à existência de uma licença válida e ao cumprimento dos termos definidos pelo titular dos direitos do software.

O licenciamento pode estabelecer condições específicas relativas a:

- Órgão público ou entidade autorizada a utilizar o sistema.
- Domínio ou ambiente de instalação.
- Identificação da instalação.
- Prazo de validade e renovação.
- Atualizações e manutenção.
- Quantidade de ambientes ou instâncias autorizadas.
- Suporte técnico e demais condições comerciais contratadas.

Os requisitos concretos são aqueles definidos pela licença e pelo instrumento contratual aplicável.

### Validação da licença

Quando o serviço de licenciamento estiver habilitado na versão distribuída, a instalação e a atualização poderão exigir validação da chave de licença junto ao servidor autorizado.

A chave e as configurações de licenciamento devem ser mantidas fora do controle de versão e protegidas contra acesso não autorizado.

A disponibilidade do sistema já instalado durante eventuais indisponibilidades do serviço de licenciamento depende das regras e dos mecanismos implementados na versão contratada.

### Direitos de uso

O acesso ao repositório não implica transferência de propriedade intelectual nem concessão automática de direitos de exploração comercial.

Salvo autorização expressa do titular ou previsão em licença aplicável, não se deve presumir autorização para:

- Utilizar o sistema sem a licença exigida.
- Remover ou contornar os mecanismos de licenciamento.
- Redistribuir o software ou suas versões modificadas.
- Comercializar cópias, instalações ou serviços derivados.
- Reutilizar componentes proprietários fora dos limites autorizados.

Para informações sobre licenciamento, implantação, demonstração, suporte ou contratação, entre em contato com o responsável comercial pelo OuviDesk.

---

## Estrutura do projeto

A organização dos diretórios pode variar conforme a versão. Na estrutura de referência, os principais componentes são:

```text
deploy.sh
local-docker/
├── deploy/
├── atualizacoes-banco/
├── agente-1doc/
└── agente-atualizacao/
src/
tests/
```

| Diretório ou arquivo | Finalidade |
|---|---|
| `deploy.sh` | Ponto de entrada das operações de implantação. |
| `local-docker/deploy/` | Scripts de instalação, atualização e manutenção. |
| `local-docker/atualizacoes-banco/` | Scripts de evolução do banco de dados. |
| `local-docker/agente-1doc/` | Componentes do agente de conferência do 1Doc. |
| `local-docker/agente-atualizacao/` | Serviço relacionado às atualizações pela interface. |
| `src/` | Código-fonte da aplicação. |
| `tests/` | Testes automatizados. |

---

## Segurança e responsabilidade operacional

A implantação deve seguir boas práticas de segurança, incluindo:

- Utilização de HTTPS.
- Controle de acesso administrativo.
- Proteção das credenciais e das chaves de API.
- Restrição das portas e dos serviços expostos.
- Atualização regular dos componentes.
- Backups protegidos e testes de restauração.
- Monitoramento da disponibilidade e dos registros de execução.
- Revisão das permissões dos usuários.
- Avaliação do tratamento de dados pessoais nos serviços integrados.

A segurança efetiva depende da configuração do ambiente, da administração do servidor e dos procedimentos adotados pelo órgão responsável.

O OuviDesk é uma ferramenta de apoio à gestão e não substitui as atribuições legais dos agentes públicos, a análise das autoridades competentes ou as obrigações de transparência, proteção de dados e atendimento ao cidadão.

---

## Público-alvo

O OuviDesk destina-se especialmente a:

- Prefeituras municipais.
- Ouvidorias públicas.
- Setores de transparência e acesso à informação.
- Controladorias e unidades de controle interno.
- Equipes responsáveis pelo acompanhamento de demandas entre secretarias.
- Órgãos públicos que utilizam o 1Doc e necessitam de uma visão consolidada das informações administrativas.

A adoção depende da compatibilidade da instalação com os processos, as permissões e a configuração do 1Doc utilizado pelo órgão.

---

## Perguntas frequentes

**O OuviDesk pertence a alguma prefeitura específica?**

Não. O OuviDesk é uma plataforma independente, concebida para atender diferentes órgãos públicos municipais que tenham necessidades compatíveis com suas funcionalidades.

**É necessário utilizar o 1Doc?**

A integração com o 1Doc é um dos principais recursos da plataforma. Sua utilização efetiva depende da compatibilidade do ambiente e dos acessos autorizados. Outras funcionalidades, como gestão de protocolos, indicadores e relatórios, dependem da configuração da instalação.

**O sistema é gratuito?**

Não. O OuviDesk é um software licenciado. A utilização depende de licença válida e das condições aplicáveis à contratação.

**Posso instalar em minha própria VPS?**

Sim, desde que a infraestrutura atenda aos requisitos técnicos e a instalação esteja autorizada pela licença aplicável.

**Os dados ficam exclusivamente no servidor da prefeitura?**

A aplicação e o banco de dados podem ser hospedados em infraestrutura própria. Contudo, o fluxo real de dados depende das integrações habilitadas, como e-mail e provedores de inteligência artificial.

**O sistema substitui o 1Doc?**

Não. O OuviDesk atua como uma camada complementar de gestão, acompanhamento e consolidação de informações. O 1Doc continua sendo o ambiente de referência dos processos nele mantidos.

**O sistema garante o cumprimento dos prazos legais?**

O OuviDesk fornece ferramentas de controle e acompanhamento, mas o cumprimento dos prazos depende dos procedimentos adotados, das informações registradas e da atuação dos responsáveis.

---

## Contato e licenciamento

Para obter informações sobre demonstração, contratação, implantação, licenciamento e suporte técnico, entre em contato com o responsável pelo projeto OuviDesk.

**OuviDesk — Mais controle sobre as demandas. Mais visibilidade para a gestão pública.**

