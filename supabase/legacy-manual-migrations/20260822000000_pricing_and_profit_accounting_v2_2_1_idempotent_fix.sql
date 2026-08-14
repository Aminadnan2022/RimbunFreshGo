-- ═══════════════════════════════════════════════════════════════════════════
-- FRESHGO PRICING & PROFIT ACCOUNTING — VERSION 2.2.1 (SAFE IDEMPOTENCY FIX)
--
-- Supersedes: 20260822000000_pricing_and_profit_accounting_v2_2_idempotent_fix.sql
--       Runs after V2 (20260820000000) and V2.1 (20260821000000).
--       This file is self-contained and safe whether or not V2.2 was already run.
--
-- 1. KEEPS  : public."Product", selling_price_history, supplier_price_history,
--             trg_product_first_price_history &
--             ensure_product_first_price_history() (unchanged, MUST stay),
--             all four public RPC wrappers, _pricing_set_* names + signatures,
--             reprice_open_orders_for_product(), legacy mirror Product.price /
--             cost_price / cost_supplier_name. Nothing is dropped or recreated.
--
-- 2. IMPROVES (goal: tolerates previous seed expected duplicates, no guessing):
--    * SAFE duplicate cleanup — only closes ACTIVE rows that are
--      DEMONSTRABLY identical duplicates (same product + same price/cost +
--      same supplier for supplier history), keeping the earliest row.
--      Legitimate consecutive active prices (RM35 + RM37) stay untouched —
--      the migration NEVER guesses which of two DIFFERENT rows is correct.
--    * IDEMPOTENT _pricing_set_selling / _pricing_set_supplier — no new
--      history row when nothing changed; numeric-safe comparisons; supplier
--      identity uses supplier_id when present, else supplier_name.
--    * CONCURRENCY — per-product advisory xact-lock around check+write so two
--      parallel RM37->RM39 requests can never leave two active rows.
--    * UNIQUE partial indexes only created when data is provably clean.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SAFE SELLING-PRICE DEDUP (idempotent; only identical ACTIVE rows)
--    Duplicate definition: same product_id, same selling_price, both active.
--    Keep the LOWEST id (earliest preserved), close the redundant later ones.
--    Rows with DIFFERENT prices (RM35 active + RM37 active) are NEVER touched.
-- ═══════════════════════════════════════════════════════════════════════════
WITH selling_dup AS (
  SELECT product_id, selling_price, MIN(id) AS keep_id
    FROM public.selling_price_history
   WHERE is_active = true
   GROUP BY product_id, selling_price
  HAVING COUNT(*) > 1
)
UPDATE public.selling_price_history h
   SET is_active    = false,
       effective_to = h.effective_from,          -- collapse the redundant row
       updated_at   = now()
  FROM selling_dup d
 WHERE h.product_id      = d.product_id
   AND h.selling_price   = d.selling_price
   AND h.is_active       = true
   AND h.id             <> d.keep_id;  -- close every redundant duplicate, keep the earliest

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. SAFE SUPPLIER-PRICE DEDUP
--    duplicate: same product_id, same supplier identity, same cost_price,
--               is_active. supplier_id is preferred (falls back to name).
--    Different suppliers or different cost rows are NEVER auto-closed.
-- ═══════════════════════════════════════════════════════════════════════════
WITH supplier_canon AS (
  SELECT h.id, h.product_id, h.cost_price,
         lower(coalesce(
             (SELECT s.name FROM public.suppliers s WHERE s.id = h.supplier_id),
             coalesce(h.supplier_name,''), '')) AS canon
  FROM public.supplier_price_history h
 WHERE h.is_active = true
),
supplier_dup AS (
  SELECT product_id, cost_price, canon, MIN(id) AS first_id
  FROM supplier_canon
 GROUP BY product_id, cost_price, canon
HAVING COUNT(*) > 1
)
UPDATE public.supplier_price_history h
   SET is_active    = false,
       effective_to = h.effective_from,
       updated_at   = now()
  FROM supplier_dup d, supplier_canon c
 WHERE h.id             = c.id
   AND c.id            <> d.first_id
   AND c.product_id     = d.product_id
   AND c.cost_price     = d.cost_price
   AND c.canon          = d.canon
   AND h.is_active      = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. HARDENED INTERNAL PRICE SETTER — SELLING
