-- Phase 4C.6
-- Customer-safe canonical supplier fulfilment tracking.
--
-- Customers do not receive direct SELECT access to supplier fulfilment rows.
-- This RPC exposes only the aggregate timestamps needed by their own order
-- tracking timeline.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_sales_order_supplier_fulfilment_tracking(
  p_sales_order_id uuid
)
RETURNS TABLE (
  packing_started_at timestamptz,
  packing_completed_at timestamptz,
  supplier_count integer,
  packing_supplier_count integer,
  packed_supplier_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
BEGIN
  SELECT *
    INTO v_order
  FROM public.sales_orders
  WHERE id = p_sales_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF NOT (
    v_order.customer_id = auth.uid()
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'Order access denied.';
  END IF;

  RETURN QUERY
  SELECT
    MIN(f.packing_started_at) FILTER (
      WHERE f.packing_started_at IS NOT NULL
    ) AS packing_started_at,

    CASE
      WHEN COUNT(*) > 0
       AND COUNT(*) FILTER (WHERE f.status = 'packed') = COUNT(*)
      THEN MAX(f.packing_completed_at)
      ELSE NULL
    END AS packing_completed_at,

    COUNT(*)::integer AS supplier_count,

    COUNT(*) FILTER (
      WHERE f.status = 'packing'
    )::integer AS packing_supplier_count,

    COUNT(*) FILTER (
      WHERE f.status = 'packed'
    )::integer AS packed_supplier_count

  FROM public.sales_order_supplier_fulfilments f
  WHERE f.sales_order_id = p_sales_order_id;
END;
$$;

REVOKE EXECUTE
ON FUNCTION public.get_sales_order_supplier_fulfilment_tracking(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.get_sales_order_supplier_fulfilment_tracking(uuid)
TO authenticated;

COMMIT;
