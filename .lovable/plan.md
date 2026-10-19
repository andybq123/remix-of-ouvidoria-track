# Agente 1Doc: IA só quando as regras falharem

## Como vai funcionar
1. O agente lê a página do 1Doc com as regras atuais: "deu baixa ... em", "arquivou." e "Endereço:". Isso não tem custo.
2. A IA entra só quando essa leitura falha, ou seja, quando:
   - a página parece encerrada (fala em baixa, arquivamento ou finalização), mas as regras não acharam a data; ou
   - a ouvidoria não tem endereço, a página tem algo parecido com endereço e as regras não conseguiram lê-lo.
3. A IA usada é a que já está configurada em **Configurações → IA**: Groq primeiro e Gemini se o Groq falhar, seguindo a ordem salva.
4. A IA devolve só três dados: data da baixa, data do arquivamento e endereço. O sistema confere o formato antes de gravar. Uma data inválida ou um endereço vazio são descartados.
5. Sem chave de IA configurada, o agente continua funcionando só com as regras.

## O que você vai ver
- No histórico da execução, cada ouvidoria mostra se foi lida "por regra" ou "com IA".
- Em **Agente 1Doc → Últimas execuções**: quantas precisaram de IA.
- As regras de proteção continuam iguais:
  - não altera ouvidoria já concluída;
  - não troca endereço que já existe;
  - o ponto no mapa só é marcado dentro de Brusque.

## Detalhes técnicos
- `local-docker/agente-1doc/parse.mjs`: nova função `precisaIA(texto, analise, protocolo)` com os dois gatilhos acima, e `validarRespostaIA(json)`, que valida as datas ISO (entre 2000 e hoje+1 dia) e o endereço (5 a 300 caracteres).
- `agente.mjs`: lê `ai_config` (grok_api_key, gemini_api_key, modelos, priority) pela service role. Chama a API OpenAI-compatível do Groq ou `generateContent` do Gemini, pedindo resposta em JSON. Envia só os 12 mil caracteres finais da página, com timeout de 30 s. O resultado da IA preenche apenas os campos que as regras deixaram vazios.
- `onedoc_jobs.resultados[]` ganha o campo `fonte: "regra" | "ia"`. A UI conta quantos vieram de IA. Não há mudança de banco, porque o campo fica dentro do jsonb existente.
- Testes: os gatilhos de `precisaIA` (encerrada sem data → sim; data lida → não; endereço já existente → não) e `validarRespostaIA` descartando data inválida.
