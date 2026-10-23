CREATE POLICY "Autenticados leem secretarias"
ON public.secretarias FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Autenticados leem locais"
ON public.locais FOR SELECT TO authenticated
USING (true);