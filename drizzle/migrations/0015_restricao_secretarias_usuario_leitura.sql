CREATE TABLE public.user_secretarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  secretaria_id uuid NOT NULL REFERENCES public.secretarias(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, secretaria_id)
);

GRANT SELECT ON public.user_secretarias TO authenticated;
GRANT ALL ON public.user_secretarias TO service_role;

ALTER TABLE public.user_secretarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam areas de usuarios"
ON public.user_secretarias FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Usuario le proprias areas"
ON public.user_secretarias FOR SELECT TO authenticated
USING (email = lower(auth.jwt() ->> 'email'));

DROP POLICY "Autenticados leem protocolos" ON public.protocolos;

CREATE POLICY "Autenticados leem protocolos"
ON public.protocolos FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      sigilo = 'publico'
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.user_secretarias us
          WHERE us.email = lower(auth.jwt() ->> 'email')
        )
        OR protocolos.secretaria_id IN (
          SELECT us2.secretaria_id FROM public.user_secretarias us2
          WHERE us2.email = lower(auth.jwt() ->> 'email')
        )
      )
    )
  )
);