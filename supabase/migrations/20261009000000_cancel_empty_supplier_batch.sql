-- Allow admins to cancel an empty canonical supplier delivery batch.
--
-- Only an empty draft batch may be cancelled.
-- Historical batches are preserved for audit instead of being deleted.

CREATE OR REPLACE FUNCTION public.admin_cancel_empty_canonical_supplier_delivery_batch(
  p_batch_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT status
  INTO v_status
  FROM public.canonical_supplier_delivery_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier delivery batch not found.';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft supplier delivery batches may be cancelled.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.canonical_supplier_delivery_batch_orders
    WHERE batch_id = p_batch_id
  ) THEN
    RAISE EXCEPTION 'Supplier delivery batch must be empty before cancellation.';
  END IF;

  UPDATE public.canonical_supplier_delivery_batches
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    updated_at = now()
  WHERE id = p_batch_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.admin_cancel_empty_canonical_supplier_delivery_batch(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.admin_cancel_empty_canonical_supplier_delivery_batch(uuid)
TO authenticated;