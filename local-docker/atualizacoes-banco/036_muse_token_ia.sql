ALTER TABLE public.ai_config
  ADD COLUMN IF NOT EXISTS muse_api_token text;
NOTIFY pgrst, 'reload schema';
