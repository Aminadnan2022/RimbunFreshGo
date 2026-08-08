-- Reorder functions for admin drag-and-drop.
--
-- Updates ONLY `display_order` for existing rows (never touches other
-- columns), in a single transaction. Called by the frontend via
-- supabase.rpc so the whole reorder is one request.
--
-- NOTE: We deliberately do NOT use INSERT ... ON CONFLICT / upsert here:
-- partial upserts fail with error 23502 (NOT NULL violation) because the
-- INSERT attempt requires values for other NOT NULL columns.

CREATE OR REPLACE FUNCTION reorder_products(p_ids text[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  i integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;
  FOR i IN 0 .. cardinality(p_ids) - 1 LOOP
    UPDATE "Product" SET display_order = i WHERE id = p_ids[i + 1];
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION reorder_combos(p_ids text[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  i integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;
  FOR i IN 0 .. cardinality(p_ids) - 1 LOOP
    UPDATE combos SET display_order = i WHERE id = p_ids[i + 1];
  END LOOP;
END;
$$;
