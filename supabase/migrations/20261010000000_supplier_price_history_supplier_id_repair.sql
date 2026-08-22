-- Repair active legacy supplier-cost rows that have a resolvable supplier name
-- but no canonical supplier id. Keep checkout validation strict: only rows
-- already linked to an existing supplier by name are repaired here.

BEGIN;

WITH resolvable_active_rows AS (
  SELECT
    h.id,
    (
      SELECT s.id
      FROM public.suppliers s
      WHERE lower(btrim(s.name)) = lower(btrim(h.supplier_name))
      ORDER BY s.id
      LIMIT 1
    ) AS resolved_supplier_id
  FROM public.supplier_price_history h
  WHERE h.is_active = true
    AND h.supplier_id IS NULL
    AND btrim(COALESCE(h.supplier_name, '')) <> ''
)
UPDATE public.supplier_price_history h
   SET supplier_id = resolved.resolved_supplier_id,
       updated_by = auth.uid(),
       updated_at = now()
  FROM resolvable_active_rows resolved
 WHERE h.id = resolved.id
   AND resolved.resolved_supplier_id IS NOT NULL;

-- The v2.2.2 idempotency check compares canonical supplier names. Previously,
-- an old row with the same name and cost but supplier_id NULL returned early,
-- preserving the invalid active row. Repair that row before returning.
CREATE OR REPLACE FUNCTION public._pricing_set_supplier(
  p_product_id    text,
  p_cost_price    numeric,
  p_supplier_name text,
  p_supplier_id   bigint,
  p_effective_at  timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_supplier_id bigint := p_supplier_id;
  v_supplier    text   := COALESCE(btrim(p_supplier_name), '');
  v_eff         timestamptz := COALESCE(p_effective_at, now());
  v_canon_new   text;
  v_same        boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_product_id IS NULL OR btrim(p_product_id) = '' THEN
    RAISE EXCEPTION 'Invalid product id.';
  END IF;
  IF p_cost_price IS NULL OR p_cost_price < 0 THEN
    RAISE EXCEPTION 'Invalid cost price.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('supplier:v2_2_2:' || p_product_id));

  IF v_supplier_id IS NULL AND v_supplier <> '' THEN
    SELECT s.id INTO v_supplier_id
      FROM public.suppliers s
     WHERE lower(s.name) = lower(v_supplier)
     ORDER BY s.id LIMIT 1;
    IF v_supplier_id IS NULL THEN
      INSERT INTO public.suppliers (name) VALUES (v_supplier)
        RETURNING id INTO v_supplier_id;
    END IF;
  END IF;

  v_canon_new := lower(coalesce(
    (SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id),
    v_supplier, ''));

  SELECT EXISTS (
    SELECT 1
      FROM public.supplier_price_history h
     WHERE h.product_id  = p_product_id
       AND h.is_active   = true
       AND h.cost_price  = p_cost_price
       AND lower(coalesce(
             (SELECT s2.name FROM public.suppliers s2 WHERE s2.id = h.supplier_id),
             coalesce(h.supplier_name,''), '')) = v_canon_new
  ) INTO v_same;
  IF v_same THEN
    UPDATE public.supplier_price_history h
       SET supplier_id = v_supplier_id,
           supplier_name = coalesce(
             (SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id),
             v_supplier
           ),
           updated_by = auth.uid(),
           updated_at = now()
     WHERE h.product_id = p_product_id
       AND h.is_active = true
       AND h.cost_price = p_cost_price
       AND h.supplier_id IS NULL
       AND v_supplier_id IS NOT NULL
       AND lower(coalesce(h.supplier_name, '')) = v_canon_new;

    UPDATE public."Product" SET cost_price = p_cost_price,
           cost_supplier_name = coalesce((SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id), v_supplier)
     WHERE id = p_product_id;
    RETURN;
  END IF;

  UPDATE public.supplier_price_history
     SET effective_to = v_eff,
         is_active    = false,
         updated_by   = auth.uid(),
         updated_at   = now()
   WHERE product_id   = p_product_id
     AND is_active    = true;

  INSERT INTO public.supplier_price_history
    (product_id, supplier_id, supplier_name, cost_price,
     effective_from, effective_to, is_active, created_by, updated_by)
  VALUES
    (p_product_id, v_supplier_id,
     coalesce((SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id), v_supplier),
     p_cost_price, v_eff, NULL, true, auth.uid(), auth.uid());

  UPDATE public."Product" SET cost_price = p_cost_price,
         cost_supplier_name = coalesce((SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id), v_supplier)
   WHERE id = p_product_id;
END;
$$;

COMMIT;
