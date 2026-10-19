# Auditoria do cache (TanStack Query) — somente leitura

Nenhuma alteração em telas, banco, permissões, RLS ou regras de negócio. O resultado é um relatório no chat (e uma cópia em Files).

## 1. Conferência das configurações
- Comparar `src/lib/query-policies.ts` com a tabela de políticas: tempos por tipo, retry, gcTime, sem polling global.
- Listar consultas cujas chaves não casam com nenhuma regra (ficam no padrão de 30s) e consultas com tempo próprio que sobrepõe a regra (ex.: Protocolos 5 min, Tarefas infinito, is-admin sem id do usuário).

## 2. Linha de base de desempenho
- Não existem medições anteriores guardadas: o relatório vai dizer isso.
- Medição reproduzível no preview com Playwright, logado:
  - versão atual;
  - versão anterior, simulada com `QueryClient` padrão por meio de uma flag apenas no script de teste, ou pela comparação com o commit anterior se for possível sem alterar o projeto.
- Para cada cenário, registrar: tempo até os dados aparecerem, tempo até a atualização terminar, número e duração das requisições, erros. O cache do navegador fica desligado (via CDP) para não se confundir com o cache do Query.

## 3. Cenários obrigatórios
- Protocolos: primeira abertura; volta antes de 30s; volta depois de 30s (confirmar a atualização em segundo plano, sem a tela piscar).
- Detalhe e histórico de um protocolo.
- Logout, depois login com outra conta: observar o DOM e as requisições quadro a quadro para confirmar que nenhum dado anterior aparece. Requer uma segunda conta; se não houver, o relatório traz o passo a passo manual.
- Consulta pendente durante o logout: atrasar respostas propositalmente (interceptação no Playwright) e verificar se elas repopulam o cache depois do `clear()`.
- Falhas: rede offline, 401 e 403 simulados; contar as tentativas (esperado: 1 nova tentativa em erro de rede, 0 em 401/403).
- Escritas: simular falha numa gravação e confirmar que não é reenviada.

## 4. Requisições duplicadas e consultas lentas
- Agrupar as requisições do Playwright por URL e parâmetros, por página.
- Consultar as queries mais lentas do banco (somente leitura).

## Entrega
Relatório com: testes e resultados, problemas, tempos antes e depois (quando comparáveis), riscos e próxima ação. Nenhuma correção antes de você aprovar.

## Detalhes técnicos
Scripts em `/tmp/browser/audit-query/`. A sessão é criada com `lovable auth-session`. As falhas são simuladas com `page.route`. O código do projeto não muda.
