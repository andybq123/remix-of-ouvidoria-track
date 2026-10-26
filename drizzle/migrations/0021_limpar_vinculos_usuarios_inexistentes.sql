CREATE OR REPLACE FUNCTION public.limpar_vinculos_usuarios_inexistentes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n integer;
  total integer := 0;
BEGIN
  PERFORM set_config('app.importando', 'on', true);
  FOR r IN
    SELECT c.conrelid::regclass::text AS tabela, a.attname::text AS coluna
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass
      AND c.confdeltype = 'n' AND array_length(c.conkey, 1) = 1
      AND c.connamespace = 'public'::regnamespace
    UNION
    SELECT format('public.%I', col.table_name), col.column_name::text
    FROM information_schema.columns col
    JOIN pg_tables t ON t.schemaname = 'public' AND t.tablename = col.table_name
    WHERE col.table_schema = 'public' AND col.data_type = 'uuid' AND col.is_nullable = 'YES'
      AND col.column_name IN ('created_by', 'updated_by', 'criado_por')
  LOOP
    EXECUTE format(
      'UPDATE %s t SET %I = NULL WHERE t.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.%I)',
      r.tabela, r.coluna, r.coluna, r.coluna);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  RETURN total;
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_vinculos_usuarios_inexistentes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpar_vinculos_usuarios_inexistentes() TO service_role;