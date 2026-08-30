-- CONTRACT: remove the obsolete raw supplier and shared financial read paths
-- after the frontend has cut over to the safe interfaces introduced by the
-- preceding EXPAND migration.

BEGIN;

-- RLS is row-level rather than column-level. Suppliers must no longer read raw
-- canonical snapshots once supplier_get_canonical_work() is in production.
DROP POLICY IF EXISTS phase4c1_sales_orders_supplier_select
  ON public.sales_orders;
DROP POLICY IF EXISTS phase4c1_sales_order_lines_supplier_select
  ON public.sales_order_lines;
DROP POLICY IF EXISTS phase4c1_sales_order_line_units_supplier_select
  ON public.sales_order_line_units;
DROP POLICY IF EXISTS phase4c1_sales_order_line_components_supplier_select
  ON public.sales_order_line_components;
DROP POLICY IF EXISTS phase4c1_sales_order_line_component_units_supplier_select
  ON public.sales_order_line_component_units;
DROP POLICY IF EXISTS phase4c1_sales_order_preparation_answers_supplier_select
  ON public.sales_order_preparation_answers;

-- Keep the customer/admin-safe shared columns while removing cost-bearing
-- columns from the authenticated role. Admins use admin_get_sales_order_lines().
REVOKE SELECT ON TABLE public.sales_order_lines FROM authenticated;
GRANT SELECT (
  id, sales_order_id, line_number, product_id, product_version_id, combo_id,
  combo_version_id, item_kind, product_snapshot, quantity,
  estimated_weight_kg, actual_weight_kg, selling_unit, unit_selling_price,
  supplier_id, discount_amount, line_total, created_at, ordering_mode,
  estimated_line_total, final_line_total, finalised_at
) ON TABLE public.sales_order_lines TO authenticated;

REVOKE SELECT ON TABLE public.sales_order_line_components FROM authenticated;
GRANT SELECT (
  id, sales_order_line_id, combo_version_item_id, component_number,
  product_id, product_version_id, product_snapshot, quantity, selling_unit,
  ordering_mode, estimated_weight_kg, actual_weight_kg, supplier_id,
  finalised_at, created_at
) ON TABLE public.sales_order_line_components TO authenticated;

-- Product remains storefront-readable, but procurement columns do not.
REVOKE SELECT ON TABLE public."Product" FROM anon, authenticated;
GRANT SELECT (
  id, name, name_ms, category, price, unit, price_note, weight, quantity,
  description, long_description, image, images, freshness,
  preparation_options, vendor_id, vendor_name, tags, is_popular,
  ordering_mode, selling_unit, display_order, is_pinned, slice_unit,
  min_slice, max_slice, default_slice, slice_increment, slice_instruction,
  created_at
) ON TABLE public."Product" TO anon, authenticated;

-- Legacy reports expose supplier cost, gross profit, margin, or equivalent
-- internal financial data. Admins retain access through the guarded RPC.
REVOKE SELECT ON TABLE
  public.vw_order_item_flat,
  public.vw_sales_summary_daily,
  public.vw_sales_summary_monthly,
  public.vw_product_profit,
  public.vw_supplier_profit,
  public.vw_category_profit,
  public.vw_top_products,
  public.vw_top_profit_products,
  public.vw_order_profit,
  public.vw_dashboard_kpis,
  public.mv_sales_summary_monthly
FROM anon, authenticated;

COMMIT;
