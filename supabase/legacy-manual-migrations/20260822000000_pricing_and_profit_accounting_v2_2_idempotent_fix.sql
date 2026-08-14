-- ═══════════════════════════════════════════════════════════════════════════
-- FRESHGO PRICING & PROFIT ACCOUNTING — VERSION 2.2 (IDEMPOTENCY / DEDUP FIX)
--
-- Runs AFTER V2 (20260820000000) and V2.1 (20260821000000).
-- Additive, idempotent, non-destructive. Does NOT redesign the schema.
--
-- PROBLEM
--   trg_product_first_price_history / ensure_product_first_price_history()
--   seed the FIRST history row on Product INSERT, and the admin page then calls
--   set_product_selling_price() / set_product_supplier_price(). The old
--   _pricing_set_selling / _pricing_set_supplier ALWAYS closed the active row
--   and INSERTED a new one, so saving the SAME value twice produced duplicate
--   identical ACTIVE rows (observed: senangin selling rows 29/30 @ RM37,
--   supplier rows 30/31 @ RM35, created within a millisecond).
--
-- FIX (this file)
--   1. Reconcile existing duplicate ACTIVE rows per product — keep the
--      earliest (lowest id) row active, close every later duplicate
--      (is_active=false, effective_to=effective_from). Nothing is deleted:
--      full audit history is preserved.
--   2. Make _pricing_set_selling() / _pricing_set_supplier() IDEMPOTENT —
--      a no-op when an ACTIVE row already carries the same numeric price /
--      same cost+supplier (numeric comparison, never string).
--      Existing public RPC signatures and the auto-first-history trigger are
--      preserved untouched.
--   3. Add UNIQUE partial indexes that make the "one active row per product"
--      invariant structural at the DB level. Re-running is fully idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. RECONCILE DUPLICATE ACTIVE ROWS  (idempotent; run before the unique idx)
--    Rule: within a product, keep the EARLIEST active row (lowest id) and
--    close any later active ones. Nothing is deleted.
-- ═══════════════════════════════════════════════════════════════════════════
WITH ranked AS (
  SELECT id, product_id,
         ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY id) AS rn
    FROM public.selling_price_history
   WHERE is_active = true
)
UPDATE public.selling_price_history h
   SET is_active    = false,
       effective_to = h.effective_from,
       updated_at   = now()
  FROM ranked r
 WHERE h.id = r.id
   AND r.rn > 1;

WITH ranked AS (
  SELECT id, product_id,
         ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY id) AS rn
    FROM public.supplier_price_history
   WHERE is_active = true
)
UPDATE public.supplier_price_history h
   SET is_active    = false,
       effective_to = h.effective_from,
       updated_at   = now()
  FROM ranked r
 WHERE h.id = r.id
   AND r.rn > 1;

-- Guard: if ANY product still has >1 active row the migration stops loudly,
-- so the UNIQUE indexes below can never be created on incompatible data.
DO $$
DECLARE
  n_selling  bigint;
  n_supplier bigint;
