#!/usr/bin/env bash
# Atualiza uma instalação VPS já existente usando o artefato publicado no GitHub.
# Execute na raiz do clone: ./atualizar_front.sh
set -Eeuo pipefail

fail() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
}

# Permite execução normal pelo caminho do arquivo ou via `curl ... | bash`
# a partir da raiz do clone.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  SCRIPT_PATH="${BASH_SOURCE[0]:-}"
  [[ -n "$SCRIPT_PATH" && -f "$SCRIPT_PATH" ]] || fail "Execute este comando de dentro do clone GitHub do projeto."
  SCRIPT_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)"
  ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
fi
[[ -n "$ROOT" ]] || fail "Não encontrei o clone GitHub do projeto."
cd "$ROOT"

command -v git >/dev/null || fail "Git não está instalado."
command -v docker >/dev/null || fail "Docker não está instalado."
command -v flock >/dev/null || fail "flock não está disponível neste sistema."
[[ -f local-docker/atualizar.sh ]] || fail "Não encontrei local-docker/atualizar.sh."
[[ -f local-docker/.env.local ]] || fail "Não encontrei local-docker/.env.local; confira a configuração local da VPS."
[[ -f .env ]] || fail "Não encontrei .env na raiz do projeto."

BRANCH="$(git branch --show-current)"
[[ "$BRANCH" == "main" ]] || fail "A branch atual é '$BRANCH', não 'main'. Mude para main antes de atualizar."

# Não permitir que o reset --hard do atualizador descarte alterações locais.
# .env é exceção porque pode conter configuração específica da VPS e será salvo/restaurado.
PENDING="$(git status --porcelain --untracked-files=normal -- . ':(exclude).env' ':(exclude)local-docker/backups')"
if [[ -n "$PENDING" ]]; then
  printf 'ERRO: há alterações locais além de .env; nada foi atualizado:\n%s\n' "$PENDING" >&2
  fail "Salve ou remova essas alterações antes de continuar."
fi

# Recusar commits locais que o atualizador apagaria ao alinhar com origin/main.
printf '==> Conferindo a versão publicada em origin/main...\n'
git fetch --quiet origin main
LOCAL_COMMIT="$(git rev-parse HEAD)"
if ! git merge-base --is-ancestor "$LOCAL_COMMIT" origin/main; then
  fail "A branch main contém commits locais que não estão em origin/main. Não vou sobrescrevê-los."
fi
TARGET_COMMIT="$(git rev-parse origin/main)"
printf '    instalado: %s\n    destino:   %s\n' "${LOCAL_COMMIT:0:12}" "${TARGET_COMMIT:0:12}"

# Evita duas execuções concorrentes do atualizador na mesma máquina.
exec 9>/tmp/controle-seta-atualizar-front.lock
flock -n 9 || fail "Já existe outra atualização em andamento."

docker info >/dev/null 2>&1 || fail "O daemon Docker não está disponível."
DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -n 1 || true)"
[[ -n "$DB_CONTAINER" ]] || fail "Não encontrei o contêiner do banco Supabase em execução; nada foi atualizado."

DB_USER="postgres"
if ! docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -Atc 'select 1' >/dev/null 2>&1; then
  DB_USER="supabase_admin"
  docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres -Atc 'select 1' >/dev/null 2>&1 \
    || fail "Não consegui validar o acesso ao banco para fazer o backup."
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$ROOT/local-docker/backups/front-update-$STAMP"
mkdir -p "$BACKUP_DIR"
chmod 700 "$ROOT/local-docker/backups" "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/database.dump"
BACKUP_TMP="$BACKUP_DIR/database.dump.partial"

printf '==> Criando backup protegido do banco antes da atualização...\n'
if ! docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d postgres -Fc > "$BACKUP_TMP"; then
  rm -f "$BACKUP_TMP"
  fail "pg_dump falhou. Nenhuma atualização foi iniciada."
fi
if [[ ! -s "$BACKUP_TMP" ]] || ! docker exec -i "$DB_CONTAINER" pg_restore --list < "$BACKUP_TMP" >/dev/null 2>&1; then
  rm -f "$BACKUP_TMP"
  fail "O backup não passou na verificação. Nenhuma atualização foi iniciada."
fi
mv "$BACKUP_TMP" "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
printf '%s\n' "$LOCAL_COMMIT" > "$BACKUP_DIR/versao-anterior.txt"
printf '%s\n' "$TARGET_COMMIT" > "$BACKUP_DIR/versao-destino.txt"
(cd "$BACKUP_DIR" && sha256sum database.dump > database.sha256)
chmod 600 "$BACKUP_DIR"/*

# O atualizador existente alinha o clone à main com reset --hard. Preserve .env,
# que é rastreado no repositório, para não substituir configurações locais da VPS.
ENV_MODE="$(stat -c '%a' .env)"
cp -p .env "$BACKUP_DIR/root.env"
chmod 600 "$BACKUP_DIR/root.env"
RESTORE_ENV=1
restore_env() {
  local status=$?
  if [[ "$RESTORE_ENV" == "1" && -f "$BACKUP_DIR/root.env" ]]; then
    if cp -p "$BACKUP_DIR/root.env" "$ROOT/.env" && chmod "$ENV_MODE" "$ROOT/.env"; then
      :
    else
      printf 'ATENÇÃO: restaure manualmente o .env a partir de %s/root.env\n' "$BACKUP_DIR" >&2
      [[ "$status" -ne 0 ]] || status=1
    fi
  fi
  return "$status"
}
trap restore_env EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf '==> Atualizando a aplicação com o procedimento de produção do projeto...\n'
printf '    O atualizador aguardará o artefato do GitHub correspondente a origin/main.\n'
if bash "$ROOT/local-docker/atualizar.sh"; then
  printf '\nAtualização concluída.\n'
  printf 'Backup do banco e do .env: %s\n' "$BACKUP_DIR"
  printf 'Verifique o backup com: (cd "%s" && sha256sum -c database.sha256)\n' "$BACKUP_DIR"
  printf 'Mantenha esse diretório protegido e copie-o para fora da VPS.\n'
else
  STATUS=$?
  printf '\nA atualização não confirmou sucesso (código %s).\n' "$STATUS" >&2
  printf 'O .env será restaurado ao sair; o backup protegido está em %s\n' "$BACKUP_DIR" >&2
  printf 'Confira os logs do app antes de tentar novamente.\n' >&2
  exit "$STATUS"
fi
