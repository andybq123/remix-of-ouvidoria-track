ALTER TABLE public.allowed_emails ADD COLUMN IF NOT EXISTS pode_editar boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.pode_editar_area(_secretaria uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_emails a
    WHERE lower(a.email) = lower(auth.jwt() ->> 'email') AND a.pode_editar
  ) AND (
    NOT EXISTS (SELECT 1 FROM public.user_secretarias us WHERE us.email = lower(auth.jwt() ->> 'email'))
    OR _secretaria IN (SELECT us2.secretaria_id FROM public.user_secretarias us2 WHERE us2.email = lower(auth.jwt() ->> 'email'))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.pode_editar_area(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pode_editar_area(uuid) TO authenticated;

DROP POLICY IF EXISTS "Editores atualizam protocolos da area" ON public.protocolos;
CREATE POLICY "Editores atualizam protocolos da area"
ON public.protocolos FOR UPDATE TO authenticated
USING (sigilo = 'publico' AND triagem_pendente = false AND public.pode_editar_area(secretaria_id))
WITH CHECK (sigilo = 'publico' AND triagem_pendente = false AND public.pode_editar_area(secretaria_id));