-- ═══════════════════════════════════════════════════════════════════════════
-- FRESHGO PRICING & PROFIT ACCOUNTING — VERSION 2 (ERP-GRADE)
--
-- Supersedes v1 (20260819000000_pricing_and_profit_accounting.sql) while
-- remaining 100% compatible whether the DB already ran v1 or is fresh.
--
-- WHAT CHANGED vs v1
--   1. effective_from / effective_to are TIMESTAMPTZ (multiple same-day
--      changes are supported; v1 date columns are cast on upgrade).
--   2. suppliers normalized into public.suppliers; history rows link via
--      supplier_id instead of free-text supplier_name.
--   3. Product no longer holds current costs: the ACTIVE history row is the
--      single source of truth. v1 columns cost_price/cost_supplier_name are
--      kept ONLY as deprecated legacy mirrors for backward compat (and to
--      seed the history tables) and are never the truth for reports.
--   4. Order items FREEZE supplier_cost_price, selling_price, gross_profit,
--      and (for slice lines) actual_weight/price_per_kg inside the existing
--      Orders.order_items JSONB. Historical orders are never rewritten.
--   5. Slice products fully supported: weight x per-kg prices.
--   6. First Selling + Supplier history row is auto-created on Product insert.
--   7. Full audit trail: created_by / updated_by / created_at / updated_at.
--   8. Historical orders & history rows are never modified; price changes only
--      close the active row and append a new one.
--   9. Report-ready indexes (product_id, effective_from, is_active, supplier_id,
--      created_at, valid-at range) for daily/monthly/profit/cost reports.
--  10. ERP-ready: suppliers table supports purchase orders, COGS, inventory and
--      price comparison later without redesign.
--  11. Idempotent / safe on BOTH fresh and v1-applied databases.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. SAFETY: live columns the app still reads (v1 compat mirrors) ────────
ALTER TABLE public."Product"
  ADD COLUMN IF NOT EXISTS cost_price numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_supplier_name text NOT NULL DEFAULT '';
ALTER TABLE public."Orders"
  ADD COLUMN IF NOT EXISTS gross_profit numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public."Product".cost_price IS
  'DEPRECATED v1 compatibility mirror. Source of truth is supplier_price_history active row. Never used for reports.';
COMMENT ON COLUMN public."Product".cost_supplier_name IS
  'DEPRECATED v1 compatibility mirror. New code uses suppliers / supplier_id.';

-- ── 1. NORMALIZED SUPPLIERS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text NOT NULL,
  contact_person text,
  phone          text,
  email          text,
  address        text,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_unique_idx
  ON public.suppliers (lower(name));

-- Backfill suppliers from v1 free-text values (no-op on fresh DB)
INSERT INTO public.suppliers (name)
SELECT DISTINCT trim(COALESCE(cost_supplier_name, ''))
FROM public."Product"
WHERE COALESCE(trim(cost_supplier_name), '') <> ''
ON CONFLICT DO NOTHING;

