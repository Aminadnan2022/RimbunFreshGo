/*
# Supplier Dispatch Workflow (extends Delivery Batches)

## Summary
Adds supplier dispatch tracking to the existing `delivery_batches` module:

    Customer orders -> Supplier packs all orders -> completes packing
      -> books ONE Lalamove (tracking URL + booking ref)
      -> Lalamove delivers to FreshGo Hub
      -> Admin confirms arrival -> Ready For Rider

## Columns (all ADD COLUMN IF NOT EXISTS)
- `packing_started_at`   timestamptz — when the supplier hit "Start Packing"
- `packing_completed_at` timestamptz — when the supplier hit "Packing Completed"
- `lalamove_booked_at`   timestamptz — when the Lalamove booking was saved
- `hub_arrived_at`       timestamptz — when admin confirmed arrival at the hub
- `ready_for_rider_at`   timestamptz — when admin marked the batch ready for the
                                       delivery rider (status unchanged)
- `booking_reference`    text        — optional Lalamove booking reference

## New RPCs (SECURITY DEFINER, so suppliers may act without broad RLS UPDATE)
- `supplier_start_packing`       -> status 'packing',           sets packing_started_at
- `supplier_complete_packing`    -> status 'awaiting_lalamove', sets packing_completed_at
- `supplier_book_lalamove`       -> status 'in_transit_to_hub', sets lalamove_tracking_url,
                                    booking_reference, lalamove_booked_at
- `admin_confirm_hub_arrival`    -> status 'arrived_at_hub',    sets hub_arrived_at
- `admin_mark_ready_for_rider`   -> sets ready_for_rider_at (status unchanged)

State ordering is enforced inside the RPCs. All are idempotent.
*/

-- 1. New columns
ALTER TABLE public.delivery_batches
  ADD COLUMN IF NOT EXISTS packing_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS packing_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lalamove_booked_at   timestamptz,
  ADD COLUMN IF NOT EXISTS hub_arrived_at       timestamptz,
  ADD COLUMN IF NOT EXISTS ready_for_rider_at   timestamptz,
  ADD COLUMN IF NOT EXISTS booking_reference    text;

-- 2. Supplier: start packing
CREATE OR REPLACE FUNCTION public.supplier_start_packing(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_status text;
  started    timestamptz;
BEGIN
  IF NOT (public.is_supplier() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT status, packing_started_at INTO cur_status, started
  FROM public.delivery_batches WHERE id = p_batch_id;
  IF cur_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF started IS NOT NULL THEN RETURN; END IF; -- already started
  IF cur_status NOT IN ('pending','packing') THEN
    RAISE EXCEPTION 'Cannot start packing now.';
  END IF;
  UPDATE public.delivery_batches
     SET status = 'packing', packing_started_at = now(), updated_at = now()
   WHERE id = p_batch_id;
END;
$$;

-- 3. Supplier: complete packing
CREATE OR REPLACE FUNCTION public.supplier_complete_packing(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_status text;
  started    timestamptz;
  completed  timestamptz;
BEGIN
  IF NOT (public.is_supplier() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT status, packing_started_at, packing_completed_at
    INTO cur_status, started, completed
  FROM public.delivery_batches WHERE id = p_batch_id;
  IF cur_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF completed IS NOT NULL THEN RETURN; END IF;
  IF started IS NULL OR cur_status NOT IN ('packing', 'awaiting_lalamove') THEN
    RAISE EXCEPTION 'Packing must be started first.';
  END IF;
  UPDATE public.delivery_batches
     SET status = 'awaiting_lalamove', packing_completed_at = now(), updated_at = now()
   WHERE id = p_batch_id;
END;
$$;

-- 4. Supplier: book Lalamove (tracking URL must start with https:// )
CREATE OR REPLACE FUNCTION public.supplier_book_lalamove(
  p_batch_id uuid, p_tracking_url text, p_booking_reference text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_status    text;
  packed_at     timestamptz;
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

  SELECT status, packing_completed_at INTO cur_status, packed_at
  FROM public.delivery_batches WHERE id = p_batch_id;
  IF cur_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF packed_at IS NULL THEN
    RAISE EXCEPTION 'Packing must be completed before booking Lalamove.';
  END IF;

  UPDATE public.delivery_batches
     SET lalamove_tracking_url = trim(p_tracking_url),
         booking_reference    = nullif(p_booking_reference, ''),
         lalamove_booked_at   = now(),
         status               = 'in_transit_to_hub',
         updated_at           = now()
   WHERE id = p_batch_id;
END;
$$;

-- 5. Admin: confirm arrival at the hub
CREATE OR REPLACE FUNCTION public.admin_confirm_hub_arrival(p_batch_id uuid)
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

  SELECT lalamove_tracking_url, hub_arrived_at INTO tracking, arrived
  FROM public.delivery_batches WHERE id = p_batch_id;
  IF tracking IS NULL THEN RAISE EXCEPTION 'Batch not found or no tracking URL.'; END IF;
  IF arrived IS NOT NULL THEN RETURN; END IF;
  IF tracking IS NULL OR trim(tracking) = '' THEN
    RAISE EXCEPTION 'Cannot confirm arrival without a Lalamove tracking URL.';
  END IF;
  UPDATE public.delivery_batches
     SET status = 'arrived_at_hub', hub_arrived_at = now(), updated_at = now()
   WHERE id = p_batch_id;
END;
$$;

-- 6. Admin: mark ready for rider (status unchanged)
CREATE OR REPLACE FUNCTION public.admin_mark_ready_for_rider(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_status text;
  arrived    timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT status, hub_arrived_at INTO cur_status, arrived
  FROM public.delivery_batches WHERE id = p_batch_id;
  IF cur_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF arrived IS NULL OR cur_status <> 'arrived_at_hub' THEN
    RAISE EXCEPTION 'Batch must have arrived at the hub first.';
  END IF;
  UPDATE public.delivery_batches
     SET ready_for_rider_at = now(), updated_at = now()
   WHERE id = p_batch_id;
END;
$$;