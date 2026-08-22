-- Restore the admin Pricing Management read path and backfill only provable
-- canonical price rows. Checkout remains strict: no synthetic supplier or
-- zero-cost row is created by this repair.

BEGIN;

-- The original pricing migrations installed admin RLS policies but omitted
-- table privileges for PostgREST's authenticated role.  A policy cannot grant
-- a privilege the role does not have, hence the admin UI's 403 responses.
GRANT SELECT ON TABLE public.supplier_price_history, public.selling_price_history
  TO authenticated;

ALTER TABLE public.supplier_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selling_price_history ENABLE ROW LEVEL SECURITY;

-- Keep the existing admin-only boundary explicit and idempotent.  This does
-- not grant anon or supplier read access.
DROP POLICY IF EXISTS "price_history_admin_all" ON public.supplier_price_history;
CREATE POLICY "price_history_admin_all" ON public.supplier_price_history
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "price_history_admin_all" ON public.selling_price_history;
CREATE POLICY "price_history_admin_all" ON public.selling_price_history
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Repair only active rows whose existing supplier name maps unambiguously to
-- an existing canonical supplier.  It preserves the entered cost and does not
-- invent suppliers.
WITH resolvable_active_rows AS (
  SELECT h.id,
         (
           SELECT s.id
             FROM public.suppliers s
            WHERE lower(btrim(s.name)) = lower(btrim(h.supplier_name))
            ORDER BY s.id
            LIMIT 1
         ) AS supplier_id
    FROM public.supplier_price_history h
   WHERE h.is_active
     AND h.supplier_id IS NULL
     AND h.cost_price > 0
     AND btrim(COALESCE(h.supplier_name, '')) <> ''
)
UPDATE public.supplier_price_history h
   SET supplier_id = r.supplier_id,
       updated_at = now()
  FROM resolvable_active_rows r
 WHERE h.id = r.id
   AND r.supplier_id IS NOT NULL;

-- Legacy products created before price history can be seeded only when there
-- is no active canonical row.  The live Product values are copied unchanged.
INSERT INTO public.selling_price_history
  (product_id, selling_price, effective_from, effective_to, is_active, created_by, updated_by)
SELECT p.id, p.price, now(), NULL, true, auth.uid(), auth.uid()
  FROM public."Product" p
 WHERE p.price > 0
   AND NOT EXISTS (
     SELECT 1 FROM public.selling_price_history h
      WHERE h.product_id = p.id AND h.is_active
   );

INSERT INTO public.supplier_price_history
  (product_id, supplier_id, supplier_name, cost_price,
   effective_from, effective_to, is_active, created_by, updated_by)
SELECT p.id, s.id, s.name, p.cost_price,
       now(), NULL, true, auth.uid(), auth.uid()
  FROM public."Product" p
  JOIN public.suppliers s
    ON lower(btrim(s.name)) = lower(btrim(p.cost_supplier_name))
 WHERE p.cost_price > 0
   AND btrim(COALESCE(p.cost_supplier_name, '')) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.supplier_price_history h
      WHERE h.product_id = p.id AND h.is_active
   );

-- A supplier price published through the public RPC must always be usable by
-- canonical checkout.  The SECURITY DEFINER wrapper retains its admin check;
-- this implementation additionally rejects empty suppliers and zero costs.
CREATE OR REPLACE FUNCTION public._pricing_set_supplier(
  p_product_id text,
  p_cost_price numeric,
  p_supplier_name text,
  p_supplier_id bigint,
  p_effective_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_supplier_id bigint := p_supplier_id;
  v_supplier text := COALESCE(btrim(p_supplier_name), '');
  v_eff timestamptz := COALESCE(p_effective_at, now());
  v_canon_new text;
  v_same boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_product_id IS NULL OR btrim(p_product_id) = '' THEN
    RAISE EXCEPTION 'Invalid product id.';
  END IF;
  IF p_cost_price IS NULL OR p_cost_price <= 0 THEN
    RAISE EXCEPTION 'Supplier cost must be greater than zero.';
  END IF;
  IF v_supplier_id IS NULL AND v_supplier = '' THEN
    RAISE EXCEPTION 'Supplier is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('supplier:v2_2_2:' || p_product_id));

  IF v_supplier_id IS NULL THEN
    SELECT s.id INTO v_supplier_id
      FROM public.suppliers s
     WHERE lower(btrim(s.name)) = lower(v_supplier)
     ORDER BY s.id LIMIT 1;
    IF v_supplier_id IS NULL THEN
      INSERT INTO public.suppliers (name) VALUES (v_supplier)
        RETURNING id INTO v_supplier_id;
    END IF;
  END IF;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Canonical supplier could not be resolved.';
  END IF;

  v_canon_new := lower((SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id));

  SELECT EXISTS (
    SELECT 1
      FROM public.supplier_price_history h
     WHERE h.product_id = p_product_id
       AND h.is_active
       AND h.cost_price = p_cost_price
       AND lower(coalesce(
             (SELECT s2.name FROM public.suppliers s2 WHERE s2.id = h.supplier_id),
             coalesce(h.supplier_name, ''), '')) = v_canon_new
  ) INTO v_same;

  IF v_same THEN
    UPDATE public.supplier_price_history h
       SET supplier_id = v_supplier_id,
           supplier_name = (SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id),
           updated_by = auth.uid(), updated_at = now()
     WHERE h.product_id = p_product_id
       AND h.is_active
       AND h.cost_price = p_cost_price
       AND h.supplier_id IS NULL
       AND lower(coalesce(h.supplier_name, '')) = v_canon_new;

    UPDATE public."Product"
       SET cost_price = p_cost_price,
           cost_supplier_name = (SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id)
     WHERE id = p_product_id;
    RETURN;
  END IF;

  UPDATE public.supplier_price_history
     SET effective_to = v_eff, is_active = false,
         updated_by = auth.uid(), updated_at = now()
   WHERE product_id = p_product_id AND is_active;

  INSERT INTO public.supplier_price_history
    (product_id, supplier_id, supplier_name, cost_price,
     effective_from, effective_to, is_active, created_by, updated_by)
  VALUES
    (p_product_id, v_supplier_id,
     (SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id),
     p_cost_price, v_eff, NULL, true, auth.uid(), auth.uid());

  UPDATE public."Product"
     SET cost_price = p_cost_price,
         cost_supplier_name = (SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id)
   WHERE id = p_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public._pricing_set_supplier(text, numeric, text, bigint, timestamptz)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_product_supplier_price(text, numeric, text)
  TO authenticated;

COMMIT;
