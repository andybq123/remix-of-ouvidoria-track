CREATE OR REPLACE FUNCTION public.formatar_numero_esic(p_numero text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = public AS $$
  WITH partes AS (SELECT regexp_match(regexp_replace(btrim(p_numero), '[.[:space:]]', '', 'g'), '^([0-9]+)/([0-9]{4})$') AS m),
  digitos AS (SELECT coalesce(nullif(ltrim(m[1], '0'), ''), '0') AS n, m[2] AS ano FROM partes WHERE m IS NOT NULL)
  SELECT regexp_replace(lpad(n, greatest(4, length(n)), '0'), '(\d)(?=(\d{3})+$)', '\1.', 'g') || '/' || ano FROM digitos;
$$;
CREATE OR REPLACE FUNCTION public.sincronizar_numero_esic()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE oficial text;
BEGIN
  IF current_setting('app.importando', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.tipo = 'esic'::public.protocolo_tipo THEN
    oficial := public.formatar_numero_esic(coalesce(nullif(btrim(NEW.numero_esic), ''), NEW.numero));
    IF oficial IS NULL THEN RAISE EXCEPTION 'Informe um número e-SIC válido no formato número/ano.'; END IF;
    NEW.numero_esic := oficial;
    NEW.numero := oficial;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trg_zz_sincronizar_numero_esic BEFORE INSERT OR UPDATE ON public.protocolos
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_numero_esic();