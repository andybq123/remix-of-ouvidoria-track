ALTER TABLE public.onedoc_config
  ADD COLUMN IF NOT EXISTS muse_pausado boolean NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
