# Comando único de deploy, limpeza dos scripts e README novo

## Objetivo
Um só comando na VPS (`sudo bash deploy.sh`) que pergunta:
1. Instalação nova
2. Atualização
3. Alteração de domínio
4. Ferramentas (criar admin, conferir saúde do sistema, importar backup, reinstalar serviço de atualização)

Os scripts antigos (`atualizar.sh`, `atualizar_front.sh`, `deploy-vps.sh`, `alterar_dominio.sh` e similares) serão removidos. Para não quebrar VPS já instaladas, só `local-docker/atualizar.sh` fica como atalho de uma linha que chama `deploy.sh atualizar` (o serviço antigo da VPS ainda chama esse caminho até a primeira atualização).

## O que será feito

**1. Menu único `deploy.sh` (raiz do projeto)**
- Confere root, Git, Docker, espaço em disco (avisa antes de faltar, como ocorreu) e versão do Node.
- Aceita a opção direto: `deploy.sh instalar | atualizar | dominio | ferramentas`.

**2. Botão "Atualizar" do sistema**
- O serviço da VPS passa a rodar `deploy.sh atualizar` (sem perguntas), com a mesma barra de progresso e etapas.
- Ao atualizar, o serviço é reinstalado automaticamente apontando para o novo comando.

**3. Organização dos scripts**
- Funções repetidas (mensagens, achar o banco, rodar comandos no banco, backup, trava contra execução dupla) vão para um arquivo comum.
- Backup automático do banco antes de atualizar ou trocar domínio.

**4. Banco confiável em instalação nova**
- Hoje há três pastas de mudanças de banco que não batem entre si; uma instalação nova pode ficar sem regras (causa das falhas de usuários, permissões e leitura de secretarias).
- Reunir todas numa sequência única, que pode rodar várias vezes sem erro, com registro do que já foi aplicado.
- Conferência automática ao final: tabelas, regras de acesso, permissões, perfil admin, filas do agente 1Doc e da atualização.
- Primeiro administrador criado já com perfil `admin`.

**5. Importação de backup sem "responsável inexistente"**
- Ao importar, qualquer referência a um usuário que não existe na VPS nova (responsável da conta de e-mail, criador de protocolos, pedidos do agente, etc.) é limpa automaticamente, preservando os dados.
- Proteção também no banco: se o usuário for apagado, o vínculo vira vazio em vez de travar.

**6. README novo**
- Explica o que o OuviDesk faz (ouvidorias, e-SIC, triagem, prazos, mapas, BI, agente 1Doc, permissões por área, registro do sistema), como instalar, atualizar, trocar domínio, fazer e importar backup.
- Sem menções a Lovable, Lovable Cloud ou Supabase nos textos e documentação: o sistema é descrito como rodando apenas na VPS.

**7. Licença**
- Instalação nova pede a chave de licença e a salva na VPS (arquivo protegido, fora do Git, preservado nas atualizações).
- Antes de instalar e de cada atualização (terminal ou botão), o deploy consulta o servidor de licenças; licença inválida/expirada bloqueia com mensagem clara, sem mexer no sistema.
- Ferramentas: opção para trocar a licença.
- O servidor de licenças será o seu outro projeto. Deixo pronto o "contrato": endereço configurável e uma resposta simples (válida, expira em, mensagem). Até ele existir, a verificação fica desligada por configuração.
- O sistema em uso não para se o servidor de licenças cair; só instalação/atualização dependem dele.

**8. Teste antes de entregar**
- Instalação completa num banco limpo aqui: aplicar tudo do zero duas vezes, criar usuários, conferir permissões, áreas, triagem, registro do sistema e importação de backup com usuário ausente.
- Rodar todos os testes existentes.

## Fora do escopo
- Mudanças de telas ou regras de negócio. Redis/desempenho (segue no roadmap).

## Detalhes técnicos
- Os componentes internos (Postgres, GoTrue, PostgREST) continuam com os nomes técnicos no código e nos contêineres (`supabase_db_*`, `@supabase/supabase-js`, `src/integrations/supabase/*`); renomeá-los quebraria instalações existentes. A remoção de menções vale para README, docs e textos exibidos.
- Reconciliar `drizzle/migrations`, `local-docker/supabase/migrations` e `atualizacoes-banco/` por objeto; faltantes viram arquivos idempotentes em `atualizacoes-banco/`. Tabela `public.deploy_migracoes(nome, sha256, aplicado_em)`.
- FKs para usuários passam a `ON DELETE SET NULL` (via nova migração idempotente); `importar-backup.sh` roda limpeza de órfãos (`created_by`/`user_id` sem `auth.users`) antes de restaurar constraints.
- `agente-atualizacao/instalar.sh` gera unit com `ExecStart` → `deploy.sh atualizar`; `atualizador.sh` chama o mesmo.
- Validação: `bash -n` + shellcheck; Postgres descartável para aplicar tudo duas vezes; `conferir-instalacao.sql` com asserts. AGENTS.md atualizado (ponto de entrada único).
