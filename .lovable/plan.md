# Agente 1Doc: conferir se a ouvidoria foi baixada/arquivada

## O que é possível
Sim, é possível. O sistema já tem uma base parecida (o coletor em Python que lê "Arquivado" no 1Doc). O agente novo vai usar essa base, mas vai rodar **dentro da VPS**, comandado por botões no próprio sistema.

Limite importante: entrar no 1Doc com usuário e senha exige abrir um navegador "invisível". Isso funciona na VPS, mas **não na versão em nuvem**. Na nuvem, os botões vão aparecer com o aviso "disponível só na VPS".

## O que você vai ver
1. **Configurações → Agente 1Doc** (só administradores):
   - link de login do 1Doc, usuário e senha (a senha fica guardada de forma protegida e nunca volta a aparecer na tela);
   - botão **Testar login**;
   - histórico das últimas execuções (quantas conferidas, atualizadas e com erro).
2. **No detalhe de cada ouvidoria:** botão **Atualizar pelo 1Doc**. Ele abre o link do 1Doc daquela ouvidoria e mostra o resultado em poucos segundos.
3. **Em Protocolos/Atrasados:** botão **Atualizar todas pelo 1Doc**. Ele confere em segundo plano todas as ouvidorias em aberto que têm link, com uma barra de progresso.

## O que o agente preenche
- **Situação no 1Doc:** baixada, arquivada ou ainda em andamento.
- **Data da baixa/arquivamento:** o dia em que isso foi feito no 1Doc.
- Se estiver arquivada, a ouvidoria passa para **concluída**, e a **data de conclusão** fica igual à data do arquivamento. Assim, a "Resolução no prazo" e os atrasados ficam corretos.
- O texto do último despacho também é guardado, para consulta.
- Uma ouvidoria já concluída manualmente no sistema não é alterada. O agente só registra o que encontrou no 1Doc.
- Cada atualização entra no **histórico** da ouvidoria como "Atualizado pelo agente 1Doc".

## Pontos a confirmar durante a construção
- Na tela do 1Doc, preciso confirmar onde aparecem "baixado", "arquivado" e a data. Se puder, mande um print de uma ouvidoria arquivada. Sem isso, uso as mesmas regras do coletor atual.
- O agente abre uma ouvidoria por vez, com uma pausa curta entre elas, para não sobrecarregar o 1Doc.

## Detalhes técnicos
- **Banco (migration nova, não destrutiva):**
  - tabela `onedoc_config`, com uma linha só: url_login, usuario, senha cifrada (chave em secret `ONEDOC_KEY`), acesso apenas para admin por RLS;
  - tabela `onedoc_jobs` (id, tipo unitario/lote, status, total, processados, erros, criado_por, timestamps);
  - colunas novas em `protocolos`: `onedoc_situacao text`, `onedoc_arquivado_em timestamptz`, `onedoc_verificado_em timestamptz`.
  - Também espelhar em `local-docker/atualizacoes-banco/009_agente_1doc.sql`.
- **Worker na VPS:** novo serviço `agente-1doc` no `docker-compose.prod.yml` (imagem Playwright com Node). Ele busca na fila `onedoc_jobs` os pedidos pendentes, faz login com a config, abre o `protocolos.url` de cada ouvidoria (passando por `urlValida1doc`) e reaproveita a extração de `coletor-py` (DETALHE_JS e detecção de "Arquivado ✅"/"baixad"). Depois grava o resultado com a service role. Login e sessão (cookies) são reaproveitados entre ouvidorias.
- **App:**
  - server functions admin-only (`exigirAdmin`) para salvar a config, testar o login (cria um job do tipo teste), enfileirar um job unitário ou em lote e ler o status;
  - a UI consulta o job a cada 2 s enquanto ele roda e depois invalida as queries de protocolos (respeitando `query-policies.ts`).
- Em ambiente sem worker (nuvem), o job fica "aguardando" e a UI mostra o aviso depois de 30 s.
- **Testes:** regra de mapeamento "arquivado → concluido + data_conclusao = data de arquivamento"; protocolo já concluído não é sobrescrito; parsing de datas dd/mm/aaaa.
- Atualizar `AGENTS.md`: o agente 1Doc roda só como worker de fila na VPS, nunca dentro do servidor web.