BEGIN
  SELECT count(*) INTO n_selling FROM (
    SELECT product_id FROM public.selling_price_history
     WHERE is_active GROUP BY product_id HAVING count(*) > 1
  ) d;
  SELECT count(*) INTO n_supplier FROM (
    SELECT product_id FROM public.supplier_price_history
     WHERE is_active GROUP BY product_id HAVING count(*) > 1
  ) d;
  IF n_selling > 0 OR n_supplier > 0 THEN
    RAISE EXCEPTION 'Duplicate ACTIVE price rows remain (% selling, % supplier) — resolve manually before index creation.', n_selling, n_supplier;
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. HARDENED INTERNAL PRICE SETTERS (SECURITY DEFINER, numeric-safe, no-op)
--    Compares NUMBERS (numeric =), never strings. Same signatures as V2.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._pricing_set_selling(
  p_product_id    text,
  p_selling_price numeric,
  p_effective_at  timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_same_id bigint;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_selling_price IS NULL OR p_selling_price < 0 THEN
    RAISE EXCEPTION 'Invalid selling price.';
  END IF;

  -- IDEMPOTENT NO-OP: an ACTIVE row already has this exact numeric price.
  SELECT id INTO v_same_id
    FROM public.selling_price_history
   WHERE product_id = p_product_id
     AND is_active = true
     AND selling_price = p_selling_price
   ORDER BY id
   LIMIT 1;

  IF v_same_id IS NOT NULL THEN
    -- Keep the legacy mirror truthful (idempotent update, row unchanged).
    UPDATE public."Product"
       SET price = p_selling_price
     WHERE id = p_product_id;
    RETURN;
  END IF;

  -- Real change: close the active row(s) (append-only history), then add one.
  UPDATE public.selling_price_history
     SET effective_to = p_effective_at,
         is_active    = false,
         updated_by   = auth.uid(),
         updated_at   = now()
   WHERE product_id = p_product_id
     AND is_active   = true;

  INSERT INTO public.selling_price_history
    (product_id, selling_price, effective_from, effective_to, is_active,
     created_by, updated_by)
  VALUES
    (p_product_id, p_selling_price, p_effective_at, NULL, true,
     auth.uid(), auth.uid());

  UPDATE public."Product"
     SET price = p_selling_price
   WHERE id = p_product_id;
END;
$$;

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
  v_supplier    text   := coalesce(trim(p_supplier_name), '');
  v_same_id     bigint;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_cost_price IS NULL OR p_cost_price < 0 THEN
    RAISE EXCEPTION 'Invalid cost price.';
  END IF;

  -- Resolve supplier: explicit id wins, otherwise find-or-create by name.
  IF v_supplier_id IS NULL AND v_supplier <> '' THEN
    SELECT id INTO v_supplier_id FROM public.suppliers WHERE lower(name) = lower(v_supplier);
    IF v_supplier_id IS NULL THEN
      INSERT INTO public.suppliers (name) VALUES (v_supplier) RETURNING id INTO v_supplier_id;
    END IF;
  END IF;

  -- IDEMPOTENT NO-OP: an ACTIVE row already holds the same supplier + cost.
  -- Supplier identity: prefer supplier_id; fall back to case-insensitive name.
  SELECT h.id INTO v_same_id
    FROM public.supplier_price_history h
   WHERE h.product_id = p_product_id
     AND h.is_active   = true
     AND h.cost_price  = p_cost_price
     AND (
           (h.supplier_id IS NOT NULL AND h.supplier_id = v_supplier_id)
        OR (h.supplier_id IS NULL
            AND v_supplier_id IS NULL
            AND lower(coalesce(h.supplier_name,'')) = lower(coalesce(v_supplier,'')))
     )
   ORDER BY h.id
   LIMIT 1;

  IF v_same_id IS NOT NULL THEN
    -- Keep the legacy mirrors truthful without touching history (no-op).
    UPDATE public."Product"
       SET cost_price = p_cost_price,
           cost_supplier_name =
             coalesce((SELECT name FROM public.suppliers WHERE id = v_supplier_id), v_supplier)
     WHERE id = p_product_id;
    RETURN;
  END IF;

  UPDATE public.supplier_price_history
     SET effective_to = p_effective_at,
         is_active    = false,
         updated_by   = auth.uid(),
         updated_at   = now()
   WHERE product_id = p_product_id
     AND is_active   = true;

  INSERT INTO public.supplier_price_history
    (product_id, supplier_id, supplier_name, cost_price,
     effective_from, effective_to, is_active, created_by, updated_by)
  VALUES
    (p_product_id, v_supplier_id,
     coalesce((SELECT name FROM public.suppliers WHERE id = v_supplier_id), v_supplier),
     p_cost_price, p_effective_at, NULL, true, auth.uid(), auth.uid());

  -- Legacy backend compat mirror (storefront keeps working unchanged)
  UPDATE public."Product"
     SET cost_price         = p_cost_price,
         cost_supplier_name =
           coalesce((SELECT name FROM public.suppliers WHERE id = v_supplier_id), v_supplier)
   WHERE id = p_product_id;
END;
$$;

-- Note: the four public RPC wrappers set_product_selling_price(_at) /
-- set_product_supplier_price(_at) are INTENTIONALLY left untouched (V2.1)
-- — they already route to _pricing_set_* and reprice open orders.
-- trg_product_first_price_history / ensure_product_first_price_history()
-- also remain unchanged: it only seeds when NO row exists, so combined with
-- the idempotent setters no duplicate-active rows can be created anymore.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. STRUCTURAL GUARANTEE — UNIQUE partial index: one active row per product.
--    Replaces the old NON-unique helper indexes (same definition).
-- ═══════════════════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS public.selling_price_history_active_idx;
CREATE UNIQUE INDEX IF NOT EXISTS selling_price_history_active_uniq
  ON public.selling_price_history (product_id)
 WHERE is_active = true;

DROP INDEX IF EXISTS public.supplier_price_history_active_idx;
CREATE UNIQUE INDEX IF NOT EXISTS supplier_price_history_active_uniq
  ON public.supplier_price_history (product_id)
 WHERE is_active = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run in the SQL editor afterwards; see chat deliverable)
--   1. SELECT * FROM pvs_verify_senangin(); -- senang active rows (exp 1 each)
--
-- ═══════════════════════════════════════════════════════════════════════════