-- A PL/pgSQL %ROWTYPE retains its previous value until explicitly replaced.
-- Canonical checkout serialises one source-version reference per line, so a
-- combo followed by a standalone product must clear the previous combo record
-- before the next INSERT into sales_order_lines.
--
-- Keep sales_order_lines_version_reference_check intact: it is the immutable
-- lineage invariant, and this repairs the serializer to satisfy it.

BEGIN;

-- The deployed canonical placement function has evolved independently of the
-- checked-in function body. Normalize the row at the immutable table boundary
-- instead of replacing a function by source-text match. This fixes both the
-- current serializer and any compatible retry path without relaxing the check.
CREATE OR REPLACE FUNCTION public.normalize_sales_order_line_version_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.item_kind = 'product' THEN
    NEW.combo_version_id := NULL;
  ELSIF NEW.item_kind = 'combo' THEN
    NEW.product_version_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_sales_order_line_version_reference
  ON public.sales_order_lines;
CREATE TRIGGER trg_normalize_sales_order_line_version_reference
BEFORE INSERT OR UPDATE OF item_kind, product_version_id, combo_version_id
ON public.sales_order_lines
FOR EACH ROW EXECUTE FUNCTION public.normalize_sales_order_line_version_reference();

COMMIT;
