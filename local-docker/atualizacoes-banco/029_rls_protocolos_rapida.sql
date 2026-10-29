-- Política de leitura de protocolos: auth.uid()/has_role avaliados uma vez por consulta, não por linha.
DROP POLICY IF EXISTS "Autenticados leem protocolos" ON public.protocolos;
CREATE POLICY "Autenticados leem protocolos" ON public.protocolos FOR SELECT TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL AND ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)) OR (sigilo = 'publico' AND public.area_permitida(secretaria_id, local_id))));
