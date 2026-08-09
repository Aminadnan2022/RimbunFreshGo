-- ═══════════════════════════════════════════════════════════════════════════
-- FRESHGO PRICING & PROFIT ACCOUNTING — FINAL HARDENING PATCH V2.2.2
--
-- Supersedes: 20260822000000_pricing_and_profit_accounting_v2_2_1_idempotent_fix.sql
--       Runs after V2 (20260820000000) and V2.1 (20260821000000).
--       Compatible whether or not V2.2 / V2.2.1 were already applied.
--
-- SCOPE (ONLY)
--   · pricing history integrity        (duplicate / conflict elimination)
--   · idempotent price setters         (_pricing_set_selling / _supplier)
--   · unique active-price protection   (partial unique indexes)
--   · concurrency safety               (per-product advisory xact locks)
--
-- OUT OF SCOPE (deliberately untouched):
--   Orders / order-items / checkout / supplier workflow / customer workflow /
--   Reports / views / materialized view / Product initial-price trigger /
--   public RPC wrappers (they already call _pricing_* + reprice_open_orders).
--   Historical completed / paid / delivered orders are NEVER modified.
--
-- FINAL SAFETY RULE: NEVER guess between two DIFFERENT active rows for the same
-- product. If such a state is detected the migration RAISES EXCEPTION inside an
-- explicit transaction, so nothing is partially applied and nothing is
-- silently destroyed. The operator resolves the conflict and re-runs.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — CONFLICT DETECTION (fail safe BEFORE any data change)
--   Selling : a product with MULTIPLE active rows carrying DIFFERENT prices is
--             NOT a duplicate problem — it is ambiguous real data. STOP.
--   Supplier: a product with MULTIPLE active rows of DIFFERENT supplier/cost is
--             ambiguous real data → STOP.
--   Only rows with IDENTICAL content are allowed to be auto-merged (Step 2).
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_sell_cnt  bigint;
  v_sell_list text;
  v_supp_cnt  bigint;
  v_supp_list text;
BEGIN
  SELECT count(*), coalesce(string_agg(product_id, ', ' ORDER BY product_id), '')
    INTO v_sell_cnt, v_sell_list
    FROM (
      SELECT product_id
        FROM public.selling_price_history
       WHERE is_active = true
       GROUP BY product_id
      HAVING count(*) > 1 AND count(DISTINCT selling_price) > 1
    ) d;

  WITH sup AS (
    SELECT h.product_id, h.cost_price,
           lower(coalesce(s.name, h.supplier_name, '')) AS canon
      FROM public.supplier_price_history h
      LEFT JOIN public.suppliers s ON s.id = h.supplier_id
     WHERE h.is_active = true
  )
  SELECT count(*), coalesce(string_agg(product_id, ', ' ORDER BY product_id), '')
    INTO v_supp_cnt, v_supp_list
    FROM (
      SELECT product_id FROM sup
       GROUP BY product_id
      HAVING count(*) > 1 AND count(DISTINCT (canon, cost_price)) > 1
    ) d;

  IF v_sell_cnt > 0 THEN
    RAISE EXCEPTION 'ABORTED (V2.2.2): % product(s) have MULTIPLE DIFFERENT ACTIVE selling prices: %. Resolve manually, then re-run.', v_sell_cnt, v_sell_list;
  END IF;
  IF v_supp_cnt > 0 THEN
    RAISE EXCEPTION 'ABORTED (V2.2.2): % product(s) have MULTIPLE DIFFERENT ACTIVE supplier/cost rows: %. Resolve manually, then re-run.', v_supp_cnt, v_supp_list;
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — DEDUPLICATION (only DEMONSTRABLY IDENTICAL active rows)
--   Selling : group ACTIVE by (product_id, selling_price); within a group keep
--             the earliest (MIN id), close the redundant later duplicates.
--   Supplier: group ACTIVE by (product_id, cost_price, canonical supplier);
--             canonical = lower(suppliers.name) via supplier_id, else
--             lower(supplier_name). Keep MIN(id), close the duplicates.
--   Closed duplicates: is_active=false, effective_to = own effective_from
--   (empty-window, satisfies CHECK effective_from <= effective_to), trigger
--   trg_*_touch updates updated_at/updated_by. Nothing is deleted.
-- ═══════════════════════════════════════════════════════════════════════════
WITH selling_keep AS (
  SELECT product_id, selling_price, MIN(id) AS keep_id
    FROM public.selling_price_history
   WHERE is_active = true
   GROUP BY product_id, selling_price
  HAVING COUNT(*) > 1
)
UPDATE public.selling_price_history h
   SET is_active    = false,
       effective_to = h.effective_from,      -- collapse redundant row
       updated_at   = now()
  FROM selling_keep k
 WHERE h.product_id    = k.product_id
   AND h.selling_price = k.selling_price
   AND h.is_active     = true
   AND h.id           <> k.keep_id;

