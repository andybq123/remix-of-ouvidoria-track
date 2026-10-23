BEGIN;
CREATE OR REPLACE FUNCTION public.posso_editar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.allowed_emails a
    WHERE lower(a.email) = lower(auth.jwt() ->> 'email') AND a.pode_editar)
$$;
REVOKE EXECUTE ON FUNCTION public.posso_editar() FROM anon;
GRANT EXECUTE ON FUNCTION public.posso_editar() TO authenticated;COMMIT;
