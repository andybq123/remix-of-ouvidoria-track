#!/usr/bin/env bash
# ============================================================
#  OuviDesk — Importa o backup do sistema original (nuvem)
#  para o banco local da VPS, mantendo os mesmos IDs e ligações.
#
#  Uso:  ./importar-backup.sh /root/backup_sistema_seta.zip
#
#  - Faz uma cópia de segurança do banco atual antes de tudo.
#  - Substitui protocolos, secretarias, locais, assuntos, histórico etc.
#  - Recria os usuários do sistema original com uma SENHA TEMPORÁRIA.
#  - Mantém as chaves de IA já cadastradas na VPS.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

ZIP="${1:-}"
if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
  echo "Uso: ./importar-backup.sh /caminho/do/backup.zip"; exit 1
fi
command -v unzip >/dev/null || apt-get install -y unzip >/dev/null

DB="$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -1 || true)"
[ -z "$DB" ] && { echo "ERRO: banco local não está rodando."; exit 1; }

DBUSER=supabase_admin
docker exec "$DB" psql -U "$DBUSER" -d postgres -Atc 'select 1' >/dev/null 2>&1 || DBUSER=postgres
PSQL=(docker exec -i "$DB" psql -v ON_ERROR_STOP=1 -q -U "$DBUSER" -d postgres)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q "$ZIP" -d "$TMP"
DADOS="$(dirname "$(find "$TMP" -name protocolos.csv | head -1)")"
[ -f "$DADOS/protocolos.csv" ] || { echo "ERRO: backup sem a pasta 'dados'."; exit 1; }

echo "==> 1/4 Cópia de segurança do banco atual..."
mkdir -p backups
ARQ="backups/antes-importacao-$(date +%Y%m%d-%H%M%S).sql.gz"
docker exec "$DB" pg_dump -U "$DBUSER" -d postgres --data-only --schema=public --schema=auth | gzip > "$ARQ"
echo "    salvo em local-docker/$ARQ"

TABELAS="secretarias locais assuntos allowed_emails profiles user_roles secretaria_responsaveis protocolos protocolo_historico protocolos_antigos_conclusoes email_inbox_accounts email_inbox_log coletas ai_config"

echo "==> 2/4 Lendo os arquivos do backup..."
"${PSQL[@]}" -c "DROP SCHEMA IF EXISTS importacao CASCADE; CREATE SCHEMA importacao;"
for t in $TABELAS; do
  f="$DADOS/$t.csv"
  [ -f "$f" ] || { echo "    (sem $t.csv, pulando)"; continue; }
  HEADER="$(head -1 "$f" | tr -d '\r\357\273\277')"
  COLS="$(echo "$HEADER" | sed 's/,/ text, /g') text"
  "${PSQL[@]}" -c "CREATE TABLE importacao.$t ($COLS);"
  "${PSQL[@]}" -c "\copy importacao.$t FROM STDIN WITH (FORMAT csv, HEADER true)" < "$f"
  echo "    $t: $("${PSQL[@]}" -Atc "select count(*) from importacao.$t") registros"
done

SENHA="Seta$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 10)"

# Insere apenas as colunas que existem nos dois lados
ins() { # tabela  [ON CONFLICT ...]
  local t="$1"
  echo "DO \$\$ DECLARE c text; BEGIN
    IF to_regclass('importacao.$t') IS NULL THEN RETURN; END IF;
    SELECT string_agg(quote_ident(a.column_name), ',') INTO c
      FROM information_schema.columns a
      JOIN information_schema.columns b ON b.column_name = a.column_name
       AND b.table_schema = 'importacao' AND b.table_name = '$t'
     WHERE a.table_schema = 'public' AND a.table_name = '$t'
       AND a.is_generated = 'NEVER';
    EXECUTE format('INSERT INTO public.$t (%s) SELECT %s FROM importacao.$t ON CONFLICT DO NOTHING', c, c);
  END \$\$;"
}

echo "==> 3/4 Importando (tudo ou nada)..."
{
cat <<SQL
BEGIN;
SET session_replication_role = replica;

-- Usuários: remove contas locais com o mesmo e-mail mas outro ID
CREATE TEMP TABLE conflito AS
  SELECT u.id FROM auth.users u JOIN importacao.profiles p
    ON lower(u.email) = lower(p.email) AND u.id <> p.id::uuid;
DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM conflito);
DELETE FROM public.user_roles WHERE user_id IN (SELECT id FROM conflito);
DELETE FROM public.profiles WHERE id IN (SELECT id FROM conflito);
DELETE FROM auth.users WHERE id IN (SELECT id FROM conflito);

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
SELECT '00000000-0000-0000-0000-000000000000', p.id::uuid, 'authenticated', 'authenticated',
  lower(p.email), extensions.crypt('$SENHA', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nome', p.nome),
  coalesce(p.created_at::timestamptz, now()), now(), '', '', '', '', '', '', '', ''
FROM importacao.profiles p
WHERE p.email IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id::uuid);

UPDATE auth.users u SET encrypted_password = extensions.crypt('$SENHA', extensions.gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now())
FROM importacao.profiles p WHERE u.id = p.id::uuid;

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now()
FROM auth.users u JOIN importacao.profiles p ON p.id::uuid = u.id
WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email');

-- Dados do sistema: substitui pelo conteúdo do backup
TRUNCATE public.protocolo_historico, public.email_inbox_log, public.protocolos,
  public.secretaria_responsaveis, public.locais, public.assuntos, public.secretarias,
  public.protocolos_antigos_conclusoes, public.email_inbox_accounts, public.coletas CASCADE;
SQL
for t in secretarias locais assuntos allowed_emails profiles user_roles secretaria_responsaveis protocolos protocolo_historico protocolos_antigos_conclusoes email_inbox_accounts email_inbox_log coletas; do
  ins "$t"
done
cat <<'SQL'
SET session_replication_role = origin;
COMMIT;
SQL
} > "$TMP/importar.sql"

# ai_config separado (só se vazio)
if [ -f "$DADOS/ai_config.csv" ] && [ "$("${PSQL[@]}" -Atc 'select count(*) from public.ai_config')" = "0" ]; then
  ins ai_config >> "$TMP/importar.sql"
fi
echo "DROP SCHEMA importacao CASCADE; NOTIFY pgrst, 'reload schema';" >> "$TMP/importar.sql"

"${PSQL[@]}" < "$TMP/importar.sql"

echo "==> 4/4 Conferindo..."
for t in secretarias locais assuntos protocolos protocolo_historico email_inbox_log profiles; do
  printf "    %-28s %s\n" "$t" "$("${PSQL[@]}" -Atc "select count(*) from public.$t")"
done

echo ""
echo "=================== PRONTO ==================="
echo " Dados importados do sistema original."
echo " Usuários do sistema original (entre e troque a senha):"
"${PSQL[@]}" -Atc "select '   - ' || p.email || ' (' || coalesce(r.role::text,'sem perfil') || ')' from public.profiles p left join public.user_roles r on r.user_id = p.id order by p.email"
echo " Senha temporária de todos: $SENHA"
echo " Backup anterior: local-docker/$ARQ"
echo "=============================================="
