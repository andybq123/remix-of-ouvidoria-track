# Node corrigido também no agente: a imagem antiga do Playwright embutia Node antigo.
FROM node:24.22.1-bookworm
WORKDIR /agente
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*
CMD ["node", "agente.mjs"]