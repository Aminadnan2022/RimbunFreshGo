/*
# Delivery Rider Dashboard Workflow (extends Delivery Batches)

## Summary
Drives the single-rider delivery workflow on top of the existing Delivery Batch
module. The rider opens the day's batch, starts delivery, works through stops
grouped by Delivery Point, marks each order Delivered, and the batch completes
automatically once every order in it is Delivered.

## Changes to `delivery_batches`
- New columns (ADD COLUMN IF NOT EXISTS):
  - `delivery_started_at` timestamptz — when the rider started the round
  - `completed_at`        timestamptz — when every order was Delivered
- Status CHECK now also allows `out_for_delivery`.
  (The other statuses are unchanged; admin CRUD is untouched.)

## New RPCs (SECURITY DEFINER)
- `rider_start_batch_delivery(p_batch_id)` — rider/admin. Only when the batch
  status is `arrived_at_hub` OR `ready_for_rider_at` is set. Sets status
  `out_for_delivery` and records `delivery_started_at` (kept on re-entry).
- `rider_complete_batch_if_done(p_batch_id)` — rider/admin. When every order
  assigned to the batch has `delivery_status = 'delivered'`, sets the batch to
  `completed` and records `completed_at`. No-op otherwise.

The existing per-order RPC `rider_update_delivery_status` moves an individual
order to `delivered`; nothing here modifies that function.

## RLS
No RLS changes: riders already have SELECT on `delivery_batches` (authenticated
read) and SELECT on all `"Orders"` via `rider_select_orders`. The RPCs are
SECURITY DEFINER and run as the owner.
*/

-- 1. New columns
ALTER TABLE public.delivery_batches
  ADD COLUMN IF NOT EXISTS delivery_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at        timestamptz;

-- 2. Allow 'out_for_delivery' in the status check
ALTER TABLE public.delivery_batches
  DROP CONSTRAINT IF EXISTS delivery_batches_status_check;
ALTER TABLE public.delivery_batches
  ADD CONSTRAINT delivery_batches_status_check
  CHECK (status IN (
    'pending','packing','awaiting_lalamove','in_transit_to_hub',
    'arrived_at_hub','out_for_delivery','completed','cancelled'
  ));

-- 3. Start delivery
CREATE OR REPLACE FUNCTION public.rider_start_batch_delivery(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_status  text;
  ready_at    timestamptz;
BEGIN
  IF NOT (public.is_delivery_rider() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT status, ready_for_rider_at INTO cur_status, ready_at
  FROM public.delivery_batches WHERE id = p_batch_id;
  IF cur_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF cur_status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'Batch is already finished';
  END IF;
  IF cur_status <> 'arrived_at_hub' AND ready_at IS NULL THEN
    RAISE EXCEPTION 'Batch is not ready for delivery yet';
  END IF;

  UPDATE public.delivery_batches
     SET status = 'out_for_delivery',
         delivery_started_at = COALESCE(delivery_started_at, now()),
         updated_at = now()
   WHERE id = p_batch_id;
END;
$$;

-- 4. Auto-complete the batch when every order is delivered
CREATE OR REPLACE FUNCTION public.rider_complete_batch_if_done(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_delivery_rider() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.delivery_batches b
     SET status = 'completed',
         completed_at = now(),
         updated_at   = now()
   WHERE b.id = p_batch_id
     AND b.status IN ('out_for_delivery', 'arrived_at_hub')
     AND (SELECT count(*) FROM "Orders" o WHERE o.delivery_batch_id = p_batch_id) > 0
     AND NOT EXISTS (
       SELECT 1 FROM "Orders" o
       WHERE o.delivery_batch_id = p_batch_id
         AND (o.delivery_status IS DISTINCT FROM 'delivered')
     );
END;
$$;