WITH sup_canon AS (
  SELECT h.id, h.product_id, h.cost_price,
         lower(coalesce(s.name, h.supplier_name, '')) AS canon
    FROM public.supplier_price_history h
    LEFT JOIN public.suppliers s ON s.id = h.supplier_id
   WHERE h.is_active = true
),
sup_keep AS (
  SELECT product_id, cost_price, canon, MIN(id) AS keep_id
    FROM sup_canon
   GROUP BY product_id, cost_price, canon
  HAVING COUNT(*) > 1
)
UPDATE public.supplier_price_history h
   SET is_active    = false,
       effective_to = h.effective_from,
       updated_at   = now()
  FROM sup_canon sc, sup_keep k
 WHERE h.id           = sc.id
   AND sc.id         <> k.keep_id
   AND sc.product_id  = k.product_id
   AND sc.cost_price  = k.cost_price
   AND sc.canon       = k.canon
   AND h.is_active    = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 — POST-CLEANUP VERIFICATION
--   After the merge, NO product may have >1 ACTIVE row of ANY kind. If this
--   fails (previous gate passed but something unexpected remains), abort.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  n_sell bigint;
  n_supp bigint;
BEGIN
  SELECT count(*) INTO n_sell FROM (
    SELECT product_id FROM public.selling_price_history
     WHERE is_active = true GROUP BY product_id HAVING count(*) > 1
  ) d;
  SELECT count(*) INTO n_supp FROM (
    SELECT product_id FROM public.supplier_price_history
     WHERE is_active = true GROUP BY product_id HAVING count(*) > 1
  ) d;
  IF n_sell > 0 OR n_supp > 0 THEN
    RAISE EXCEPTION 'ABORTED (V2.2.2): % selling / % supplier products still have >1 ACTIVE row after cleanup. Manual review required.', n_sell, n_supp;
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 — UNIQUE-ACTIVE PER PRODUCT (only after data is provably clean)
--   Presence pre-check: `CREATE UNIQUE INDEX IF NOT EXISTS` keys on the index
--   NAME; the legacy NON-UNIQUE helper indexes from V2 (same column plan) are
--   dropped first so we never keep two overlapping definitions. A UNIQUE index
--   that already exists under one of these names is left alone (re-runnable).
--   Any OTHER unique index already enforcing "one active per product" is
--   preserved; no index with a conflicting name is created blindly.
-- ═══════════════════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS public.selling_price_history_active_idx;
DROP INDEX IF EXISTS public.supplier_price_history_active_idx;

CREATE UNIQUE INDEX IF NOT EXISTS selling_price_history_active_uniq
  ON public.selling_price_history (product_id) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS supplier_price_history_active_uniq
  ON public.supplier_price_history (product_id) WHERE is_active = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 5 — HARDENED INTERNAL PRICE SETTERS   (signatures UNCHANGED)
--   _pricing_set_selling  (text, numeric, timestamptz)
--   _pricing_set_supplier (text, numeric, text, bigint, timestamptz)
--   SECURITY DEFINER, explicit search_path, is_admin gate, product gate,
--   advisory per-product lock (selling/supplier tags do NOT collide because
--   the key prefix differs), idempotent no-op, close→insert semantics that
--   never produce duplicate active rows. Auth: admin only.
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
  v_eff  timestamptz := COALESCE(p_effective_at, now());
  v_same boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_product_id IS NULL OR btrim(p_product_id) = '' THEN
    RAISE EXCEPTION 'Invalid product id.';
  END IF;
  IF p_selling_price IS NULL OR p_selling_price < 0 THEN
    RAISE EXCEPTION 'Invalid selling price.';
  END IF;

  -- Deterministic per-product lock; released at transaction end.
  PERFORM pg_advisory_xact_lock(hashtext('sell_price_v2_2_2:' || p_product_id));

  -- Idempotent NO-OP: an ACTIVE row already holds this numeric price.
  SELECT EXISTS (
    SELECT 1 FROM public.selling_price_history
     WHERE product_id    = p_product_id
       AND is_active     = true
       AND selling_price = p_selling_price
  ) INTO v_same;
  IF v_same THEN
    -- Only mirror sync; history row stays as-is (no close, no insert).
    UPDATE public."Product" SET price = p_selling_price WHERE id = p_product_id;
    RETURN;
  END IF;

  -- Real price change: close the current active row, insert exactly ONE new.
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

  UPDATE public."Product" SET price = p_selling_price WHERE id = p_product_id;

  -- Note: open-order repricing is owned by the public wrapper set_product_*()
  -- (one call site), which skips Paid/completed/delivered orders.
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

  -- Serialise per-product; distinct prefix ⇒ no collision with selling lock.
  PERFORM pg_advisory_xact_lock(hashtext('supplier:v2_2_2:' || p_product_id));

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

  -- IDEMPOTENT NOOP: unchanged = identical supplier identity AND identical cost.
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
    UPDATE public."Product" SET cost_price = p_cost_price,
           cost_supplier_name = coalesce((SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id), v_supplier)
     WHERE id = p_product_id;
    RETURN;
  END IF;

  -- Real change: close active row, append exactly ONE new one.
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

  -- Wrapper reprice (V2.1) handles open-order re-stamp; Paid orders locked.
