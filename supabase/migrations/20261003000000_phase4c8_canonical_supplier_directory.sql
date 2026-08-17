BEGIN;

CREATE OR REPLACE FUNCTION public.get_canonical_supplier_directory()
RETURNS TABLE (
  supplier_id bigint,
  supplier_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN QUERY
    SELECT
      s.id,
      s.name
    FROM public.suppliers s
    ORDER BY s.name, s.id;

    RETURN;
  END IF;

  IF public.is_supplier() THEN
    RETURN QUERY
    SELECT DISTINCT
      s.id,
      s.name
    FROM public.suppliers s
    JOIN public.supplier_users su
      ON su.supplier_id = s.id
    WHERE su.user_id = auth.uid()
      AND su.active
    ORDER BY s.name, s.id;

    RETURN;
  END IF;

  RAISE EXCEPTION 'Admin or supplier access required.';
END;
$$;

REVOKE EXECUTE
ON FUNCTION public.get_canonical_supplier_directory()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.get_canonical_supplier_directory()
TO authenticated;

COMMIT;
