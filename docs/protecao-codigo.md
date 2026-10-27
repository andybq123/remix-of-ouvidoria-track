# Proteção da distribuição

O código original continua editável. Não ofusque manualmente arquivos de `src/`, scripts de implantação ou agentes.

O comando habitual `bun run build` aplica automaticamente uma ofuscação conservadora aos arquivos JavaScript de carregamento separado da página Licença e dos seus auxiliares no navegador. `bun run dev` permanece sem ofuscação. A seleção e as opções ficam em `tooling/obfuscation.ts`.

O processo renomeia identificadores internos na distribuição, mantendo exportações, propriedades e textos de configuração. Isso preserva a troca de endereço e configuração feita pelo deploy da VPS. Os mapas de código-fonte do navegador ficam desabilitados. O servidor, os agentes e as bibliotecas não recebem essa transformação.

Para editar, altere os arquivos originais e gere a distribuição novamente; nunca edite o JavaScript gerado. A mesma proteção vale para compilações no GitHub e para a compilação local de instalação, pois ambas usam a configuração do Vite.

## Limites

Ofuscação dificulta a leitura do JavaScript distribuído, mas não impede engenharia reversa nem protege segredos. Um repositório público expõe os arquivos originais, e a implantação atual mantém uma cópia desses arquivos na VPS. Para restringir acesso aos fontes, é necessário controlar o acesso ao repositório e à distribuição — isso não foi alterado nesta implementação.

O ícone de conexão da página Licença usa a última confirmação automática: até dez minutos indica online; sem confirmação recente, indica offline. É um sinal da última comunicação registrada, não uma consulta direta ao servidor ao abrir a página. Esse indicador não altera o bloqueio da licença.