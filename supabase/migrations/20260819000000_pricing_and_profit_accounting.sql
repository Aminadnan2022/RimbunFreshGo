-- Pricing & Profit Accounting (core accounting feature)
--
-- Adds a proper price-history system (NOT just extra columns on Product):
--   1. supplier_price_history — immutable history of supplier cost per product
--   2. selling_price_history  — immutable history of selling price per product
--   3. Product.cost_price / cost_supplier_name — LIVE current supplier cost,
--      kept in sync ONLY via the RPCs below. Historical changes never touch
--      this column; they live in the history tables.
--   4. Orders.gross_profit — snapshot of an order's gross profit.
--
-- ORDER PRICING RULES
--   - Every order item ALREADY stores its selling `price` snapshot inside
--     Orders.order_items JSONB. We additionally stamp `costPrice`/`supplierName`
--     onto each item at checkout so historical orders are fully frozen.
--   - Gross profit per item = selling price - supplier cost (x qty or x weight).
--   - Changing a supplier/selling price only affects FUTURE orders. Existing
--     orders are NEVER rewritten.

-- 1. Live current values on Product (mirrors the active history row)
ALTER TABLE public."Product"
  ADD COLUMN IF NOT EXISTS cost_price numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_supplier_name text NOT NULL DEFAULT '';

-- 2. Order-level gross profit snapshot
ALTER TABLE public."Orders"
  ADD COLUMN IF NOT EXISTS gross_profit numeric(10,2) NOT NULL DEFAULT 0;

-- 3. Supplier price history
CREATE TABLE IF NOT EXISTS public.supplier_price_history (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id     text NOT NULL REFERENCES public."Product"(id) ON DELETE CASCADE,
  supplier_name  text NOT NULL DEFAULT '',
  cost_price     numeric(10,2) NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to   date,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_price_history_product_idx
  ON public.supplier_price_history (product_id, effective_from DESC);

-- 4. Selling price history
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

CREATE INDEX IF NOT EXISTS selling_price_history_product_idx
  ON public.selling_price_history (product_id, effective_from DESC);

-- 5. RLS: admins only for both history tables
ALTER TABLE public.supplier_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selling_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_history_admin_all" ON public.supplier_price_history;
CREATE POLICY "price_history_admin_all" ON public.supplier_price_history
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "price_history_admin_all" ON public.selling_price_history;
CREATE POLICY "price_history_admin_all" ON public.selling_price_history
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 6. RPC: publish a new selling price.
-- Closes the currently active record (effective_to = today, is_active = false),
-- updates the live Product.price, inserts a new active record from today.
CREATE OR REPLACE FUNCTION public.set_product_selling_price(
  p_product_id   text,
  p_selling_price numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_selling_price IS NULL OR p_selling_price < 0 THEN
    RAISE EXCEPTION 'Invalid selling price.';
  END IF;

  UPDATE public.selling_price_history
     SET effective_to = CURRENT_DATE, is_active = false, updated_at = now()
   WHERE product_id = p_product_id AND is_active = true;

  UPDATE public."Product"
     SET price = p_selling_price
   WHERE id = p_product_id;

  INSERT INTO public.selling_price_history
    (product_id, selling_price, effective_from, is_active, created_by)
  VALUES
    (p_product_id, p_selling_price, CURRENT_DATE, true, auth.uid());
END;
$$;

-- 7. RPC: publish a new supplier cost.
CREATE OR REPLACE FUNCTION public.set_product_supplier_price(
  p_product_id   text,
  p_cost_price   numeric,
  p_supplier_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_cost_price IS NULL OR p_cost_price < 0 THEN
    RAISE EXCEPTION 'Invalid cost price.';
  END IF;

  UPDATE public.supplier_price_history
     SET effective_to = CURRENT_DATE, is_active = false, updated_at = now()
   WHERE product_id = p_product_id AND is_active = true;

  UPDATE public."Product"
     SET cost_price = p_cost_price,
         cost_supplier_name = coalesce(p_supplier_name, '')
   WHERE id = p_product_id;

  INSERT INTO public.supplier_price_history
    (product_id, supplier_name, cost_price, effective_from, is_active, created_by)
  VALUES
    (p_product_id, coalesce(p_supplier_name, ''), p_cost_price, CURRENT_DATE, true, auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_product_selling_price(text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_product_supplier_price(text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_product_selling_price(text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_supplier_price(text, numeric, text) TO authenticated;
