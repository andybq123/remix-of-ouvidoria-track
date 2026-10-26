CREATE OR REPLACE FUNCTION public.bloquear_se_licenca()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') AND public.licenca_bloqueada() THEN
    RAISE EXCEPTION 'Sistema bloqueado pela licença: somente consulta' USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END $$;