--    Signature UNCHANGED from V2/V2.1. Idempotent + advisory-locked.
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
  v_eff timestamptz := COALESCE(p_effective_at, now());
  v_same boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_product_id IS NULL OR btrim(p_product_id) = '' THEN
    RAISE EXCEPTION 'Invalid product id.';
  END IF;
  IF p_selling_price IS NULL OR p_selling_price < 0 THEN
    RAISE EXCEPTION 'Invalid selling price.';
  END IF;

  -- Serialise concurrent edits for the same product (release at xact end).
  PERFORM pg_advisory_xact_lock(hashtext('selling_price:' || p_product_id));

  -- IDEMPOTENT NO-OP: an ACTIVE row already holds this numeric price.
  SELECT EXISTS (
    SELECT 1 FROM public.selling_price_history
     WHERE product_id    = p_product_id
       AND is_active     = true
       AND selling_price = p_selling_price
  ) INTO v_same;

  IF v_same THEN
    -- Sync legacy mirror only; history untouched.
    UPDATE public."Product"
       SET price = p_selling_price
     WHERE id = p_product_id;
    RETURN;
  END IF;

  -- Real change: close every currently active row, insert exactly ONE new one.
  UPDATE public.selling_price_history
     SET effective_to = v_eff,
         is_active    = false,
         updated_by   = auth.uid(),
         updated_at   = now()
   WHERE product_id   = p_product_id
     AND is_active    = true;

  INSERT INTO public.selling_price_history
    (product_id, selling_price, effective_from, effective_to, is_active,
     created_by, updated_by)
  VALUES
    (p_product_id, p_selling_price, v_eff, NULL, true, auth.uid(), auth.uid());

  UPDATE public."Product"
     SET price = p_selling_price
   WHERE id = p_product_id;

  -- Note: reprice_open_orders_for_product() is invoked by the public wrapper
  -- (V2.1), not here, to keep a single repricing call site. It only ever
  -- re-stamps NOT-Paid orders; paid/completed transactions stay frozen.
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. HARDENED INTERNAL PRICE SETTER — SUPPLIER
--    Signature identical to v2 (`p_supplier_id` bigint). Idempotent:
--    supplier+$ and cost_price must BOTH be unchanged to no-op.
-- ═══════════════════════════════════════════════════════════════════════════
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

  PERFORM pg_advisory_xact_lock(hashtext('supplier_price:' || p_product_id));

  -- Resolve supplier: explicit id wins, else find-or-create by canonical name.
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

  -- IDEMPOTENT NO-OP: an ACTIVE row has the same supplier identity AND cost.
  SELECT EXISTS (
    SELECT 1
      FROM public.supplier_price_history h,
        LATERAL (SELECT lower(coalesce(
                      (SELECT s2.name FROM public.suppliers s2 WHERE s2.id = h.supplier_id),
                      coalesce(h.supplier_name,''), '')) AS canon) a
     WHERE h.product_id  = p_product_id
       AND h.is_active   = true
       AND h.cost_price  = p_cost_price
       AND a.canon       = v_canon_new
  ) INTO v_same;

  IF v_same THEN
    UPDATE public."Product"
       SET cost_price         = p_cost_price,
           cost_supplier_name =
             coalesce((SELECT s3.name FROM public.suppliers s3 WHERE s3.id = v_supplier_id),
                      v_supplier)
     WHERE id = p_product_id;
    RETURN;
  END IF;

  -- Real change
  UPDATE public.supplier_price_history
     SET effective_to = v_eff,
         is_active    = false,
         updated_by   = auth.uid(),
         updated_at   = now()
   WHERE product_id   = p_product_id
     AND is_active = true;

  INSERT INTO public.supplier_price_history
    (product_id, supplier_id, supplier_name, cost_price,
     effective_from, effective_to, is_active, created_by, updated_by)
  VALUES
    (p_product_id, v_supplier_id,
     coalesce((SELECT s4.name FROM public.suppliers s4 WHERE s4.id = v_supplier_id),
              v_supplier),
     p_cost_price, v_eff, NULL, true, auth.uid(), auth.uid());

  UPDATE public."Product"
     SET cost_price         = p_cost_price,
         cost_supplier_name =
           coalesce((SELECT s5.name FROM public.suppliers s5 WHERE s5.id = v_supplier_id),
                    v_supplier)
   WHERE id = p_product_id;

  -- Same note as selling: open-order repricing happens in the public wrapper
  -- (V2.1); paid/cancelled orders are never touched.
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. UNIQUE-ACTIVE GUARANTEE — only created when existing data is clean.
--    Replaces the two ORIGINAL helper (non-unique) indexes.
--    One active selling row and one active supplier row per product.
--    If there are still non-duplicate multi-active rows that we deliberately
--    did NOT guess on, we keep lookup speed but do NOT create a failing index.
-- ═══════════════════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS public.selling_price_history_active_idx;
DROP INDEX IF EXISTS public.supplier_price_history_active_idx;

