-- Cursores para sincronização incremental de Gmail e IMAP.
ALTER TABLE public.email_inbox_accounts
  ADD COLUMN IF NOT EXISTS gmail_history_id text,
  ADD COLUMN IF NOT EXISTS imap_uid_validity text,
  ADD COLUMN IF NOT EXISTS imap_last_uid bigint,
  ADD COLUMN IF NOT EXISTS ultima_sync_sucesso_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_sync_erro_detalhe text;
