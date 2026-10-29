-- Dashboard: todas as ouvidorias em uma chamada compacta (respeita as permissões do usuário).
CREATE OR REPLACE FUNCTION public.dashboard_protocolos()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_array(
    p.id, p.numero, p.numero_esic, p.tipo, p.categoria, p.assunto, p.status, p.secretaria_id, p.local_id,
    p.solicitante, p.endereco, p.latitude, p.longitude, p.data_abertura, p.data_conclusao, p.data_prorrogacao,
    p.prorrogado, p.created_at, p.triagem_concluida_em, p.triagem_pendente, p.resolucao, p.origem, p.sigilo,
    p.url, p.responsavel_id, l.nome, r.nome
  ) ORDER BY p.data_abertura DESC), '[]'::jsonb)
  FROM public.protocolos p
  LEFT JOIN public.locais l ON l.id = p.local_id
  LEFT JOIN public.secretaria_responsaveis r ON r.id = p.responsavel_id
  WHERE p.triagem_pendente = false OR p.tipo = 'esic'
$$;
REVOKE ALL ON FUNCTION public.dashboard_protocolos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_protocolos() TO authenticated, service_role;