DO $$
DECLARE
  n_sell  bigint;
  n_supp  bigint;
BEGIN
  SELECT count(*) INTO n_sell FROM (
    SELECT product_id FROM public.selling_price_history
     WHERE is_active = true
     GROUP BY product_id HAVING count(*) > 1
  ) d;

  SELECT count(*) INTO n_supp FROM (
    SELECT product_id FROM public.supplier_price_history
     WHERE is_active = true
     GROUP BY product_id HAVING count(*) > 1
  ) d;

  IF n_sell = 0 AND n_supp = 0 THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS selling_price_history_active_uniq
             ON public.selling_price_history (product_id) WHERE is_active = true';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS supplier_price_history_active_uniq
             ON public.supplier_price_history (product_id) WHERE is_active = true';
    RAISE NOTICE 'V2.2.1: created UNIQUE active indexes (0 residual products).';
  ELSE
    -- Multi-active rows differ in price/cost/supplier ⇒ we refuse to guess.
    -- Keep the old fast-path indexes; admin must resolve before hardening.
    EXECUTE 'CREATE INDEX IF NOT EXISTS selling_price_history_active_idx
             ON public.selling_price_history (product_id) WHERE is_active = true';
    EXECUTE 'CREATE INDEX IF NOT EXISTS supplier_price_history_active_idx
             ON public.supplier_price_history (product_id) WHERE is_active = true';
    RAISE WARNING 'V2.2.1: % selling & % supplier products still have multiple ACTIVE but DIFFERENT rows; UNIQUE index skipped on purpose. Inspect validation queries A/B.', n_sell, n_supp;
  END IF;
END
$$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. VALIDATION QUERIES  (run these manually after the migration)
-- ═══════════════════════════════════════════════════════════════════════════

-- A. No product may have >1 ACTIVE selling row  (expected: 0 rows)
SELECT product_id, COUNT(*)
FROM public.selling_price_history
WHERE is_active = true
GROUP BY product_id
HAVING COUNT(*) > 1;

-- B. No product may have >1 ACTIVE supplier-cost row  (architecture default)
SELECT product_id, COUNT(*)
FROM public.supplier_price_history
WHERE is_active = true
GROUP BY product_id
HAVING COUNT(*) > 1;

-- C. Senangin: selling history detail (no duplicate RM37 active)
SELECT id, product_id, selling_price,
       effective_from, effective_to, is_active, created_at, updated_at
