CREATE TABLE IF NOT EXISTS public.licenca_estado (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bloqueado boolean NOT NULL DEFAULT false,
  motivo text,
  codigo text,
  verificado_em timestamptz
);
INSERT INTO public.licenca_estado (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.licenca_estado TO authenticated;
GRANT ALL ON public.licenca_estado TO service_role;
ALTER TABLE public.licenca_estado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "licenca_estado leitura" ON public.licenca_estado;
CREATE POLICY "licenca_estado leitura" ON public.licenca_estado FOR SELECT TO authenticated USING (true);
CREATE OR REPLACE FUNCTION public.licenca_bloqueada()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT bloqueado FROM public.licenca_estado WHERE id = 1), false)
$$;
GRANT EXECUTE ON FUNCTION public.licenca_bloqueada() TO authenticated, service_role, anon;
CREATE OR REPLACE FUNCTION public.bloquear_se_licenca()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') AND public.licenca_bloqueada() THEN
    RAISE EXCEPTION 'Sistema bloqueado pela licença: somente consulta' USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.bloquear_se_licenca() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.aplicar_bloqueio_licenca()
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
           AND tablename NOT IN ('licenca_estado', 'registro_sistema') LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_bloqueio_licenca ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_bloqueio_licenca BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.bloquear_se_licenca()', t);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.aplicar_bloqueio_licenca() FROM PUBLIC, anon, authenticated;
SELECT public.aplicar_bloqueio_licenca();
DROP TRIGGER IF EXISTS trg_registro_sistema ON public.licenca_estado;
CREATE TRIGGER trg_registro_sistema AFTER INSERT OR UPDATE OR DELETE ON public.licenca_estado
  FOR EACH ROW EXECUTE FUNCTION public.registrar_alteracao();