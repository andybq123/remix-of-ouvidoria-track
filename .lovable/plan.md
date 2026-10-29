# Dashboard com totais calculados no servidor

## Vai ficar mais rápido?
Sim, mas o ganho é moderado. Hoje, com o seu backup (4.500 ouvidorias), a tela leva cerca de 6 s. Desse tempo, cerca de 1,6 s é para baixar as ouvidorias. O resto é o navegador montando a tela e fazendo as contas, além da lentidão do modo de teste. Se o servidor fizer as contas e mandar só os totais (alguns KB):
- a tela deve abrir em cerca de 2 a 3 s no teste, e mais rápido na VPS;
- o ganho cresce conforme o número de ouvidorias aumenta.

O risco está nas regras de prazo (dias úteis, prorrogação, "vence hoje" x "atrasada"). Por isso, o trabalho só vale com uma conferência automática dos números.

## Etapas
1. **Medir antes:** registrar o tempo atual e todos os números do Dashboard (KPIs, gráficos, mapa) com o seu backup, para cada mês.
2. **Contas no servidor:** criar uma consulta que devolve os totais prontos para cada KPI e gráfico. Os filtros de mês, secretaria e responsável continuam funcionando. As permissões por área continuam valendo.
3. **Prazo idêntico:** escrever a regra de prazo no banco seguindo exatamente a regra atual. O cálculo atual é uma regra única e testada, que deve ficar como referência.
4. **Conferência lado a lado:** um teste que compara os números do servidor com os números do cálculo atual, para todos os meses do backup. Se houver qualquer diferença, essa parte continua sendo calculada como hoje.
5. **Listas só ao clicar:** quando você clica em um quadro (Atrasadas, Vencendo hoje…), a lista é buscada na hora, com os filtros que já existem.
6. **Segurança:** se a consulta nova falhar, a tela volta automaticamente ao método atual.
7. **Medir depois** e mostrar a comparação.

## Detalhes técnicos
- Uma RPC `dashboard_resumo(p_mes, p_secretaria, p_responsavel)` com SECURITY INVOKER, para manter a RLS e `area_permitida`.
- Uma função SQL de prazo espelhando `src/lib/prazo.ts`, com teste de paridade em Vitest e SQL.
- Os drills usam uma RPC paginada.
- A migração também é copiada para `local-docker/atualizacoes-banco/` e entra em `conferir-instalacao.sql`. AGENTS.md é atualizado.
- O mapa continua recebendo as coordenadas compactas que já existem hoje.
