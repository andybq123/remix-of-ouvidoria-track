CREATE OR REPLACE FUNCTION public.cancelar_atualizacao_pendente(p_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Acesso negado'; END IF;
 UPDATE public.atualizacao_jobs SET status='erro',mensagem='Pedido não iniciado cancelado pelo administrador',updated_at=now()
 WHERE id=p_id AND status='pendente' AND created_at < now()-interval '1 minute';
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END $$;
REVOKE ALL ON FUNCTION public.cancelar_atualizacao_pendente(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancelar_atualizacao_pendente(uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';