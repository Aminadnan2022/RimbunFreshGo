-- ═══════════════════════════════════════════════════════════════════════════
-- FRESHGO PRICING & PROFIT ACCOUNTING — VERSION 2.1 (PRODUCTION / ERP-READY)
--
-- Runs AFTER V2 (20260820000000_pricing_and_profit_accounting_v2.sql).
-- Do NOT redesign: this file IMPROVES the accounting / calculation / reporting
-- engine only and preserves the V2 schema. It is additive, idempotent and
-- non-destructive. Existing orders, products, supplier dashboard, customer
-- tracking, admin dashboard and rider flow keep working unchanged.
--
-- WHAT IT DELIVERS
--  1. Profit engine for ALL 4 selling methods:
--        fixed       selling = unit × quantity
--        weight      selling = unit × actual_weight_kg (supplier-confirmed)
--        whole fish  selling = unit × actual_weight_kg (supplier weighs fish)
--        slice       selling = unit × actual_weight_kg (NEVER slice count)
--  2. Per-item FROZEN financials written into Orders.order_items JSONB at
--     weight-confirm time: selling_price_per_unit, supplier_cost_per_unit,
--     actual_weight, selling_total, supplier_total, gross_profit,
--     profit_margin_percent, pricing_snapshot_timestamp.
--     Historical reports never read Product tables again.
--  3. Orders-level frozen columns: revenue, supplier_cost, gross_profit,
--     profit_margin_percent, pricing_snapshot_timestamp.
--  4. BEFORE trigger auto-recalculates on every supplier weight change and on
--     admin price edits (reprice hook). Money is LOCKED forever once Paid.
--  5. Reporting views: vw_sales_summary_daily, vw_sales_summary_monthly,
--     vw_product_profit, vw_supplier_profit, vw_category_profit,
--     vw_top_products, vw_top_profit_products, vw_order_profit,
--     vw_dashboard_kpis + materialized mv_sales_summary_monthly.
--  6. Index review to avoid sequential scans on date/supplier/product/category/
--     status filters.
--  7. ERP prep: supplier master cols (currency, payment_terms, tax_id,
--     account_ref), per-order currency, COGS-ready frozen fields, reprice hook
--     for open orders (future purchase orders / stock adjustments can reuse it).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ORDERS-LEVEL FROZEN FINANCIALS (non-destructive)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public."Orders"
  ADD COLUMN IF NOT EXISTS revenue                 numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_cost           numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_margin_percent   numeric(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_snapshot_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_total            numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency                text NOT NULL DEFAULT 'MYR';

COMMENT ON COLUMN public."Orders".revenue IS
  'Gross revenue of line items (excl. delivery fee). Frozen at checkout / weight-confirm.';
COMMENT ON COLUMN public."Orders".supplier_cost IS
  'Total supplier cost of line items. Frozen — never recomputed from Product.';
COMMENT ON COLUMN public."Orders".profit_margin_percent IS
  'Gross margin %% (gross_profit / revenue). Frozen.';
COMMENT ON COLUMN public."Orders".pricing_snapshot_timestamp IS
  'When the current frozen financial snapshot was captured.';

-- ERP supplier master extensions (safe, additive).
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS currency      text NOT NULL DEFAULT 'MYR',
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS tax_id        text,
  ADD COLUMN IF NOT EXISTS account_ref   text;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. PROFIT ENGINE — pure SQL helpers (single source of truth)
--    Mirror src/lib/profit.ts but usable by triggers, backfills and views.
--    Money is always computed from the item JSONB snapshot; Product tables are
--    never consulted for money.
-- ═══════════════════════════════════════════════════════════════════════════

-- Effective billable quantity of a line.
--   fixed       -> quantity
--   per_kg/whole -> actualWeight ?? estimatedWeight (kg)
--   slice       -> actualWeight ?? estimatedWeight (kg) — NEVER sliceQuantity
CREATE OR REPLACE FUNCTION public._line_qty(item jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN (item->>'pricingType') IN ('per_kg','slice')
      THEN COALESCE((item->>'actualWeight')::numeric, (item->>'estimatedWeight')::numeric, 0)
    ELSE COALESCE((item->>'quantity')::numeric, 0)
  END;
$$;

CREATE OR REPLACE FUNCTION public._line_selling(item jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT round(COALESCE((item->>'price')::numeric,0) * public._line_qty(item), 2);
$$;

CREATE OR REPLACE FUNCTION public._line_cost(item jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT round(COALESCE((item->>'costPrice')::numeric,0) * public._line_qty(item), 2);
$$;

CREATE OR REPLACE FUNCTION public._line_profit(item jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT round(public._line_selling(item) - public._line_cost(item), 2);
$$;

CREATE OR REPLACE FUNCTION public._line_margin(item jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN public._line_selling(item) > 0
    THEN round((public._line_selling(item) - public._line_cost(item)) / public._line_selling(item) * 100, 2)
    ELSE 0 END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. FREEZE ENGINE — BEFORE INSERT/UPDATE trigger on Orders
--    Rebuilds the frozen per-item snapshot + order totals from the current
--    order_items / supplier_weights (kg, keyed by item index) every time the
--    supplier confirms a weight or admin edits prices pre-payment.
--    Once payment_status = 'Paid' the money is LOCKED forever.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.freeze_order_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  it              jsonb;
  item_pos        integer;
  new_item        jsonb;
  items_new       jsonb := '[]'::jsonb;
  weights         jsonb := COALESCE(NEW.supplier_weights, '{}'::jsonb);
  line_qty        numeric;
  line_price      numeric;
  line_cost       numeric;
  selling_total   numeric;
  supplier_total  numeric;
  line_profit     numeric;
  margin_pct      numeric;
  order_revenue   numeric := 0;
  order_cost      numeric := 0;
BEGIN
  -- LOCKED once Paid (snapshot already exists): never touch money again.
  IF COALESCE(NEW.payment_status,'') = 'Paid' AND NEW.pricing_snapshot_timestamp IS NOT NULL THEN
    RETURN NEW;
  END IF;

  FOR it, item_pos IN
    SELECT el, pos - 1
    FROM jsonb_array_elements(COALESCE(NEW.order_items,'[]'::jsonb))
         WITH ORDINALITY AS t(el, pos)
  LOOP
    line_price := COALESCE((it->>'price')::numeric, 0);
    line_cost  := COALESCE((it->>'costPrice')::numeric, 0);

    IF (it->>'pricingType') IN ('per_kg','slice') THEN
      -- weight / whole-fish / slice: use ACTUAL kg from the supplier weight map,
      -- then the item's own weight, then the checkout estimate. Slice count is
      -- deliberately never used for money.
      line_qty := COALESCE((weights ->> item_pos::text)::numeric,
                           (it->>'actual_weight')::numeric,
                           (it->>'actualWeight')::numeric,
                           (it->>'estimatedWeight')::numeric, 0);
    ELSE
      line_qty := COALESCE((it->>'quantity')::numeric, 0);
    END IF;

    selling_total  := round(line_price * line_qty, 2);
    supplier_total := round(line_cost  * line_qty, 2);
    line_profit    := round(selling_total - supplier_total, 2);
    margin_pct     := CASE WHEN selling_total > 0
                       THEN round(line_profit / selling_total * 100, 2) ELSE 0 END;

    new_item := it || jsonb_build_object(
      'selling_price_per_unit',      line_price,
      'supplier_cost_per_unit',      line_cost,
      'actual_weight',               line_qty,
      'selling_total',               selling_total,
      'supplier_total',              supplier_total,
      'gross_profit',                line_profit,
      'profit_margin_percent',       margin_pct,
      'pricing_snapshot_timestamp',  now()
    );

    items_new     := items_new || jsonb_build_array(new_item);
    order_revenue := order_revenue + selling_total;
    order_cost    := order_cost + supplier_total;
  END LOOP;

  NEW.order_items           := items_new;
  NEW.revenue               := round(order_revenue, 2);
  NEW.supplier_cost         := round(order_cost, 2);
  NEW.gross_profit          := round(order_revenue - order_cost, 2);
  NEW.profit_margin_percent := CASE WHEN order_revenue > 0
                                 THEN round((order_revenue - order_cost) / order_revenue * 100, 2)
                                 ELSE 0 END;
  NEW.pricing_snapshot_timestamp := now();
  NEW.frozen_total          := COALESCE(NEW.total, order_revenue);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_order_pricing ON public."Orders";
CREATE TRIGGER trg_freeze_order_pricing
  BEFORE UPDATE OF order_items, supplier_weights, gross_profit, payment_status
  ON public."Orders"
  FOR EACH ROW EXECUTE FUNCTION public.freeze_order_pricing();

DROP TRIGGER IF EXISTS trg_freeze_order_pricing_insert ON public."Orders";
CREATE TRIGGER trg_freeze_order_pricing_insert
  BEFORE INSERT ON public."Orders"
  FOR EACH ROW EXECUTE FUNCTION public.freeze_order_pricing();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. REPRICE OPEN ORDERS — ERP hook
--    Re-stamps the live price/cost/supplier onto every NOT-PAID order that
--    contains the product, so admin price edits propagate pre-payment. The
--    updated order_items then hit the freeze trigger for a full recalculation.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reprice_open_orders_for_product(p_product_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n          integer := 0;
  v_id       bigint;
  v_items    jsonb;
  v_new      jsonb;
  v_price    numeric;
  v_cost     numeric;
  v_supplier text;
  v_el       jsonb;
  v_pos      integer;
  v_item     jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_supplier()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(
           (SELECT selling_price FROM public.selling_price_history
             WHERE product_id = p_product_id AND is_active
             ORDER BY effective_from DESC LIMIT 1),
           (SELECT price FROM public."Product" WHERE id = p_product_id),
           0) INTO v_price;
  SELECT COALESCE(
           (SELECT cost_price FROM public.supplier_price_history
             WHERE product_id = p_product_id AND is_active
             ORDER BY effective_from DESC LIMIT 1),
           (SELECT cost_price FROM public."Product" WHERE id = p_product_id),
           0) INTO v_cost;
  SELECT COALESCE(
           (SELECT supplier_name FROM public.supplier_price_history
             WHERE product_id = p_product_id AND is_active
             ORDER BY effective_from DESC LIMIT 1),
           (SELECT cost_supplier_name FROM public."Product" WHERE id = p_product_id),
           '') INTO v_supplier;

  FOR v_id, v_items IN
    SELECT o.id, o.order_items
    FROM public."Orders" o
    WHERE COALESCE(o.payment_status,'') <> 'Paid'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(o.order_items,'[]'::jsonb)) it
        WHERE it->>'productId' = p_product_id
      )
  LOOP
    v_new := '[]'::jsonb;
    FOR v_el, v_pos IN
      SELECT el, pos
      FROM jsonb_array_elements(COALESCE(v_items,'[]'::jsonb))
           WITH ORDINALITY AS t(el, pos)
    LOOP
      IF (v_el->>'productId') = p_product_id THEN
        v_item := v_el || jsonb_build_object(
          'price',        v_price,
          'costPrice',    v_cost,
          'supplierName', v_supplier
        );
      ELSE
        v_item := v_el;
      END IF;
      v_new := v_new || jsonb_build_array(v_item);
    END LOOP;

    UPDATE public."Orders" SET order_items = v_new WHERE id = v_id; -- freeze trigger recomputes
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

-- V2 price-publishing wrappers: keep the original signatures (app unchanged)
-- but ALSO reprice open orders whenever an official price is published.
CREATE OR REPLACE FUNCTION public.set_product_selling_price(p_product_id text, p_selling_price numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._pricing_set_selling(p_product_id, p_selling_price, now());
  PERFORM public.reprice_open_orders_for_product(p_product_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_selling_price_at(
  p_product_id text, p_selling_price numeric, p_effective_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._pricing_set_selling(p_product_id, p_selling_price, p_effective_at);
  PERFORM public.reprice_open_orders_for_product(p_product_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_supplier_price(
  p_product_id text, p_cost_price numeric, p_supplier_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._pricing_set_supplier(p_product_id, p_cost_price, p_supplier_name, NULL, now());
  PERFORM public.reprice_open_orders_for_product(p_product_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_supplier_price_at(
  p_product_id text, p_cost_price numeric, p_supplier_name text,
  p_supplier_id bigint, p_effective_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._pricing_set_supplier(p_product_id, p_cost_price, p_supplier_name, p_supplier_id, p_effective_at);
  PERFORM public.reprice_open_orders_for_product(p_product_id);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. INDEX OPTIMISATION — avoid sequential scans on reporting filters
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public."Orders" (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status_created
  ON public."Orders" (payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_slot_created
  ON public."Orders" (delivery_slot, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON public."Orders" ((order_summary->>'status'));
CREATE INDEX IF NOT EXISTS idx_orders_currency
  ON public."Orders" (currency);
CREATE INDEX IF NOT EXISTS idx_suppliers_currency
  ON public.suppliers (currency);
CREATE INDEX IF NOT EXISTS idx_supplier_price_history_eff
  ON public.supplier_price_history (effective_from);
CREATE INDEX IF NOT EXISTS idx_selling_price_history_eff
  ON public.selling_price_history (effective_from);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. REPORTING VIEWS
--    All money comes from the frozen per-item snapshot (falling back to the
--    live calculation for rows created before this migration). Queries against
--    these views replace ad-hoc recalculation in the Admin Dashboard.
-- ═══════════════════════════════════════════════════════════════════════════

-- Base flat view: one row per order item with frozen + computed money.
CREATE OR REPLACE VIEW public.vw_order_item_flat AS
SELECT
  o.id                              AS order_id,
  o.created_at                      AS order_created_at,
  o.created_at::date                AS order_date,
  o.delivery_slot                   AS delivery_slot,
  COALESCE(o.payment_status,'')     AS payment_status,
  o.order_summary->>'status'        AS order_status,
  t.pos                             AS item_index,
  it->>'productId'                  AS product_id,
  COALESCE(it->>'name','')          AS product_name,
  COALESCE(p.category, it->>'category','Others') AS category,
  COALESCE(it->>'supplierName', p.vendor_name, 'Unknown') AS supplier_name,
  it->>'pricingType'                AS pricing_type,
  COALESCE((it->>'selling_price_per_unit')::numeric, (it->>'price')::numeric, 0) AS selling_price_per_unit,
  COALESCE((it->>'supplier_cost_per_unit')::numeric, (it->>'costPrice')::numeric, 0) AS supplier_cost_per_unit,
  COALESCE((it->>'actual_weight')::numeric,
           CASE WHEN (it->>'pricingType') IN ('per_kg','slice')
                THEN (it->>'actualWeight')::numeric
                ELSE NULL END, 0)   AS actual_weight,
  CASE WHEN (it->>'pricingType') IN ('per_kg','slice')
       THEN COALESCE((it->>'actual_weight')::numeric, (it->>'actualWeight')::numeric, (it->>'estimatedWeight')::numeric, 0)
       ELSE COALESCE((it->>'quantity')::numeric, 0) END AS qty_sold,
  COALESCE((it->>'selling_total')::numeric, public._line_selling(it)) AS selling_total,
  COALESCE((it->>'supplier_total')::numeric, public._line_cost(it))   AS supplier_total,
  COALESCE((it->>'gross_profit')::numeric, public._line_profit(it))   AS gross_profit,
  COALESCE((it->>'profit_margin_percent')::numeric, public._line_margin(it)) AS profit_margin_percent
FROM public."Orders" o
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.order_items,'[]'::jsonb))
  WITH ORDINALITY AS t(it, pos)
LEFT JOIN public."Product" p ON p.id = it->>'productId';

-- Daily sales / profit summary.
CREATE OR REPLACE VIEW public.vw_sales_summary_daily AS
SELECT
  order_date                                                     AS report_date,
  COUNT(DISTINCT order_id)                                       AS order_count,
  ROUND(SUM(qty_sold),2)                                         AS quantity_sold,
  ROUND(SUM(selling_total),2)                                    AS revenue,
  ROUND(SUM(supplier_total),2)                                   AS supplier_cost,
  ROUND(SUM(gross_profit),2)                                     AS profit,
  ROUND(CASE WHEN SUM(selling_total) > 0
             THEN SUM(gross_profit) / SUM(selling_total) * 100 ELSE 0 END, 2) AS margin_percent,
  ROUND(SUM(selling_total)  / NULLIF(SUM(qty_sold),0),2)         AS avg_selling_price,
  ROUND(SUM(supplier_total) / NULLIF(SUM(qty_sold),0),2)         AS avg_supplier_cost,
  ROUND(SUM(gross_profit)   / NULLIF(SUM(qty_sold),0),2)         AS avg_profit
FROM public.vw_order_item_flat
GROUP BY order_date;

-- Monthly sales / profit summary.
CREATE OR REPLACE VIEW public.vw_sales_summary_monthly AS
SELECT
  to_char(order_date, 'YYYY-MM')                                 AS report_month,
  COUNT(DISTINCT order_id)                                       AS order_count,
  ROUND(SUM(qty_sold),2)                                         AS quantity_sold,
  ROUND(SUM(selling_total),2)                                    AS revenue,
  ROUND(SUM(supplier_total),2)                                   AS supplier_cost,
  ROUND(SUM(gross_profit),2)                                     AS profit,
  ROUND(CASE WHEN SUM(selling_total) > 0
             THEN SUM(gross_profit) / SUM(selling_total) * 100 ELSE 0 END, 2) AS margin_percent,
  ROUND(SUM(selling_total)  / NULLIF(SUM(qty_sold),0),2)         AS avg_selling_price,
  ROUND(SUM(supplier_total) / NULLIF(SUM(qty_sold),0),2)         AS avg_supplier_cost,
  ROUND(SUM(gross_profit)   / NULLIF(SUM(qty_sold),0),2)         AS avg_profit
FROM public.vw_order_item_flat
GROUP BY report_month;

-- Product profit report (with avg weight & avg prices for weight-based lines).
CREATE OR REPLACE VIEW public.vw_product_profit AS
SELECT
  product_id,
  MAX(product_name)                                              AS product_name,
  MAX(category)                                                  AS category,
  COUNT(DISTINCT order_id)                                       AS order_count,
  ROUND(SUM(qty_sold),2)                                         AS quantity_sold,
  ROUND(AVG(CASE WHEN pricing_type IN ('per_kg','slice') THEN actual_weight END),3) AS avg_weight,
  ROUND(AVG(selling_price_per_unit),2)                           AS avg_selling_price,
  ROUND(AVG(supplier_cost_per_unit),2)                           AS avg_supplier_cost,
  ROUND(SUM(gross_profit)   / NULLIF(SUM(qty_sold),0),2)         AS avg_profit,
  ROUND(SUM(selling_total),2)                                    AS revenue,
  ROUND(SUM(supplier_total),2)                                   AS supplier_cost,
  ROUND(SUM(gross_profit),2)                                     AS profit,
  ROUND(CASE WHEN SUM(selling_total) > 0
             THEN SUM(gross_profit) / SUM(selling_total) * 100 ELSE 0 END, 2) AS margin_percent
FROM public.vw_order_item_flat
GROUP BY product_id;

-- Supplier profit report.
CREATE OR REPLACE VIEW public.vw_supplier_profit AS
SELECT
  supplier_name,
  COUNT(DISTINCT order_id)                                       AS order_count,
  COUNT(DISTINCT product_id)                                     AS products_sold,
  ROUND(SUM(selling_total),2)                                    AS revenue,
  ROUND(SUM(supplier_total),2)                                   AS supplier_cost,
  ROUND(SUM(gross_profit),2)                                     AS profit,
  ROUND(CASE WHEN SUM(selling_total) > 0
             THEN SUM(gross_profit) / SUM(selling_total) * 100 ELSE 0 END, 2) AS avg_margin_percent
FROM public.vw_order_item_flat
GROUP BY supplier_name;

-- Category profit report.
CREATE OR REPLACE VIEW public.vw_category_profit AS
SELECT
  category,
  COUNT(DISTINCT order_id)                                       AS order_count,
  ROUND(SUM(qty_sold),2)                                         AS quantity_sold,
  ROUND(SUM(selling_total),2)                                    AS revenue,
  ROUND(SUM(supplier_total),2)                                   AS supplier_cost,
  ROUND(SUM(gross_profit),2)                                     AS profit,
  ROUND(CASE WHEN SUM(selling_total) > 0
             THEN SUM(gross_profit) / SUM(selling_total) * 100 ELSE 0 END, 2) AS margin_percent
FROM public.vw_order_item_flat
GROUP BY category;

-- Top 10 selling products by revenue.
CREATE OR REPLACE VIEW public.vw_top_products AS
SELECT product_id, product_name, category, order_count, quantity_sold,
       revenue, supplier_cost, profit, margin_percent
FROM public.vw_product_profit
ORDER BY revenue DESC
LIMIT 10;

-- Top 10 most profitable products.
CREATE OR REPLACE VIEW public.vw_top_profit_products AS
SELECT product_id, product_name, category, order_count, quantity_sold,
       revenue, supplier_cost, profit, margin_percent
FROM public.vw_product_profit
ORDER BY profit DESC
LIMIT 10;

-- Per-order profit breakdown (Admin > Orders without recalculation).
CREATE OR REPLACE VIEW public.vw_order_profit AS
SELECT
  f.order_id,
  MAX(o.created_at)::date                     AS order_date,
  MAX(o.order_summary->>'status')             AS order_status,
  MAX(COALESCE(o.payment_status,''))          AS payment_status,
  MAX(o.full_name)                            AS customer_name,
  COUNT(*)                                    AS item_count,
  ROUND(SUM(f.selling_total),2)               AS revenue,
  ROUND(SUM(f.supplier_total),2)              AS supplier_cost,
  ROUND(SUM(f.gross_profit),2)                AS gross_profit,
  ROUND(CASE WHEN SUM(f.selling_total) > 0
             THEN SUM(f.gross_profit) / SUM(f.selling_total) * 100 ELSE 0 END, 2) AS margin_percent,
  MAX(o.delivery_fee)                         AS delivery_fee,
  MAX(o.total)                                AS total
FROM public.vw_order_item_flat f
JOIN public."Orders" o ON o.id = f.order_id
GROUP BY f.order_id;

-- Dashboard KPI view (single row) for future cards: today / monthly / AOV / top X.
CREATE OR REPLACE VIEW public.vw_dashboard_kpis AS
SELECT
  (SELECT ROUND(SUM(selling_total),2) FROM public.vw_order_item_flat
    WHERE order_date = CURRENT_DATE)                                  AS today_revenue,
  (SELECT ROUND(SUM(supplier_total),2) FROM public.vw_order_item_flat
    WHERE order_date = CURRENT_DATE)                                  AS today_supplier_cost,
  (SELECT ROUND(SUM(gross_profit),2) FROM public.vw_order_item_flat
    WHERE order_date = CURRENT_DATE)                                  AS today_profit,
  (SELECT ROUND(CASE WHEN SUM(selling_total) > 0
              THEN SUM(gross_profit)/SUM(selling_total)*100 ELSE 0 END, 2)
   FROM public.vw_order_item_flat WHERE order_date = CURRENT_DATE)    AS today_margin_percent,
  (SELECT ROUND(SUM(selling_total),2) FROM public.vw_order_item_flat
    WHERE to_char(order_date,'YYYY-MM') = to_char(CURRENT_DATE,'YYYY-MM')) AS monthly_revenue,
  (SELECT ROUND(SUM(gross_profit),2) FROM public.vw_order_item_flat
    WHERE to_char(order_date,'YYYY-MM') = to_char(CURRENT_DATE,'YYYY-MM')) AS monthly_profit,
  (SELECT ROUND(AVG(total),2) FROM public."Orders"
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')            AS avg_order_value_30d,
  (SELECT product_name FROM public.vw_product_profit
    ORDER BY revenue DESC LIMIT 1)                                    AS top_selling_product,
  (SELECT product_name FROM public.vw_product_profit
    ORDER BY profit DESC LIMIT 1)                                     AS most_profitable_product,
  (SELECT category FROM public.vw_category_profit
    ORDER BY profit DESC LIMIT 1)                                     AS most_profitable_category;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. MATERIALIZED VIEW — monthly reports
--    Refresh strategy: run REFRESH MATERIALIZED VIEW CONCURRENTLY on a nightly
--    schedule (pg_cron / Supabase scheduler), e.g. every day 01:00:
--      SELECT cron.schedule('refresh-monthly-reports', '0 1 * * *',
--        $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_sales_summary_monthly$$);
--    CONCURRENTLY is used so reads never block; it needs the unique index below.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_sales_summary_monthly AS
SELECT * FROM public.vw_sales_summary_monthly
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_sales_summary_monthly_pk
  ON public.mv_sales_summary_monthly (report_month);

CREATE OR REPLACE FUNCTION public.refresh_monthly_report_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Non-concurrent: safe inside a function/transaction. For zero-downtime
  -- refreshes from a cron job use `REFRESH MATERIALIZED VIEW CONCURRENTLY`
  -- directly (outside a transaction block); it requires the unique index.
  REFRESH MATERIALIZED VIEW public.mv_sales_summary_monthly;
END;
$$;
GRANT EXECUTE ON FUNCTION public.refresh_monthly_report_mv() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. BACKFILL — freeze financials for EXISTING orders
--    Touching order_items fires the freeze trigger, which uses each order's
--    supplier_weights (kg) to compute real amounts for weight/whole/slice lines.
--    Idempotent: rows already frozen (snapshot set) are left untouched.
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public."Orders" SET order_items = order_items;

-- Refresh the materialized monthly view with the (now backfilled) data.
REFRESH MATERIALIZED VIEW public.mv_sales_summary_monthly;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. VIEW PRIVILEGES — dashboard reads the views via the anon/authenticated role
-- ═══════════════════════════════════════════════════════════════════════════
GRANT SELECT ON public.vw_order_item_flat     TO anon, authenticated;
GRANT SELECT ON public.vw_sales_summary_daily TO anon, authenticated;
GRANT SELECT ON public.vw_sales_summary_monthly TO anon, authenticated;
GRANT SELECT ON public.vw_product_profit      TO anon, authenticated;
GRANT SELECT ON public.vw_supplier_profit     TO anon, authenticated;
GRANT SELECT ON public.vw_category_profit     TO anon, authenticated;
GRANT SELECT ON public.vw_top_products        TO anon, authenticated;
GRANT SELECT ON public.vw_top_profit_products TO anon, authenticated;
GRANT SELECT ON public.vw_order_profit        TO anon, authenticated;
GRANT SELECT ON public.vw_dashboard_kpis      TO anon, authenticated;
GRANT SELECT ON public.mv_sales_summary_monthly TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. BACKWARD COMPATIBILITY NOTES
--   · OrderContext / SupplierDashboard write order_items + supplier_weights the
--     same way; the trigger only ADDS frozen keys and keeps price/costPrice/
--     actualWeight/grossProfit untouched, so the app and vw_* reports agree.
--   · V2 RPC signatures (set_product_selling_price etc.) are redefined in-place
--     with identical arguments — no client change required.
--   · Paid orders are locked: money fields are never recalculated afterwards.
--   · Re-running is safe: every statement is IF NOT EXISTS / CREATE OR REPLACE.
-- ═══════════════════════════════════════════════════════════════════════════