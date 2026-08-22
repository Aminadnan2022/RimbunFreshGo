-- Return a customer-safe supplier-to-hub tracking URL only while at least one
-- of the customer's canonical supplier batches is still dispatched. Once all
-- batches reach the hub, the customer timeline advances and this URL must not
-- remain available alongside final-mile rider tracking.

CREATE OR REPLACE FUNCTION public.get_sales_order_canonical_delivery_tracking(
  p_sales_order_id uuid
)
RETURNS TABLE (
  supplier_dispatch_started_at timestamptz,
  supplier_dispatch_completed_at timestamptz,
  tracking_url text,
  batch_count integer,
  dispatched_batch_count integer,
  arrived_batch_count integer
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
    MIN(b.dispatched_at) FILTER (
      WHERE b.status IN ('dispatched', 'arrived_hub')
    ),

    CASE
      WHEN COUNT(*) > 0
       AND COUNT(*) FILTER (WHERE b.status = 'arrived_hub') = COUNT(*)
      THEN MAX(b.arrived_hub_at)
      ELSE NULL
    END,

    (
      SELECT b2.tracking_url
      FROM public.canonical_supplier_delivery_batch_orders bo2
      JOIN public.canonical_supplier_delivery_batches b2
        ON b2.id = bo2.batch_id
      WHERE bo2.sales_order_id = p_sales_order_id
        AND b2.status = 'dispatched'
        AND b2.tracking_url IS NOT NULL
      ORDER BY b2.dispatched_at DESC
      LIMIT 1
    ),

    COUNT(*)::integer,

    COUNT(*) FILTER (
      WHERE b.status IN ('dispatched', 'arrived_hub')
    )::integer,

    COUNT(*) FILTER (
      WHERE b.status = 'arrived_hub'
    )::integer

  FROM public.canonical_supplier_delivery_batch_orders bo
  JOIN public.canonical_supplier_delivery_batches b
    ON b.id = bo.batch_id
  WHERE bo.sales_order_id = p_sales_order_id
    AND b.status <> 'cancelled';
END;
$$;
