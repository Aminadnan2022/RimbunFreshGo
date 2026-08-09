/*
# Historical Business Daily (April–July 2026 pre-platform totals)

## Summary
Stores the pre-Orders-database daily business totals (orders, revenue,
supplier cost, delivery income, gross profit per day) so the Business Reports
page can show continuous April→today data. This table is additive to the
Reports and NEVER feeds checkout / pricing / dispatch.

## Why a separate table
- No fake Orders / customers / products / suppliers are created.
- Existing `Orders`, price-history and reporting tables are untouched.
- `business_date` is UNIQUE: re-running this migration is a no-op for
  existing rows (`INSERT ... ON CONFLICT (business_date) DO NOTHING`), so
  admin edits made later are never overwritten.

## Reconciliation
April = 58 / RM3,481.80 / RM3,011.00 / RM470.80
May   = 49 / RM2,642.00 / RM2,332.00 / RM310.00
June  = 62 / RM3,490.11 / RM3,139.00 / RM351.11
July  = 83 / RM5,151.95 / RM4,226.00 / RM209.00 delivery / RM716.95
(July revenue/cost differ from the earlier quoted monthly rollup; the daily
rows supplied by the business owner are authoritative and imported verbatim.
Orders, delivery income and gross profit all match the quoted July totals.)

## Security
RLS enabled; every policy reuses `public.is_admin()` (defined in
20260717152333_create_user_roles_and_admin_rls.sql). No duplicate admin helper.

## Idempotency
- CREATE TABLE / TRIGGER / POLICIES all use IF NOT EXISTS / DROP IF EXISTS.
- Seed uses ON CONFLICT (business_date) DO NOTHING.
*/

