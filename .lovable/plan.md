# Atualização mais rápida da VPS

## Por que demora hoje
- Cada alteração enviada ao GitHub dispara uma compilação nova do zero (instala todas as dependências, sem reaproveitar nada) — leva de 3 a 6 minutos.
- Quando várias alterações chegam em sequência, a compilação anterior é cancelada e recomeça, aumentando a espera.
- A VPS baixa o pacote inteiro a cada 10 segundos só para conferir se já é a versão nova.
- Se a compilação falhar no GitHub, a VPS espera os 6 minutos inteiros sem avisar.

## O que vamos mudar
1. **Compilação no GitHub mais rápida**
   - Guardar as dependências e o cache da compilação entre uma execução e outra (reaproveita o que não mudou).
   - Usar a lista de dependências já travada, sem apagá-la a cada vez.
   - Pular a compilação quando só mudaram arquivos que não afetam o sistema (scripts da VPS, documentação, banco).
2. **VPS mais esperta na espera**
   - Consultar só a "etiqueta" da versão pronta (rápido, poucos bytes) e baixar o pacote uma única vez quando ela bater.
   - Mostrar o estado real da compilação no GitHub: "na fila", "compilando", "falhou". Se falhar, avisar na hora e oferecer compilar na VPS.
   - Quando só mudaram scripts/banco (sem compilação nova), reaproveitar a versão já instalada e reiniciar direto — atualização em segundos.
3. **Novo atalho opcional**: `./atualizar.sh --rapido` que aplica só banco + reinício, sem esperar compilação (para quando a mudança foi só no banco).

## Resultado esperado
- Alterações comuns: de ~5 min para ~1–2 min.
- Alterações só de banco/scripts: menos de 30 segundos.
- Nunca mais fica "aguardando" em silêncio quando a compilação falhou.

## Detalhes técnicos
- `.github/workflows/build-vps.yml`: `actions/cache` para `~/.bun/install/cache` e `node_modules/.vite`; `bun install --frozen-lockfile`; `paths-ignore` para `local-docker/**`, `*.md`, `drizzle/**`, `supabase/**`; gravar SHA no corpo/título da release.
- `local-docker/atualizar.sh`: poll via `https://api.github.com/repos/<repo>/releases/tags/vps-latest` (lê `target_commitish`) e `actions/runs?head_sha=<SHA>` para status; se o último commit que muda código já está em `.output/VERSION`, pula o download; flag `--rapido`.
- Repositório privado: usa o token já embutido na URL do `origin` para as consultas à API.
