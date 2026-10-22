# Pedidos e-SIC

## Recebimento

O fluxo existente de e-mails (Gmail, IMAP e endpoint de e-mail de entrada) passa a reconhecer notificações como:

```text
Pedido de e-SIC 026/2026 recebido
Novo Protocolo recebido.
Nº: 026/2026
Assunto: Pedido
De: Sandi E Oliveira Advogados
Para: SETA - OUV - Ouvidoria Geral
```

Também aceita os campos na mesma linha, como ocorre em HTML convertido em texto. Por decisão do projeto, notificações de pedidos LAI/acesso à informação reconhecidas por esse fluxo são identificadas como **e-SIC**. Notificações explicitamente numeradas como Ouvidoria não são convertidas apenas por mencionar e-SIC no relato.

A extração desse formato é determinística e não depende de IA. Os demais e-mails mantêm a extração existente. O coletor Python 1Doc não foi modificado nem é necessário para esta funcionalidade; notificações por e-mail originadas no 1Doc continuam aceitas.

## Identificadores, duplicatas e histórico

- `numero_esic` guarda o número oficial do pedido no padrão do sistema, por exemplo `0.026/2026`.
- `numero` usa o mesmo valor de `numero_esic`, sem gerar outro identificador no recebimento automático, cadastro ou edição. As restrições globais de unicidade continuam valendo: um conflito com outro protocolo é registrado para revisão, sem inventar número nem vincular o e-SIC à Ouvidoria.
- A busca de e-SIC normaliza zeros à esquerda, espaços e separadores de milhar: `026/2026`, `26/2026` e `0.026/2026` identificam o mesmo pedido.
- Mensagens já processadas não criam outra cópia. Novas notificações do mesmo pedido são vinculadas ao registro existente, com histórico.
- Se uma coleta simultânea tentar inserir o mesmo número oficial, o banco rejeita a segunda inserção. A tentativa fica recuperável no log e será vinculada ao pedido já existente ao reprocessar.
- Se o número oficial não for identificado, o e-mail fica em erro para revisão; o sistema não inventa o número do pedido.
- E-SIC não é concluído automaticamente por palavras como “concluir” ou “atendimento” no relato. A conclusão por e-mail exige indicação explícita no assunto (como “concluído” ou “encerrado”).

## Triagem e prazo

Todo novo e-SIC entra obrigatoriamente em **Triagem**, inclusive se a conta de e-mail estiver vinculada a uma secretaria. A ingestão não encaminha automaticamente esse pedido. Quem faz a triagem define secretaria/local e o relato, utilizando o fluxo e as reservas já existentes.

O prazo começa na data de abertura/recebimento, não após a triagem:

- Inicial: **20 dias**.
- Uma prorrogação: **10 dias**, totalizando **30 dias** desde a abertura.
- A prorrogação exige justificativa expressa (mínimo de 20 caracteres na interface e no banco), grava a data e registra a justificativa no histórico.
- O botão não libera uma segunda prorrogação; a regra no banco impede reiniciar a flag de uma prorrogação registrada.
- Ao converter um protocolo já prorrogado para e-SIC, a justificativa também é obrigatória e o pedido retorna à triagem.

O cálculo mantém o motor de dias corridos do projeto. Este PR não acrescenta calendário de feriados nem redefine regras jurídicas locais de contagem. E-SIC legado já prorrogado não tem justificativa retroativamente inventada.

## Interface e estatísticas

**Pedido e-SIC** tem badge/cor teal e aparece separadamente em:

- Dashboard: categoria e-SIC, inclusive enquanto aguarda triagem.
- Triagem, protocolos e detalhes: número oficial em campo próprio, além do número interno.
- Relatórios gerais, por secretaria e por IA: contagem própria, sem dupla contagem como Pedido de informação genérico.
- Exportações de listagens de atrasados e relatórios: coluna de número e-SIC.
- Saúde e mapas: identificação e-SIC quando encaminhado a essas áreas.

A categoria persistida continua sendo `pedido_informacao`, compatível com o enum existente; a categoria estatística `esic` é derivada de `tipo = esic`. O formulário público de Ouvidoria mantém apenas suas categorias válidas. A consulta pública por número interno + código de consulta mantém seu contrato e identifica o tipo como Pedido e-SIC; este PR não expõe pedidos importados sem código de consulta nem cria um portal público e-SIC.

Anexos binários de e-mail não ganham um novo fluxo de download/armazenamento neste PR. O corpo e o histórico continuam disponíveis no módulo de e-mails.

## Atualizar a VPS

1. Revisar e mesclar o PR em `main`.
2. Esperar a ação **Compilar versão da VPS** concluir com sucesso.
3. Na raiz do clone, executar:

   ```bash
   cd ~/controle-seta
   ./atualizar_front.sh
   ```

O procedimento existente cria backup e aplica as atualizações de banco antes de reiniciar a aplicação. `018_esic_numero_interno.sql` também corrige os números internos dos e-SIC existentes, mantendo os IDs, o histórico e a triagem. Conflitos de numeração geram um aviso para revisão individual, sem apagar ou mesclar pedidos. As migrations são idempotentes.

A migration preenche o número oficial de registros **já classificados como e-SIC** pela versão antiga. Não reclassifica automaticamente textos históricos nem remove eventuais duplicatas legadas. Se houver várias cópias legadas para o mesmo número normalizado, a ingestão registra um conflito em vez de escolher uma silenciosamente: um administrador deve revisar os registros e corrigir o número/tipo indevido antes de reprocessar. Não exclua o histórico de e-mails para tentar resolver esse conflito.

## Validar em ambiente de desenvolvimento

```bash
bun install --frozen-lockfile
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
NITRO_PRESET=node-server bun run build
```

Para o teste real de migration e concorrência, instale PostgreSQL 16 e rode **como usuário não-root**:

```bash
bash tests/esic/run.sh
```

Esse script cria um cluster privado em diretório temporário, sem porta TCP, com dados fictícios. Exercita os gatilhos reais de triagem/auditoria, a migration aplicada novamente e duas transações simultâneas, e apaga o cluster ao terminar. Não usa URLs, senhas ou bancos existentes da aplicação. A ação **Validar aplicação e fluxo e-SIC** repete os testes e o build nos PRs; ela não faz deploy.
