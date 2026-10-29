# Corrigir e embelezar "Evolução de solicitações" (Saúde)

## Por que os números parecem errados
1. **O gráfico respeita o filtro de ano e mês da tela.** Se você escolher um mês, os outros 11 meses aparecem zerados, mesmo tendo solicitações.
2. **As datas mudam de mês por causa do fuso horário.** Uma solicitação aberta no dia 1º era contada no mês anterior. Por exemplo, uma de 01/10 caía em setembro.

## O que muda
- O gráfico sempre mostra os últimos 12 meses da Secretaria de Saúde. Ele continua respeitando a unidade escolhida, mas ignora os filtros de mês, ano, período e busca.
- Cada solicitação é contada no mês da sua data de abertura, sem efeito do fuso horário.
- O visual fica igual ao do Dashboard:
  - área com degradê em verde, combinando com a cor da Saúde;
  - curva suave com animação de entrada;
  - pontos com borda;
  - ponto maior ao passar o mouse;
  - linha tracejada no cursor;
  - eixos sem linhas;
  - número de cada mês em cima do ponto.

## Detalhes técnicos
- Em `src/routes/_authenticated/saude.tsx`, `evolucaoSaude` passa a usar `protocolos`, filtrado por `secretaria_id` e `local_id`. A contagem é feita pela chave `data_abertura.slice(0,7)` comparada a `format(inicio, "yyyy-MM")`.
- Trocar `LineChart`/`Line` por `AreaChart`/`Area` com `linearGradient`, como no Dashboard.
- Conferir no navegador com o backup: os totais por mês devem bater com uma contagem feita direto no banco.
