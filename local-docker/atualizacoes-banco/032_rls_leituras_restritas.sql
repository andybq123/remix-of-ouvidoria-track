-- Restringe leituras amplas (coletas, responsáveis, conclusões antigas)
DROP POLICY IF EXISTS "Autenticados podem ler coletas" ON public.coletas;
DROP POLICY IF EXISTS "Admins leem coletas" ON public.coletas;
CREATE POLICY "Admins leem coletas" ON public.coletas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Autenticados leem responsaveis" ON public.secretaria_responsaveis;
DROP POLICY IF EXISTS "Usuarios leem responsaveis da area" ON public.secretaria_responsaveis;
CREATE POLICY "Usuarios leem responsaveis da area" ON public.secretaria_responsaveis FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.area_permitida(secretaria_id, NULL));

DROP POLICY IF EXISTS "Autenticados leem conclusoes antigos" ON public.protocolos_antigos_conclusoes;
DROP POLICY IF EXISTS "Editores leem conclusoes antigos" ON public.protocolos_antigos_conclusoes;
CREATE POLICY "Editores leem conclusoes antigos" ON public.protocolos_antigos_conclusoes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.posso_editar());