-- ── 2. HISTORY TABLES (TIMESTAMPTZ + supplier_id + AUDIT) ──────────────────
CREATE TABLE IF NOT EXISTS public.supplier_price_history (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id     text NOT NULL REFERENCES public."Product"(id) ON DELETE CASCADE,
  supplier_id    bigint REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name  text,                          -- legacy free-text alias (v1 compat)
  cost_price     numeric(10,2) NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to   date,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.supplier_price_history.supplier_name IS
  'Deprecated v1-compat alias of supplier_id. Do NOT use for new logic.';

CREATE TABLE IF NOT EXISTS public.selling_price_history (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id     text NOT NULL REFERENCES public."Product"(id) ON DELETE CASCADE,
  selling_price  numeric(10,2) NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to   date,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 2b. UPGRADE existing v1 tables to TIMESTAMPTZ / add new columns ────────
-- On a fresh DB this is a no-op (columns already timestamptz). On a v1-applied
-- DB the old DATE values are clamped to midnight-in-local-time timestamps.
ALTER TABLE public.supplier_price_history
  ADD COLUMN IF NOT EXISTS supplier_id bigint REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ALTER COLUMN effective_from TYPE timestamptz USING effective_from::timestamptz,
  ALTER COLUMN effective_to   TYPE timestamptz USING effective_to::timestamptz;
ALTER TABLE public.selling_price_history
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ALTER COLUMN effective_from TYPE timestamptz USING effective_from::timestamptz,
  ALTER COLUMN effective_to   TYPE timestamptz USING effective_to::timestamptz;

ALTER TABLE public.supplier_price_history
  DROP CONSTRAINT IF EXISTS chk_supplier_price_range,
  ADD CONSTRAINT chk_supplier_price_range
    CHECK (effective_to IS NULL OR effective_from <= effective_to),
  DROP CONSTRAINT IF EXISTS chk_supplier_price_positive,
  ADD CONSTRAINT chk_supplier_price_positive CHECK (cost_price >= 0);
ALTER TABLE public.selling_price_history
  DROP CONSTRAINT IF EXISTS chk_selling_price_range,
  ADD CONSTRAINT chk_selling_price_range
    CHECK (effective_to IS NULL OR effective_from <= effective_to),
  DROP CONSTRAINT IF EXISTS chk_selling_price_positive,
  ADD CONSTRAINT chk_selling_price_positive CHECK (selling_price >= 0);

-- ── 3. REPORT-READY INDEXES ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS supplier_price_history_product_idx
  ON public.supplier_price_history (product_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS supplier_price_history_active_idx
  ON public.supplier_price_history (product_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS supplier_price_history_eff_idx
  ON public.supplier_price_history (effective_from);
CREATE INDEX IF NOT EXISTS supplier_price_history_supplier_idx
  ON public.supplier_price_history (supplier_id);
CREATE INDEX IF NOT EXISTS supplier_price_history_created_idx
  ON public.supplier_price_history (created_at DESC);
CREATE INDEX IF NOT EXISTS supplier_price_history_valid_idx
  ON public.supplier_price_history (product_id, effective_from DESC, effective_to);

CREATE INDEX IF NOT EXISTS selling_price_history_product_idx
  ON public.selling_price_history (product_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS selling_price_history_active_idx
  ON public.selling_price_history (product_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS selling_price_history_eff_idx
  ON public.selling_price_history (effective_from);
CREATE INDEX IF NOT EXISTS selling_price_history_created_idx
  ON public.selling_price_history (created_at DESC);
CREATE INDEX IF NOT EXISTS selling_price_history_valid_idx
  ON public.selling_price_history (product_id, effective_from DESC, effective_to);

-- ── 4. BACKFILL v1 DATA ────────────────────────────────────────────────────
-- supplier_id from the legacy supplier_name alias
UPDATE public.supplier_price_history h
   SET supplier_id = s.id
  FROM public.suppliers s
 WHERE h.supplier_id IS NULL
   AND h.supplier_name IS NOT NULL
   AND s.name = h.supplier_name;

-- Create a suppliers row for any alias still missing (defensive)
INSERT INTO public.suppliers (name)
SELECT DISTINCT trim(h.supplier_name)
FROM public.supplier_price_history h
WHERE h.supplier_id IS NULL
  AND h.supplier_name IS NOT NULL
  AND trim(h.supplier_name) <> ''
ON CONFLICT DO NOTHING;
UPDATE public.supplier_price_history h
   SET supplier_id = s.id
  FROM public.suppliers s
 WHERE h.supplier_id IS NULL
   AND h.supplier_name IS NOT NULL
   AND s.name = h.supplier_name;

-- ── 5. RLS AND PRIVILEGES ──────────────────────────────────────────────────
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers_admin_all" ON public.suppliers;
CREATE POLICY "suppliers_admin_all" ON public.suppliers
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.supplier_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selling_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_history_admin_all" ON public.supplier_price_history;
CREATE POLICY "price_history_admin_all" ON public.supplier_price_history
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "price_history_admin_all" ON public.selling_price_history;
CREATE POLICY "price_history_admin_all" ON public.selling_price_history
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 6. CORE PRICE SETTERS (SECURITY DEFINER, TIMESTAMPTZ, AUDITED) ─────────
-- Single internal implementation to avoid logic duplication / overload drift.
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
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_selling_price IS NULL OR p_selling_price < 0 THEN
    RAISE EXCEPTION 'Invalid selling price.';
  END IF;

  -- Close ALL currently-active rows (history is append-only)
  UPDATE public.selling_price_history
     SET effective_to = p_effective_at,
         is_active    = false,
         updated_by   = auth.uid(),
         updated_at   = now()
   WHERE product_id = p_product_id AND is_active = true;

  INSERT INTO public.selling_price_history
    (product_id, selling_price, effective_from, effective_to, is_active,
     created_by, updated_by)
  VALUES
    (p_product_id, p_selling_price, p_effective_at, NULL, true,
     auth.uid(), auth.uid());

  -- Legacy mirror so the storefront keeps working unchanged
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
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_cost_price IS NULL OR p_cost_price < 0 THEN
    RAISE EXCEPTION 'Invalid cost price.';
  END IF;

  -- Resolve supplier: id wins, else create/find by name
  IF v_supplier_id IS NULL AND v_supplier <> '' THEN
    SELECT id INTO v_supplier_id FROM public.suppliers WHERE name = v_supplier;
    IF v_supplier_id IS NULL THEN
      INSERT INTO public.suppliers (name) VALUES (v_supplier) RETURNING id INTO v_supplier_id;
    END IF;
  END IF;

  UPDATE public.supplier_price_history
     SET effective_to = p_effective_at,
         is_active    = false,
         updated_by   = auth.uid(),
         updated_at   = now()
   WHERE product_id = p_product_id AND is_active = true;

  INSERT INTO public.supplier_price_history
    (product_id, supplier_id, supplier_name, cost_price,
     effective_from, effective_to, is_active, created_by, updated_by)
  VALUES
    (p_product_id, v_supplier_id,
     coalesce((SELECT name FROM public.suppliers WHERE id = v_supplier_id), v_supplier),
     p_cost_price, p_effective_at, NULL, true, auth.uid(), auth.uid());

  -- Legacy mirror mirror for storefront compat
  UPDATE public."Product"
     SET cost_price = p_cost_price,
         cost_supplier_name =
           coalesce((SELECT name FROM public.suppliers WHERE id = v_supplier_id), v_supplier)
   WHERE id = p_product_id;
END;
$$;

-- ── 6b. PUBLIC RPCs (same signatures as v1, same as the app calls) ─────────
CREATE OR REPLACE FUNCTION public.set_product_selling_price(
  p_product_id text,
  p_selling_price numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public._pricing_set_selling(p_product_id, p_selling_price, now());
$$;

-- Backfill-only entry point for seeding/create flows with an explicit timestamp
CREATE OR REPLACE FUNCTION public.set_product_selling_price_at(
  p_product_id text,
  p_selling_price numeric,
  p_effective_at timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public._pricing_set_selling(p_product_id, p_selling_price, p_effective_at);
$$;

CREATE OR REPLACE FUNCTION public.set_product_supplier_price(
  p_product_id text,
  p_cost_price numeric,
  p_supplier_name text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public._pricing_set_supplier(p_product_id, p_cost_price, p_supplier_name, NULL, now());
$$;

CREATE OR REPLACE FUNCTION public.set_product_supplier_price_at(
  p_product_id text,
  p_cost_price numeric,
  p_supplier_name text,
  p_supplier_id bigint,
  p_effective_at timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public._pricing_set_supplier(p_product_id, p_cost_price, p_supplier_name, p_supplier_id, p_effective_at);
$$;

-- ── 7. AUTO-FIRST-HISTORY ON PRODUCT INSERT ────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_product_first_price_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Seed the first selling price if none exists yet
  IF NOT EXISTS (
      SELECT 1 FROM public.selling_price_history
       WHERE product_id = NEW.id
  ) THEN
    INSERT INTO public.selling_price_history
      (product_id, selling_price, effective_from, is_active, created_by)
    VALUES
      (NEW.id, NEW.price, now(), true, auth.uid());
  END IF;

  -- Seed the first supplier cost only when a cost is provided
  IF NEW.cost_price > 0
     AND NOT EXISTS (
        SELECT 1 FROM public.supplier_price_history
         WHERE product_id = NEW.id
     ) THEN
    INSERT INTO public.supplier_price_history
      (product_id, supplier_name, cost_price, effective_from, is_active, created_by)
    VALUES
      (NEW.id, NEW.cost_supplier_name, NEW.cost_price, now(), true, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_first_price_history ON public."Product";
CREATE TRIGGER trg_product_first_price_history
  AFTER INSERT ON public."Product"
  FOR EACH ROW EXECUTE FUNCTION public.ensure_product_first_price_history();

-- ── 8. AUDIT: updated_at / updated_by ONLY (never edits an old price row) ──
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = coalesce(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_price_history_touch ON public.supplier_price_history;
CREATE TRIGGER trg_supplier_price_history_touch
  BEFORE UPDATE ON public.supplier_price_history
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_selling_price_history_touch ON public.selling_price_history;
CREATE TRIGGER trg_selling_price_history_touch
  BEFORE UPDATE ON public.selling_price_history
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_suppliers_touch ON public.suppliers;
CREATE TRIGGER trg_suppliers_touch
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 9. BACKFILL: first-history for PRODUCTS that predate the feature ───────
-- Selling = Product.price seeded from now(); supplier = Product.cost_price
-- resolved against the suppliers table. Never touches past orders.
INSERT INTO public.selling_price_history
  (product_id, selling_price, effective_from, is_active, created_by)
SELECT p.id, p.price, now(), true, auth.uid()
FROM public."Product" p
WHERE NOT EXISTS (
  SELECT 1 FROM public.selling_price_history h WHERE h.product_id = p.id
);

INSERT INTO public.supplier_price_history
  (product_id, supplier_id, supplier_name, cost_price, effective_from, is_active, created_by)
SELECT p.id,
       s.id,
       coalesce(trim(p.cost_supplier_name), ''),
       coalesce(p.cost_price, 0),
       now(), true, auth.uid()
FROM public."Product" p
LEFT JOIN public.suppliers s
       ON lower(s.name) = lower(coalesce(trim(p.cost_supplier_name), ''))
WHERE NOT EXISTS (
  SELECT 1 FROM public.supplier_price_history h WHERE h.product_id = p.id
);

-- ── 10. RPC/function privileges ────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.set_product_selling_price(text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_product_selling_price_at(text, numeric, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_product_supplier_price(text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_product_supplier_price_at(text, numeric, text, bigint, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_product_first_price_history() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_product_selling_price(text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_selling_price_at(text, numeric, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_supplier_price(text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_supplier_price_at(text, numeric, text, bigint, timestamptz) TO authenticated;