# Levar as correções de banco para a VPS pelo atualizador

## O que foi confirmado
- As regras de banco estão no código do GitHub, mas só na pasta usada por este ambiente (0015 áreas de usuários, 0016 leitura de secretarias/locais).
- O `atualizar.sh` da VPS aplica apenas os arquivos de `local-docker/atualizacoes-banco/` (hoje vai até o 018). As duas correções nunca foram copiadas para lá, por isso a atualização não as aplicou.

## O que será feito
1. Criar `local-docker/atualizacoes-banco/019_restricao_secretarias_usuario_leitura.sql`: tabela de áreas por usuário, permissões, regras de acesso e a nova regra de leitura de protocolos, tudo seguro para rodar de novo (não falha se já existir, como na VPS atual onde as regras foram aplicadas na mão).
2. Criar `020_leitura_autenticada_secretarias_locais.sql`: as duas regras "Autenticados leem…", removendo antes se já existirem, e recarregando o cache do banco.
3. Registrar no AGENTS.md: toda mudança de banco precisa também de um arquivo numerado em `local-docker/atualizacoes-banco/`, idempotente, senão não chega à VPS.
4. Conferir as outras mudanças antigas para ver se alguma ficou só de um lado.

## Como confirmar na VPS depois
Rodar `./atualizar.sh` e checar que a etapa de banco passou sem erro; a consulta de regras deve continuar mostrando 6.
