-- Simula o mínimo que o serviço de login local cria antes das migrações do sistema.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE supabase_read_only_user NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA extensions;
GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE auth.users (
  instance_id uuid, id uuid PRIMARY KEY DEFAULT gen_random_uuid(), aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), last_sign_in_at timestamptz,
  confirmation_token text, recovery_token text, email_change_token_new text, email_change text,
  email_change_token_current text, phone_change text, phone_change_token text, reauthentication_token text,
  banned_until timestamptz, deleted_at timestamptz);
CREATE TABLE auth.identities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id text, identity_data jsonb, provider text, created_at timestamptz, updated_at timestamptz, last_sign_in_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('sub', auth.uid(), 'email', nullif(current_setting('request.jwt.claim.email', true), '')) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
