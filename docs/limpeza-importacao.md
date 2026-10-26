# Preparar o sistema para importar outro backup

## Escopo confirmado

| Apagar/zerar | Preservar integralmente |
|---|---|
| Todos os protocolos, inclusive e-SIC e triagem | Usuários de login, senhas, perfis e permissões |
| Histórico de alterações e conclusões antigas | Secretarias, locais/unidades e responsáveis |
| Mensagens/logs de e-mail e registros de coletas | Assuntos, vínculos e regras do catálogo |
| Configurações, modelos e chaves IA salvos em `ai_config` | Contas, credenciais e cursores de e-mail |
| Dados das planilhas antigas embutidas nos relatórios | Código, banco/schema, `.env`, configuração e instalação VPS |

A versão deixa as duas listas de históricos embutidos vazias: esses registros não voltarão aos relatórios nem serão reimportados pelo botão de antigos. Os dados anteriores continuam recuperáveis pelo histórico Git. Os protocolos existentes no banco **só serão apagados quando você executar e confirmar o comando manual**. Não há limpeza em migrations nem no atualizador comum.

As chaves IA podem ter uma cópia em arquivo fora do banco. Conforme o escopo, o arquivo original é preservado, mas a restauração automática desse arquivo para o banco será bloqueada por um marcador local. A configuração IA operacional ficará sem as chaves e os modelos que estavam no banco; uma chave configurada novamente pelo administrador passa a funcionar normalmente. A restauração de `ai_config` pelo backup fica bloqueada durante a pausa. O marcador não revoga chaves no provedor externo.

## 1. Atualizar a versão

Mescle o PR e espere **Compilar versão da VPS** concluir com sucesso. Na raiz do clone da VPS:

```bash
cd ~/controle-seta
sudo bash deploy.sh atualizar
```

A atualização inclui os comandos de manutenção e a correção de compatibilidade e-SIC com o modo de importação do backup. A migration `006_esic_importacao_backup.sql` não apaga dados: garante que uma restauração autorizada preserve status, triagem e prorrogação antigas em vez de tratá-las como cadastro novo.

## 2. Simular sem apagar

```bash
sudo bash deploy.sh ferramentas   # opção 4, responda S para simular
```

A simulação verifica o artefato instalado, o clone do contêiner, a existência de exatamente um banco local em Docker e a correspondência dos IDs do banco com a API realmente usada pela aplicação. Exibe as contagens das seis tabelas a limpar. Não para serviços nem cria backup/marcadores e não apaga nada.

O script recusa ambientes com múltiplos bancos locais, app apontando a banco externo ou artefato diferente do checkout. Nessas situações, revise a topologia antes de adaptar o procedimento; não remova as verificações para forçar a limpeza.

## 3. Executar a limpeza

Reserve uma pequena janela de manutenção: a aplicação ficará parada durante o backup e a limpeza.

```bash
sudo bash deploy.sh ferramentas   # opção 4, responda N para executar
```

O comando apresenta o escopo e exige digitar exatamente **LIMPAR PARA IMPORTAR**. Em seguida, pausa a ingestão, para app/coletor, salva o ambiente e faz um dump completo do banco, validando o formato e a soma de verificação antes de limpar.

A limpeza roda numa transação com `TRUNCATE ... RESTRICT`, sem `CASCADE`. Compara os cadastros preservados antes/depois e aborta a transação se algum for alterado. Se houver tabela adicional dependente não prevista, a operação aborta sem limpar parcialmente. Por fim confirma que todas as seis tabelas aprovadas estão vazias e inicia a aplicação, mantendo a ingestão pausada.

O backup fica em `local-docker/backups/clean-import-<data>-<identificador>/`, com permissões restritas. Ele contém dados pessoais, hashes de senhas e configurações sensíveis: não publique nem envie ao GitHub. Copie para um local seguro fora da VPS. Verifique a integridade no diretório exibido pelo script:

```bash
sha256sum -c database.sha256
```

Este backup é um ponto de restauração completo da instalação atual, diferente do arquivo ZIP do painel. Para restaurá-lo em caso de necessidade, planeje a restauração PostgreSQL com a aplicação parada; não use o importador de ZIP para o arquivo `.dump`.

Se falhar após parar a aplicação, ela fica parada por segurança; o script mostra o caminho do backup e o comando para subir somente o app após revisão. A ingestão permanece pausada. Não execute a limpeza novamente após já importar seu backup: isso apagaria os dados recém-importados.

## 4. Importar o backup do outro sistema

Abra **Configurações → Backup**, escolha seu ZIP e confira os grupos antes de importar. Para preservar os cadastros mantidos, desmarque Usuários, Secretarias/locais, Assuntos e Contas de e-mail, a menos que queira conscientemente atualizar esses cadastros também.

Durante a pausa, apenas Protocolos é marcado por padrão. Logs de e-mail/coletas/IA ficam bloqueados também no servidor, mesmo que estejam no ZIP. Contas de e-mail não são importadas pelo grupo bloqueado E-mails.

Os IDs das secretarias/locais/usuários usados pelos protocolos do backup precisam corresponder aos preservados. Se vierem de cadastros diferentes, compare e ajuste os vínculos antes de importar; a limpeza não resolve automaticamente IDs de sistemas independentes. O painel aceita os formatos já existentes (ZIP do painel e CSV reconhecido); não se presume compatibilidade com formatos de terceiros não examinados.

Durante a importação, o painel mostra aviso de ingestão pausada. Após importar, atualiza os caches de protocolos/relatórios. Confira os totais, o encaminhamento por secretaria e os pedidos e-SIC antes de seguir. Novos cadastros feitos manualmente ainda podem aparecer: pausa de ingestão não é bloqueio de escrita manual.

## 5. Retomar a ingestão quando estiver pronto

Configure novamente a IA se precisar de extração/classificação de e-mails de Ouvidoria e de relatórios por IA. Depois de conferir a importação:

```bash
sudo bash deploy.sh ferramentas   # opção 5
```

O comando explica que a coleta usará os cursores existentes e pede **RETOMAR INGESTAO** antes de reativar. Aguarda a aplicação responder e verifica a presença de cursores das contas ativas. Se houver conta sem cursor, mantém a pausa até uma confirmação adicional explícita do risco de reler mensagens antigas (**RETOMAR COM RISCO DE RELEITURA**); falha de prontidão não permite retomar. Contas, credenciais e cursores não são apagados nem zerados. Mensagens novas na caixa poderão ser processadas; mensagens antigas podem ser lidas novamente se a conta não tiver cursor ou o servidor não disponibilizar seu histórico. Não reative antes de revisar o backup e a deduplicação.

O controle de pausa continua valendo após futuras atualizações até executar esse comando. Webhooks recebem HTTP 503 durante a pausa; reenvio depende do provedor do webhook e não é garantido pelo sistema. Mensagens permanecem nas caixas Gmail/IMAP: este procedimento não apaga e-mails no provedor.

## Testes sem dados reais

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
bash tests/limpeza/run.sh
NITRO_PRESET=node-server bun run build
```

O teste PostgreSQL cria cluster temporário privado sem TCP. Verifica preservação de contas/senhas/cadastros, limpeza restrita, rollback com dependência extra, repetição e importação e-SIC. Não se conecta à VPS.
