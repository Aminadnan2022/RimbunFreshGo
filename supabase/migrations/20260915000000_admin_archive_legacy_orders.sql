-- Safe admin cancellation/archive for legacy Orders.
--
-- Orders that already have immutable preparation / sales snapshots must not
-- be physically deleted. Admin "delete" therefore becomes cancel + archive.
--
-- Historical preparation, sales and accounting data remain intact.

ALTER TABLE public."Orders"
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE INDEX IF NOT EXISTS idx_orders_active_archived
  ON public."Orders" (archived_at);

CREATE OR REPLACE FUNCTION public.admin_archive_order(
  p_order_id bigint,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_status text;
  v_order_status text;
  v_packing_started_at timestamptz;
  v_packing_completed_at timestamptz;
  v_dispatch_started_at timestamptz;
  v_dispatch_completed_at timestamptz;
  v_ready_for_rider_at timestamptz;
BEGIN
  ---------------------------------------------------------------------------
  -- Authorization
  ---------------------------------------------------------------------------
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  ---------------------------------------------------------------------------
  -- Lock and inspect the order.
  ---------------------------------------------------------------------------
  SELECT
    payment_status,
    lower(COALESCE(order_summary ->> 'status', '')),
    packing_started_at,
    packing_completed_at,
    supplier_dispatch_started_at,
    supplier_dispatch_completed_at,
    ready_for_rider_at
  INTO
    v_payment_status,
    v_order_status,
    v_packing_started_at,
    v_packing_completed_at,
    v_dispatch_started_at,
    v_dispatch_completed_at,
    v_ready_for_rider_at
  FROM public."Orders"
  WHERE id = p_order_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or already archived';
  END IF;

  ---------------------------------------------------------------------------
  -- Financially committed orders must remain visible/auditable.
  ---------------------------------------------------------------------------
  IF lower(COALESCE(v_payment_status, '')) = 'paid' THEN
    RAISE EXCEPTION 'Paid orders cannot be cancelled and archived';
  END IF;

  ---------------------------------------------------------------------------
  -- Do not archive orders already processed operationally.
  ---------------------------------------------------------------------------
  IF v_order_status IN (
    'completed',
    'fulfilled',
    'delivered'
  )
  OR v_packing_started_at IS NOT NULL
  OR v_packing_completed_at IS NOT NULL
  OR v_dispatch_started_at IS NOT NULL
  OR v_dispatch_completed_at IS NOT NULL
  OR v_ready_for_rider_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'Orders already being processed cannot be cancelled and archived';
  END IF;

  ---------------------------------------------------------------------------
  -- Remove transient delivery-batch association only.
  -- Historical order/preparation/sales records remain untouched.
  ---------------------------------------------------------------------------
  DELETE FROM public.delivery_batch_manifest
  WHERE order_id = p_order_id;

  ---------------------------------------------------------------------------
  -- Archive the legacy order.
  ---------------------------------------------------------------------------
  UPDATE public."Orders"
  SET
    archived_at = now(),
    archived_by = auth.uid(),
    cancellation_reason = NULLIF(trim(p_reason), '')
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.admin_archive_order(bigint, text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.admin_archive_order(bigint, text)
TO authenticated;
