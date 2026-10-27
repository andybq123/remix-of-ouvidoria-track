CREATE OR REPLACE FUNCTION public.normalizar_busca_protocolo(p_texto text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
 SELECT regexp_replace(regexp_replace(translate(lower(coalesce(p_texto, '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'), U&'[\0300-\036f]', '', 'g'), '(\d)\.(?=\d)', '\1', 'g')
$$;
REVOKE ALL ON FUNCTION public.normalizar_busca_protocolo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalizar_busca_protocolo(text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.listar_protocolos_pagina(p_filtros jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH filtros AS (
 SELECT coalesce(p_filtros->>'mes','all') AS mes, coalesce(p_filtros->>'status','todos') AS status,
 coalesce(p_filtros->>'tipo','todos') AS tipo, coalesce(p_filtros->>'categoria','todos') AS categoria,
 coalesce(p_filtros->>'secretaria','todos') AS secretaria, nullif(p_filtros->>'dataIni','')::date AS inicio,
 nullif(p_filtros->>'dataFim','')::date AS fim,
 public.normalizar_busca_protocolo(trim(coalesce(p_filtros->>'busca',''))) AS busca,
 coalesce((p_filtros->>'somenteVigilancia')::boolean,false) AS vigilancia,
 greatest(1,coalesce((p_filtros->>'pagina')::integer,1)) AS pagina
), correspondentes AS MATERIALIZED (
 SELECT p.id,p.numero,p.numero_esic,p.tipo,p.categoria,p.status,p.assunto,p.descricao,p.solicitante,
 p.data_abertura,p.prorrogado,p.origem,p.sigilo,s.nome AS secretaria_nome,s.sigla AS secretaria_sigla
 FROM public.protocolos p LEFT JOIN public.secretarias s ON s.id=p.secretaria_id
 LEFT JOIN public.locais l ON l.id=p.local_id CROSS JOIN filtros f
 WHERE (CASE WHEN f.mes='antigos' THEN p.origem LIKE 'antigo:%'
 ELSE NOT p.triagem_pendente AND (p.origem IS NULL OR p.origem NOT LIKE 'antigo:%') END)
 AND (f.mes='antigos' OR f.vigilancia OR s.nome IS DISTINCT FROM 'Saúde')
 AND (f.status='todos' OR p.status::text=f.status)
 AND (p.status<>'concluido' OR f.mes='antigos' OR f.status='concluido'
 OR (f.busca<>'' AND position(f.busca IN public.normalizar_busca_protocolo(concat_ws(' ',p.numero,p.numero_esic)))>0))
 AND (f.tipo='todos' OR p.tipo::text=f.tipo)
 AND (f.categoria='todos' OR (CASE WHEN p.tipo='esic' THEN 'esic' ELSE p.categoria::text END)=f.categoria)
 AND (f.secretaria='todos' OR p.secretaria_id::text=f.secretaria)
 AND (f.inicio IS NULL OR p.data_abertura>=f.inicio) AND (f.fim IS NULL OR p.data_abertura<=f.fim)
 AND (f.inicio IS NOT NULL OR f.fim IS NOT NULL OR f.busca<>'' OR f.mes IN ('all','antigos')
 OR (p.data_abertura>= (f.mes||'-01')::date AND p.data_abertura< ((f.mes||'-01')::date+interval '1 month')))
 AND NOT EXISTS (SELECT 1 FROM regexp_split_to_table(f.busca,'\s+') AS termo
 WHERE termo<>'' AND position(termo IN public.normalizar_busca_protocolo(concat_ws(' ',
 p.numero,p.numero_esic,p.assunto,p.descricao,p.resolucao,p.solicitante,p.contato_solicitante,
 p.endereco,p.origem,p.categoria::text,p.tipo::text,CASE WHEN p.tipo='esic' THEN 'e-SIC acesso à informação' END,
 p.status::text,l.nome,s.nome,s.sigla)))=0)
), contagem AS (SELECT count(*) AS total FROM correspondentes), paginacao AS (
 SELECT total,least(f.pagina,greatest(1,ceil(total/50.0)::integer)) AS pagina FROM contagem CROSS JOIN filtros f
), pagina AS (
 SELECT * FROM correspondentes
 ORDER BY coalesce(nullif(regexp_replace(split_part(numero,'/',2),'\D','','g'),''),'0')::numeric DESC,
 coalesce(nullif(regexp_replace(split_part(numero,'/',1),'\D','','g'),''),'0')::numeric DESC,id
 LIMIT 50 OFFSET (SELECT (pagina-1)::bigint*50 FROM paginacao)
)
SELECT jsonb_build_object('total',total,'pagina',pagina,'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
 'id',p.id,'numero',p.numero,'numero_esic',p.numero_esic,'tipo',p.tipo,'categoria',p.categoria,
 'status',p.status,'assunto',p.assunto,'descricao',p.descricao,'solicitante',p.solicitante,
 'data_abertura',p.data_abertura,'prorrogado',p.prorrogado,'origem',p.origem,'sigilo',p.sigilo,
 'secretarias',CASE WHEN p.secretaria_nome IS NOT NULL THEN jsonb_build_object('nome',p.secretaria_nome,'sigla',p.secretaria_sigla) END
 )) FROM pagina p),'[]'::jsonb)) FROM paginacao
$$;
REVOKE ALL ON FUNCTION public.listar_protocolos_pagina(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_protocolos_pagina(jsonb) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.meses_protocolos_listagem()
RETURNS TABLE(mes text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT DISTINCT to_char(data_abertura,'YYYY-MM') AS mes FROM public.protocolos
 WHERE NOT triagem_pendente AND (origem IS NULL OR origem NOT LIKE 'antigo:%') ORDER BY mes DESC
$$;
REVOKE ALL ON FUNCTION public.meses_protocolos_listagem() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meses_protocolos_listagem() TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';