-- The combo builder makes authenticated clients read-only at the table level.
-- Reordering must therefore use an admin-only, SECURITY DEFINER RPC.
CREATE OR REPLACE FUNCTION public.move_combo(p_id text, p_to_index integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids text[];
  v_new text[];
  v_cur integer;
  v_to integer;
  i integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL OR p_to_index IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(id ORDER BY is_pinned DESC, display_order ASC, id ASC)
    INTO v_ids
    FROM public.combos;
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN;
  END IF;

  FOR i IN 1 .. cardinality(v_ids) LOOP
    IF v_ids[i] = p_id THEN
      v_cur := i - 1;
      EXIT;
    END IF;
  END LOOP;
  IF v_cur IS NULL THEN
    RETURN;
  END IF;

  v_to := LEAST(GREATEST(p_to_index, 0), cardinality(v_ids) - 1);
  IF v_to = v_cur THEN
    RETURN;
  END IF;

  v_new := '{}';
  FOR i IN 1 .. cardinality(v_ids) LOOP
    IF v_ids[i] <> p_id THEN
      v_new := array_append(v_new, v_ids[i]);
    END IF;
  END LOOP;
  v_new := v_new[1:v_to] || ARRAY[p_id] || v_new[v_to + 1:];

  FOR i IN 1 .. cardinality(v_new) LOOP
    IF v_new[i] IS DISTINCT FROM v_ids[i] THEN
      UPDATE public.combos
         SET display_order = i - 1
       WHERE id = v_new[i];
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.move_combo(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_combo(text, integer) TO authenticated;
