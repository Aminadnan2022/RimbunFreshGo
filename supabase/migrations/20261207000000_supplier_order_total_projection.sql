-- Expose only the customer-facing order total needed by the supplier workflow.
-- Procurement cost, profit, margin, delivery-fee breakdowns, and line prices
-- remain outside the supplier projection.

CREATE OR REPLACE FUNCTION public.supplier_get_order_totals()
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
    'canonical', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'total', COALESCE(o.final_total, o.estimated_total, o.total)
        )
        ORDER BY o.created_at DESC
      )
      FROM public.sales_orders o
      WHERE public.is_supplier_for_sales_order(o.id)
    ), '[]'::jsonb),
    'legacy', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('id', o.id, 'total', o.total)
        ORDER BY o.created_at DESC
      )
      FROM public."Orders" o
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_get_order_totals()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_get_order_totals()
  TO authenticated;
