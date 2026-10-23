BEGIN;
DROP POLICY IF EXISTS "Autenticados leem secretarias" ON public.secretarias;
CREATE POLICY "Autenticados leem secretarias"
ON public.secretarias FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados leem locais" ON public.locais;
CREATE POLICY "Autenticados leem locais"
ON public.locais FOR SELECT TO authenticated USING (true);
COMMIT;
NOTIFY pgrst, 'reload schema';
