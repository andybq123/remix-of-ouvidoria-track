# Comando único de deploy e limpeza dos scripts da VPS

## Objetivo
Um só comando na VPS (`sudo bash deploy.sh`) que pergunta:
1. Instalação nova
2. Atualização
3. Alteração de domínio
4. Ferramentas (criar usuário admin, conferir saúde do sistema, reinstalar serviço de atualização)

Tudo o que já funciona continua funcionando; os comandos antigos continuam existindo como atalhos para o novo, para não quebrar o botão "Atualizar" nem o costume atual.

## O que será feito

**1. Menu único `deploy.sh` (raiz do projeto)**
- Confere root, Git, Docker, espaço em disco (avisa antes de faltar espaço, como ocorreu) e versão do Node.
- Opção escolhida também pode ser passada direto: `deploy.sh instalar | atualizar | dominio | ferramentas`, usado pelo serviço do botão "Atualizar" (sem perguntas).

**2. Organização dos scripts**
- Funções repetidas (mensagens, achar o banco, rodar SQL, backup, trava contra execução dupla) passam para um arquivo comum `local-docker/lib/comum.sh`.
- `deploy-vps.sh`, `atualizar.sh`, `atualizar_front.sh`, `alterar_dominio.sh` passam a usar esse arquivo e viram atalhos para o menu.
- Backup automático do banco antes de atualizar ou trocar domínio (hoje só um dos caminhos faz).

**3. Banco confiável em instalação nova**
- Hoje há três pastas de mudanças de banco que não batem entre si; uma instalação nova pode ficar sem regras (foi o que causou falhas de usuários, permissões e leitura de secretarias).
- Vou conferir cada mudança e garantir que a pasta aplicada na VPS contenha todas, em ordem, e possa rodar várias vezes sem erro.
- Registro de quais mudanças já foram aplicadas, para atualização só rodar as novas.
- Conferência final automática após instalar/atualizar: tabelas, regras de acesso, funções de permissão, perfil admin, fila do agente 1Doc e da atualização. Se faltar algo, o comando avisa com clareza.

**4. Criação do primeiro administrador**
- Instalação nova cria o admin já com perfil `admin` e sem vínculos quebrados (evita erros como o "responsável inexistente" da conta de e-mail).

**5. Teste antes de entregar**
- Rodar a instalação completa num banco limpo aqui no ambiente de testes: aplicar todas as mudanças de banco do zero, duas vezes seguidas, e conferir usuários, permissões, áreas, triagem e registro do sistema.
- Rodar todos os testes já existentes do projeto.

## Fora do escopo
- Mudanças de telas ou regras de negócio.
- Redis / desempenho (fica no roadmap).

## Detalhes técnicos
- `drizzle/migrations` (Lovable Cloud) e `local-docker/supabase/migrations` + `atualizacoes-banco` (VPS) serão reconciliados: diff por objeto (tabelas, policies, funções, grants, triggers) e arquivos faltantes acrescentados em `atualizacoes-banco/` idempotentes.
- Tabela `public.deploy_migracoes(nome, aplicado_em, sha256)` para controle; arquivos já existentes continuam idempotentes.
- `agente-atualizacao/atualizador.sh` passa a chamar `deploy.sh atualizar`; `atualizar.sh` permanece como wrapper (compatível com instalações antigas que o executam).
- Validação: `bash -n` + shellcheck em todos os scripts; Postgres descartável via Docker/psql para aplicar schema + atualizações duas vezes; script `conferir-instalacao.sql` com asserts.
- AGENTS.md atualizado com a nova regra de ponto de entrada único.