END;
$$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VALIDATION QUERIES (run separately; read-only, expected outputs noted)
-- ═══════════════════════════════════════════════════════════════════════════

-- A. Identical-active selling duplicates               → ZERO rows
SELECT product_id, selling_price, COUNT(*) AS active_count
FROM public.selling_price_history
WHERE is_active = true
GROUP BY product_id, selling_price
HAVING COUNT(*) > 1;

-- B. MULTIPLE / DIFFERENT active selling prices/product  → ZERO rows
SELECT product_id, COUNT(*) AS active_count,
       array_agg(id ORDER BY id) AS ids,
       array_agg(selling_price ORDER BY id) AS prices
FROM public.selling_price_history
WHERE is_active = true
GROUP BY product_id
HAVING COUNT(*) > 1;

-- C. Identical ACTIVE supplier duplicates               → ZERO rows
SELECT product_id, cost_price,
       lower(coalesce(s.name, h.supplier_name, '')) AS supplier_canon,
       COUNT(*) AS active_count
FROM public.supplier_price_history h
LEFT JOIN public.suppliers s ON s.id = h.supplier_id
WHERE h.is_active = true
GROUP BY product_id, cost_price, lower(coalesce(s.name, h.supplier_name, ''))
HAVING COUNT(*) > 1;

-- D. MULTIPLE / DIFFERENT active supplier rows          → ZERO rows
SELECT product_id, COUNT(*) AS active_count,
       array_agg(id ORDER BY id) AS ids,
       array_agg(cost_price ORDER BY id) AS costs
FROM public.supplier_price_history
WHERE is_active = true
GROUP BY product_id
HAVING COUNT(*) > 1;

-- E. Senangin selling history  (expect ONE active RM37, no duplicate)
SELECT id, product_id, selling_price, effective_from, effective_to,
       is_active, created_at, updated_at
FROM public.selling_price_history
WHERE product_id = 'senangin'
ORDER BY id;

-- F. Senangin supplier history  (expect ONE active Shah RM35, no duplicate)
SELECT id, product_id, supplier_id, supplier_name, cost_price,
       effective_from, effective_to, is_active, created_at, updated_at
FROM public.supplier_price_history
WHERE product_id = 'senangin'
ORDER BY id;

-- G. Verify unique partial indexes exist (expect BOTH "active_uniq")
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  IN ('selling_price_history', 'supplier_price_history')
  AND indexname  LIKE '%_active_uniq%';

-- H. Verify pricing functions exist with correct signatures
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

-- I. Verify the Product initial-price trigger exists exactly once
SELECT count(*) AS trigger_count, array_agg(tgname) AS trigger_names
FROM pg_trigger
WHERE tgrelid = 'public."Product"'::regclass
  AND tgname = 'trg_product_first_price_history'
  AND NOT tgisinternal;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEST SCENARIOS (run SEPARATELY in Supabase SQL Editor — NOT inside a
-- production migration). Wrap each in BEGIN/ROLLBACK to side the prints, or
-- keep them to reproduce lasting changes. Assumes 'senangin' exists.
-- ═══════════════════════════════════════════════════════════════════════════
-- TEST1: same selling price (RM37->RM37) → no new row, unchanged count
--   SELECT set_product_selling_price('senangin', 37);
--   SELECT count(*) FROM public.selling_price_history WHERE product_id='senangin' AND is_active; -- expect unchanged
-- TEST2: same supplier+cost (Shah RM35->Shah RM35) → unchanged
--   SELECT set_product_supplier_price('senangin', 35, 'Shah');
--   SELECT count(*) FROM public.supplier_price_history WHERE product_id='senangin' AND is_active; -- expect unchanged
-- TEST3: RM37 -> RM39 → exactly ONE new active selling row
--   SELECT set_product_selling_price('senangin', 39);
-- TEST4: RM39 -> RM39 → no additional row
--   SELECT set_product_selling_price('senangin', 39);
-- TEST5: Shah RM35 -> Shah RM36 → ONE new active supplier row
--   SELECT set_product_supplier_price('senangin', 36, 'Shah');
-- TEST6: Shah RM36 -> Shah RM36 → no additional row
--   SELECT set_product_supplier_price('senangin', 36, 'Shah');
-- TEST7: brand-new product (trigger + setters) → exactly 1 selling + 1 supplier row
--   INSERT INTO public."Product" (id, price, cost_price, cost_supplier_name) VALUES ('probe_test7', 20, 15, 'Shah') ON CONFLICT DO NOTHING;
--   SELECT set_product_selling_price('probe_test7', 20);
--   SELECT set_product_supplier_price('probe_test7', 15, 'Shah');
--   SELECT count(*) FROM public.selling_price_history WHERE product_id='probe_test7' AND is_active;  -- expect 1
--   SELECT count(*) FROM public.supplier_price_history WHERE product_id='probe_test7' AND is_active; -- expect 1

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF V2.2.2 — everything outside this file is left untouched.
-- ═══════════════════════════════════════════════════════════════════════════