# Controle SETA — rodando localmente

Requisitos: **Docker Desktop** e **Node.js 20+**.

## 1. Subir o banco local (Postgres + login + tempo real)
```bash
cd local-docker
npx supabase start          # baixa e sobe os containers e cria todas as tabelas
npx supabase status         # mostra a "anon key" e a "service_role key"
```
Painel do banco: http://localhost:54323

## 2. Configurar o app
```bash
cp .env.local.example .env.local   # cole as chaves do passo anterior
```

## 3. Criar o admin local
```bash
SUPABASE_SERVICE_ROLE_KEY=<service_role> node create-admin.mjs admin@seta.local MinhaSenha123
```

## 4. Subir o app
```bash
docker compose up
```
Acesse http://localhost:8080

Sem Docker para o app: na raiz do projeto, copie `local-docker/.env.local` para `.env` (troque `host.docker.internal` por `localhost`) e rode `npm install && npm run dev`.

## Limitações
- O banco local começa **vazio** (estrutura completa, sem dados). Cadastre secretarias/assuntos ou importe um backup.
- **IA da Lovable** não funciona localmente: use Gemini ou Groq na tela de IA.
- **Login Google** usa o serviço da Lovable; localmente use e-mail e senha.
- **Gmail / coleta automática** precisam de internet e das suas credenciais; o agendamento (cron) não roda sozinho — chame os endpoints `/api/public/email-sync` com `Authorization: Bearer $CRON_SECRET`.

## Parar
```bash
docker compose down && npx supabase stop
```

## Atualizar uma instalação existente na VPS

Depois que a alteração for integrada em `main` e a ação **Compilar versão da VPS** terminar com sucesso, execute na raiz do clone na VPS:

```bash
./atualizar_front.sh
```

Na primeira execução, se o script ainda não existir no clone antigo, execute a partir da raiz do projeto:

```bash
curl -fsSL https://raw.githubusercontent.com/andybq123/remix-of-ouvidoria-track/main/atualizar_front.sh | bash
```

O comando exige que a branch local seja `main`, interrompe se houver outras alterações locais, salva e restaura o `.env` rastreado, gera um backup verificado do banco em `local-docker/backups/` e chama o atualizador de produção existente. O atualizador valida o hash do build publicado e espera a aplicação responder em `127.0.0.1:8080`. Mantenha os backups protegidos e copie-os para fora da VPS. A aplicação é reiniciada durante a atualização.