-- ── 1. TABLE ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.historical_business_daily (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_date date NOT NULL UNIQUE,
  order_count integer NOT NULL DEFAULT 0 CHECK (order_count >= 0),
  revenue_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (revenue_amount >= 0),
  supplier_cost_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (supplier_cost_amount >= 0),
  delivery_income_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (delivery_income_amount >= 0),
  gross_profit_amount numeric(12, 2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'historical_import',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.historical_business_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historical_daily_admin_select" ON public.historical_business_daily;
CREATE POLICY "historical_daily_admin_select" ON public.historical_business_daily
  FOR SELECT TO authenticated USING (public.is_admin() = true);

DROP POLICY IF EXISTS "historical_daily_admin_insert" ON public.historical_business_daily;
CREATE POLICY "historical_daily_admin_insert" ON public.historical_business_daily
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() = true);

DROP POLICY IF EXISTS "historical_daily_admin_update" ON public.historical_business_daily;
CREATE POLICY "historical_daily_admin_update" ON public.historical_business_daily
  FOR UPDATE TO authenticated
  USING (public.is_admin() = true)
  WITH CHECK (public.is_admin() = true);

DROP POLICY IF EXISTS "historical_daily_admin_delete" ON public.historical_business_daily;
CREATE POLICY "historical_daily_admin_delete" ON public.historical_business_daily
  FOR DELETE TO authenticated USING (public.is_admin() = true);

-- ── 3. updated_at TRIGGER (reuses the shared touch_updated_at()) ──────────
DROP TRIGGER IF EXISTS trg_historical_daily_touch ON public.historical_business_daily;
CREATE TRIGGER trg_historical_daily_touch
  BEFORE UPDATE ON public.historical_business_daily
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 4. SEED (idempotent: never overwrites existing / admin-edited rows) ───
INSERT INTO public.historical_business_daily
  (business_date, order_count, revenue_amount, supplier_cost_amount, delivery_income_amount, gross_profit_amount, source, notes)
VALUES
  -- April 2026 (pre-platform)
  ('2026-04-09',  8,   428.00, 388.00, 0.00,   40.00,  'historical_import', NULL),
  ('2026-04-13',  3,   192.00, 164.00, 0.00,   28.00,  'historical_import', NULL),
  ('2026-04-15',  4,   212.00, 180.00, 0.00,   32.00,  'historical_import', NULL),
  ('2026-04-17',  6,   450.00, 387.00, 0.00,   63.00,  'historical_import', NULL),
  ('2026-04-22',  9,   611.00, 511.00, 0.00,  100.00,  'historical_import', NULL),
  ('2026-04-24', 10,   630.00, 561.00, 0.00,   69.00,  'historical_import', NULL),
  ('2026-04-29', 18,   958.80, 820.00, 0.00,  138.80,  'historical_import', NULL),
  -- May 2026 (pre-platform)
  ('2026-05-01',  5,   250.00, 215.00, 0.00,   35.00,  'historical_import', NULL),
  ('2026-05-06', 12,   641.50, 601.00, 0.00,   40.50,  'historical_import', NULL),
  ('2026-05-08',  6,   320.00, 274.00, 0.00,   46.00,  'historical_import', NULL),
  ('2026-05-13',  5,   233.50, 210.00, 0.00,   23.50,  'historical_import', NULL),
  ('2026-05-15',  8,   452.00, 386.00, 0.00,   66.00,  'historical_import', NULL),
  ('2026-05-20',  7,   420.00, 363.00, 0.00,   57.00,  'historical_import', NULL),
  ('2026-05-22',  6,   325.00, 283.00, 0.00,   42.00,  'historical_import', NULL),
  -- June 2026 (pre-platform)
  ('2026-06-03',  3,   120.00, 105.00, 0.00,   15.00,  'historical_import', NULL),
  ('2026-06-05',  6,   351.00, 309.00, 0.00,   42.00,  'historical_import', NULL),
  ('2026-06-10', 10,   687.15, 636.00, 0.00,   51.15,  'historical_import', NULL),
  ('2026-06-12',  3,   104.00,  90.00, 0.00,   14.00,  'historical_import', NULL),
  ('2026-06-17',  5,   315.20, 274.00, 0.00,   41.20,  'historical_import', NULL),
  ('2026-06-19',  9,   475.60, 429.00, 0.00,   46.60,  'historical_import', NULL),
  ('2026-06-24', 14,   750.76, 696.00, 0.00,   54.76,  'historical_import', NULL),
  ('2026-06-26', 12,   686.40, 600.00, 0.00,   86.40,  'historical_import', NULL),
  -- July 2026 (includes delivery income)
  ('2026-07-01', 11,   694.16, 481.00, 25.00, 188.16,  'historical_import', NULL),
  ('2026-07-03', 13,   861.55, 720.00, 30.00, 111.55,  'historical_import', NULL),
  ('2026-07-08',  4,   264.00, 226.00,  8.00,  30.00,  'historical_import', NULL),
  ('2026-07-10',  6,   325.00, 292.00, 20.00,  13.00,  'historical_import', NULL),
  ('2026-07-15',  9,   578.00, 482.00, 20.00,  76.00,  'historical_import', NULL),
  ('2026-07-17',  6,   348.99, 290.00, 15.00,  43.99,  'historical_import', NULL),
  ('2026-07-22', 10,   715.52, 592.00, 31.00,  92.52,  'historical_import', NULL),
  ('2026-07-24',  5,   326.50, 275.00, 15.00,  36.50,  'historical_import', NULL),
  ('2026-07-28',  8,   458.00, 381.00, 20.00,  57.00,  'historical_import', NULL),
  ('2026-07-31', 11,   580.23, 487.00, 25.00,  68.23,  'historical_import', NULL)
ON CONFLICT (business_date) DO NOTHING;

-- ── 5. SELF-VALIDATION (run as postgres / supabase admin) ─────────────────
-- Monthly rollup from the table (should match the reconciliation header):
-- SELECT date_trunc('month', business_date)::date AS month,
--        sum(order_count)             AS orders,
--        sum(revenue_amount)          AS revenue,
--        sum(supplier_cost_amount)    AS cost,
--        sum(delivery_income_amount)  AS delivery,
--        sum(gross_profit_amount)     AS gross_profit
-- FROM public.historical_business_daily
-- GROUP BY 1 ORDER BY 1;
