-- EXPAND: add the supplier-safe and admin-safe interfaces used by the new
-- frontend without changing any existing table grants or RLS policies. The old
-- deployed frontend therefore remains functional throughout this phase.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_sales_order_lines(p_sales_order_id uuid)
RETURNS SETOF public.sales_order_lines
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT l.*
    FROM public.sales_order_lines l
   WHERE l.sales_order_id = p_sales_order_id
   ORDER BY l.line_number;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_sales_order_lines(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_sales_order_lines(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.supplier_get_canonical_work()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_supplier() THEN
    RAISE EXCEPTION 'Supplier access required.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'orders', COALESCE((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC)
        FROM (
          SELECT o.id,
                 o.order_number,
                 jsonb_build_object(
                   'name', o.customer_snapshot ->> 'name',
                   'phone', o.customer_snapshot ->> 'phone',
                   'notes', o.customer_snapshot ->> 'notes'
                 ) AS customer_snapshot,
                 jsonb_build_object(
                   'requested_date', o.delivery_snapshot ->> 'requested_date',
                   'apartment', o.delivery_snapshot ->> 'apartment',
                   'house_unit', o.delivery_snapshot ->> 'house_unit',
                   'pickup_location', o.delivery_snapshot ->> 'pickup_location',
                   'delivery_point_name', o.delivery_snapshot ->> 'delivery_point_name',
                   'zone_name', o.delivery_snapshot ->> 'zone_name'
                 ) AS delivery_snapshot,
                 o.payment_status,
                 o.price_status,
                 o.paid_at,
                 o.created_at
            FROM public.sales_orders o
           WHERE public.is_supplier_for_sales_order(o.id)
        ) q
    ), '[]'::jsonb),
    'lines', COALESCE((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.sales_order_id, q.line_number)
        FROM (
          SELECT l.id, l.sales_order_id, l.line_number, l.product_id,
                 l.combo_id,
                 l.product_snapshot - ARRAY[
                   'cost_price', 'unit_cost_price', 'estimated_supplier_cost',
                   'final_supplier_cost', 'supplier_cost', 'gross_profit',
                   'profit', 'margin', 'profit_margin_percent'
                 ] AS product_snapshot,
                 l.quantity, l.selling_unit,
                 l.ordering_mode, l.actual_weight_kg, l.item_kind
            FROM public.sales_order_lines l
           WHERE public.is_supplier_for_sales_order_line(l.id)
              OR public.is_supplier_for_sales_order_line_via_component(l.id)
        ) q
    ), '[]'::jsonb),
    'line_units', COALESCE((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.sales_order_line_id, q.unit_number)
        FROM (
          SELECT u.id, u.sales_order_line_id, u.unit_number, u.actual_weight_kg
            FROM public.sales_order_line_units u
           WHERE public.is_supplier_for_sales_order_line(u.sales_order_line_id)
        ) q
    ), '[]'::jsonb),
    'components', COALESCE((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.sales_order_line_id, q.component_number)
        FROM (
          SELECT c.id, c.sales_order_line_id, c.component_number, c.product_id,
                 c.product_snapshot - ARRAY[
                   'cost_price', 'unit_cost_price', 'estimated_supplier_cost',
                   'final_supplier_cost', 'supplier_cost', 'gross_profit',
                   'profit', 'margin', 'profit_margin_percent'
                 ] AS product_snapshot,
                 c.quantity, c.selling_unit,
                 c.ordering_mode, c.actual_weight_kg
            FROM public.sales_order_line_components c
           WHERE public.is_supplier_for_sales_order_line_component(c.id)
        ) q
    ), '[]'::jsonb),
    'component_units', COALESCE((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.sales_order_line_component_id, q.unit_number)
        FROM (
          SELECT u.id, u.sales_order_line_component_id, u.unit_number,
                 u.actual_weight_kg
            FROM public.sales_order_line_component_units u
           WHERE EXISTS (
             SELECT 1
               FROM public.sales_order_line_components c
              WHERE c.id = u.sales_order_line_component_id
                AND public.is_supplier_for_sales_order_line_component(c.id)
           )
        ) q
    ), '[]'::jsonb),
    'preparation_answers', COALESCE((
      SELECT jsonb_agg(to_jsonb(q))
        FROM (
          SELECT a.sales_order_line_id,
                 a.sales_order_line_component_id,
                 a.sales_order_line_component_unit_id,
                 a.option_code,
                 a.answer_value,
                 a.question_code
            FROM public.sales_order_preparation_answers a
           WHERE (
             a.sales_order_line_component_id IS NULL
             AND public.is_supplier_for_sales_order_line(a.sales_order_line_id)
           ) OR (
             a.sales_order_line_component_id IS NOT NULL
             AND public.is_supplier_for_sales_order_line_component(
               a.sales_order_line_component_id
             )
           )
        ) q
    ), '[]'::jsonb),
    'fulfilments', COALESCE((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.sales_order_id, q.supplier_id)
        FROM (
          SELECT f.sales_order_id, f.supplier_id, f.status,
                 f.packing_started_at, f.packing_completed_at
            FROM public.sales_order_supplier_fulfilments f
            JOIN public.supplier_users su ON su.supplier_id = f.supplier_id
           WHERE su.user_id = auth.uid() AND su.active
        ) q
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_get_canonical_work()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_get_canonical_work()
  TO authenticated;

-- Admin callers retain the full Product row, including procurement fields,
-- through an authorization-checked function rather than a shared role grant.
CREATE OR REPLACE FUNCTION public.admin_list_products(p_product_id text DEFAULT NULL)
RETURNS SETOF public."Product"
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.*
    FROM public."Product" p
   WHERE p_product_id IS NULL OR p.id = p_product_id
   ORDER BY p.is_pinned DESC, p.display_order ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_products(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_products(text)
  TO authenticated;

-- Preserve an explicit admin-only read path for every retired reporting view.
CREATE OR REPLACE FUNCTION public.admin_read_legacy_financial_report(p_report_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  CASE p_report_name
    WHEN 'order_item_flat' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_result FROM public.vw_order_item_flat r;
    WHEN 'sales_summary_daily' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_result FROM public.vw_sales_summary_daily r;
    WHEN 'sales_summary_monthly' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_result FROM public.vw_sales_summary_monthly r;
    WHEN 'product_profit' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_result FROM public.vw_product_profit r;
    WHEN 'supplier_profit' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_result FROM public.vw_supplier_profit r;
    WHEN 'category_profit' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_result FROM public.vw_category_profit r;
    WHEN 'top_products' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_result FROM public.vw_top_products r;
    WHEN 'top_profit_products' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_result FROM public.vw_top_profit_products r;
    WHEN 'order_profit' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_result FROM public.vw_order_profit r;
    WHEN 'dashboard_kpis' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_result FROM public.vw_dashboard_kpis r;
    WHEN 'sales_summary_monthly_materialized' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_result FROM public.mv_sales_summary_monthly r;
    ELSE
      RAISE EXCEPTION 'Unsupported financial report.' USING ERRCODE = '22023';
  END CASE;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_read_legacy_financial_report(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_read_legacy_financial_report(text)
  TO authenticated;

COMMIT;
