CREATE OR REPLACE FUNCTION public.bloquear_se_licenca()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF (current_user IN ('authenticated', 'anon', 'service_role')
      OR current_setting('role', true) IN ('authenticated', 'anon', 'service_role'))
     AND public.licenca_bloqueada() THEN
    RAISE EXCEPTION 'Sistema bloqueado pela licença: somente consulta' USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END $$;