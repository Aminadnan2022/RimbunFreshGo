/*
# Orders Own The Supplier Dispatch Workflow

## Summary
Moves the supplier packing / dispatch workflow from `delivery_batches` onto the
`"Orders"` table. Each order now owns its own operational timestamps, so the
supplier queues never depend on whether a delivery batch has been created.

Delivery batches remain ONLY for logistics grouping and reporting (batch CRUD,
manifests, rider assignment). They no longer control supplier queues, packing,
or customer order progress.

## Orders columns (all ADD COLUMN IF NOT EXISTS)
- `packing_started_at`           timestamptz — supplier hit "Start Packing"
- `packing_completed_at`         timestamptz — supplier hit "Preparation Completed"
- `supplier_dispatch_started_at` timestamptz — Lalamove booked / dispatch started
- `supplier_dispatch_completed_at` timestamptz — arrived at FreshGo hub
- `ready_for_rider_at`           timestamptz — admin marked the order ready for the rider
- `lalamove_tracking_url`        text        — Lalamove tracking link
- `booking_reference`            text        — optional Lalamove booking reference
- `lalamove_booked_at`           timestamptz — when the booking was saved

## New RPCs (SECURITY DEFINER, supplier/admin, idempotent)
- `supplier_start_packing_order(p_order_id)`        -> packing_started_at
- `supplier_complete_packing_order(p_order_id)`     -> packing_completed_at
- `supplier_book_lalamove_order(p_order_id, tracking_url, booking_reference)`
  -> lalamove_tracking_url, booking_reference, lalamove_booked_at,
     supplier_dispatch_started_at
- `admin_confirm_order_arrival(p_order_id)`          -> supplier_dispatch_completed_at
- `admin_mark_order_ready_for_rider(p_order_id)`     -> ready_for_rider_at on the order

The batch-level RPCs created by 20260812000000 are intentionally LEFT in place so
the existing admin batch UI (DeliveryBatchesManager / ManifestView) keeps working,
but the supplier flow no longer calls them.
*/

-- 1. Orders columns
ALTER TABLE public."Orders"
  ADD COLUMN IF NOT EXISTS packing_started_at           timestamptz,
  ADD COLUMN IF NOT EXISTS packing_completed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS supplier_dispatch_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS supplier_dispatch_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_for_rider_at           timestamptz,
  ADD COLUMN IF NOT EXISTS lalamove_tracking_url        text,
  ADD COLUMN IF NOT EXISTS booking_reference            text,
  ADD COLUMN IF NOT EXISTS lalamove_booked_at           timestamptz;

-- 2. Supplier: start packing an order
CREATE OR REPLACE FUNCTION public.supplier_start_packing_order(p_order_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  started timestamptz;
  paid    text;
BEGIN
  IF NOT (public.is_supplier() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT packing_started_at, payment_status INTO started, paid
  FROM public."Orders" WHERE id = p_order_id;
  IF paid IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF started IS NOT NULL THEN RETURN; END IF;
  IF paid <> 'Paid' THEN
    RAISE EXCEPTION 'Order must be Paid before packing.';
  END IF;
  UPDATE public."Orders"
     SET packing_started_at = now(), updated_at = now()
   WHERE id = p_order_id;
END;
$$;

-- 3. Supplier: complete packing for an order
CREATE OR REPLACE FUNCTION public.supplier_complete_packing_order(p_order_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  started   timestamptz;
  completed timestamptz;
BEGIN
  IF NOT (public.is_supplier() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT packing_started_at, packing_completed_at INTO started, completed
  FROM public."Orders" WHERE id = p_order_id;
  IF started IS NULL THEN RAISE EXCEPTION 'Order not found or packing not started.'; END IF;
  IF completed IS NOT NULL THEN RETURN; END IF;
  UPDATE public."Orders"
     SET packing_completed_at = now(), updated_at = now()
   WHERE id = p_order_id;
END;
$$;

-- 4. Supplier: book Lalamove for an order (tracking URL must start with https:// )
CREATE OR REPLACE FUNCTION public.supplier_book_lalamove_order(
  p_order_id bigint, p_tracking_url text, p_booking_reference text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  packed_at timestamptz;
BEGIN
  IF NOT (public.is_supplier() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_tracking_url IS NULL OR trim(p_tracking_url) = '' THEN
    RAISE EXCEPTION 'Tracking URL is required.';
  END IF;
  IF p_tracking_url NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Tracking URL must start with https://';
  END IF;

  SELECT packing_completed_at INTO packed_at
  FROM public."Orders" WHERE id = p_order_id;
  IF packed_at IS NULL THEN
    RAISE EXCEPTION 'Packing must be completed before booking Lalamove.';
  END IF;

  UPDATE public."Orders"
     SET lalamove_tracking_url = trim(p_tracking_url),
         booking_reference    = nullif(p_booking_reference, ''),
         lalamove_booked_at   = now(),
         supplier_dispatch_started_at = now(),
         updated_at           = now()
   WHERE id = p_order_id;
END;
$$;

-- 5. Admin: confirm order arrived at the FreshGo hub
CREATE OR REPLACE FUNCTION public.admin_confirm_order_arrival(p_order_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tracking text;
  arrived  timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT lalamove_tracking_url, supplier_dispatch_completed_at INTO tracking, arrived
  FROM public."Orders" WHERE id = p_order_id;
  IF tracking IS NULL THEN RAISE EXCEPTION 'Order not found or no tracking URL.'; END IF;
  IF arrived IS NOT NULL THEN RETURN; END IF;
  IF trim(tracking) = '' THEN
    RAISE EXCEPTION 'Cannot confirm arrival without a Lalamove tracking URL.';
  END IF;
  UPDATE public."Orders"
     SET supplier_dispatch_completed_at = now(), updated_at = now()
   WHERE id = p_order_id;
END;
$$;

-- 6. Admin: mark order ready for the rider (logistics-only marker)
CREATE OR REPLACE FUNCTION public.admin_mark_order_ready_for_rider(p_order_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  arrived timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT supplier_dispatch_completed_at INTO arrived
  FROM public."Orders" WHERE id = p_order_id;
  IF arrived IS NULL THEN
    RAISE EXCEPTION 'Order must have arrived at the hub first.';
  END IF;

  UPDATE public."Orders"
     SET ready_for_rider_at = now(), updated_at = now()
   WHERE id = p_order_id;
END;
$$;

-- 7. Grant execution: suppliers + admins for the supplier RPCs; admin RPCs are admin-only
REVOKE EXECUTE ON FUNCTION public.supplier_start_packing_order(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supplier_complete_packing_order(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supplier_book_lalamove_order(bigint, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_confirm_order_arrival(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_mark_order_ready_for_rider(bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.supplier_start_packing_order(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_complete_packing_order(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_book_lalamove_order(bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_order_arrival(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_order_ready_for_rider(bigint) TO authenticated;