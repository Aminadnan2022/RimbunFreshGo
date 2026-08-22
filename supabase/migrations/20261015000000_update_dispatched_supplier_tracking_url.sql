-- Allow an admin to add, replace, or clear the supplier-to-hub tracking link
-- after dispatch, without changing the locked manifest or dispatch lifecycle.
-- A batch that has reached FreshGo Hub remains immutable because this link must
-- never be re-exposed alongside final-mile rider tracking.

CREATE OR REPLACE FUNCTION public.admin_update_canonical_supplier_delivery_batch_tracking_url(
  p_batch_id uuid,
  p_tracking_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_tracking_url text := NULLIF(btrim(COALESCE(p_tracking_url, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF v_tracking_url IS NOT NULL AND v_tracking_url NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Tracking URL must start with https://';
  END IF;

  SELECT status
  INTO v_status
  FROM public.canonical_supplier_delivery_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier delivery batch not found.';
  END IF;

  IF v_status <> 'dispatched' THEN
    RAISE EXCEPTION 'Tracking links may only be changed while the supplier batch is dispatched.';
  END IF;

  UPDATE public.canonical_supplier_delivery_batches
  SET
    tracking_url = v_tracking_url,
    updated_at = now()
  WHERE id = p_batch_id;
END;
$$;

REVOKE EXECUTE
ON FUNCTION public.admin_update_canonical_supplier_delivery_batch_tracking_url(uuid, text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.admin_update_canonical_supplier_delivery_batch_tracking_url(uuid, text)
TO authenticated;