FROM public.selling_price_history
WHERE product_id = 'senangin'
ORDER BY id;

-- D. Senangin: supplier history detail (no duplicate Shah RM35 active)
SELECT id, product_id, supplier_id, supplier_name, cost_price,
       effective_from, effective_to, is_active, created_at, updated_at
FROM public.supplier_price_history
WHERE product_id = 'senangin'
ORDER BY id;

-- E. Diagnostic: EXACT duplicate rows across ALL history (active + closed)
--    Selling duplicates (same product, price, active-state).
SELECT product_id, selling_price, is_active,
       count(*) AS dup_count, array_agg(id ORDER BY id) AS ids
FROM public.selling_price_history
GROUP BY product_id, selling_price, is_active
HAVING COUNT(*) > 1
ORDER BY product_id, selling_price;

--    Supplier duplicates by supplier-identity + cost + active-state.
SELECT product_id, cost_price, is_active,
       lower(coalesce((SELECT s.name FROM public.suppliers s WHERE s.id=h.supplier_id),
                      coalesce(h.supplier_name,''))) AS supplier_canon,
       count(*) AS dup_count, array_agg(h.id ORDER BY h.id) AS ids
FROM public.supplier_price_history h
GROUP BY product_id, cost_price, is_active,
         lower(coalesce((SELECT s.name FROM public.suppliers s WHERE s.id=h.supplier_id),
                        coalesce(h.supplier_name,'')))
HAVING COUNT(*) > 1
ORDER BY product_id;

-- F. Unique-active indexes exist (expect 2 rows, indexdef contains "UNIQUE")
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('selling_price_history', 'supplier_price_history')
  AND indexname LIKE '%active_uniq%';

-- G. Required functions exist with expected signatures.
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS signature,
       pg_get_function_result(p.oid)             AS result
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
        '_pricing_set_selling', '_pricing_set_supplier',
        'set_product_selling_price', 'set_product_selling_price_at',
        'set_product_supplier_price', 'set_product_supplier_price_at',
        'ensure_product_first_price_history', 'reprice_open_orders_for_product')
ORDER BY p.proname, 2;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. TEST SCENARIOS  (run SEPARATELY in the Supabase SQL Editor — live DB)
--    Wrap in BEGIN/ROLLBACK if you want to verify without committing.
--    Expect count deltas as labelled below.
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT count(*) FROM public.selling_price_history WHERE product_id='senangin' AND is_active;
-- -- TEST1: same price, no row added  → call once, count STAYS at 1
-- SELECT set_product_selling_price('senangin', 37);
-- SELECT count(*) FROM public.selling_price_history WHERE product_id='senangin' AND is_active;
--; -- expect 1
-- TEST2: same supplier+cost, no row  → 1
-- SELECT set_product_supplier_price('senangin', 35, 'Shah');
-- SELECT count(*) FROM public.supplier_price_history WHERE product_id='senangin' AND is_active;
--; -- expect 1
-- TEST3: RM37 → RM39 (one new active selling row; the old one is closed)
-- SELECT set_product_selling_price('senangin', 39);
-- SELECT product_id, selling_price, is_active FROM public.selling_price_history WHERE product_id='senangin' ORDER BY id;
-- TEST4: RM39 → RM39, no extra row  → still 1
-- SELECT set_product_selling_price('senangin', 39);
-- TEST5: Shah RM35 → Shah RM36  → 1 supplier history line
-- SELECT set_product_supplier_price('senangin', 36, 'Shah');
-- SELECT product_id, cost_price, supplier_name, is_active FROM public.supplier_price_history WHERE product_id='senangin' ORDER BY id;
-- TEST6: Shah RM36 → Shah RM36, no extra row
-- SELECT set_product_supplier_price('senangin', 36, 'Shah');

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF V2.2.1  — no tables, orders, history, functions or triggers destroyed.
-- ═══════════════════════════════════════════════════════════════════════════