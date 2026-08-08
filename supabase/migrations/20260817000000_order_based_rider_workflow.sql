/*
# Order-Based Rider Workflow (extends Order-owned supplier dispatch)

## Summary
Moves the rider delivery workflow onto the `"Orders"` table so Orders is the
single source of truth. `delivery_batches` is no longer involved for rider
status, customer tracking, or supplier tracking.

## Workflow
- Rider sees incoming shipments (supplier_dispatch_started_at set, completed null).
- Rider confirms arrival -> `rider_receive_order_at_hub`: sets
  `supplier_dispatch_completed_at = now()` and `ready_for_rider_at = now()`.
- Rider starts delivery          -> `rider_start_order_delivery`: sets
  `delivery_status = 'out_for_delivery'`.
- Rider marks delivered          -> existing `rider_update_delivery_status`
  with p_status 'delivered' sets `delivery_status = 'delivered'`,
  `delivered_at = now()`, `delivered_by`.

## RLS
No update policy exists for riders on `"Orders"` (they only have
`rider_select_orders` for SELECT). All mutations go through these SECURITY
DEFINER RPCs which run as the table owner, guarded by `is_delivery_rider()` or
`is_admin()`.
*/

-- 1. Rider: confirm a dispatched shipment arrived at the FreshGo hub
CREATE OR REPLACE FUNCTION public.rider_receive_order_at_hub(p_order_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  started timestamptz;
  arrived timestamptz;
BEGIN
  IF NOT (public.is_delivery_rider() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT supplier_dispatch_started_at, supplier_dispatch_completed_at
    INTO started, arrived
  FROM public."Orders" WHERE id = p_order_id;
  IF started IS NULL THEN
    RAISE EXCEPTION 'Order is not dispatched yet.';
  END IF;
  IF arrived IS NOT NULL THEN RETURN; END IF; -- already received

  UPDATE public."Orders"
     SET supplier_dispatch_completed_at = now(),
         ready_for_rider_at = now(),
         updated_at = now()
   WHERE id = p_order_id;
END;
$$;

-- 2. Rider: start delivering an order (must be ready for the rider)
CREATE OR REPLACE FUNCTION public.rider_start_order_delivery(p_order_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ready  timestamptz;
  status text;
BEGIN
  IF NOT (public.is_delivery_rider() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT ready_for_rider_at, delivery_status INTO ready, status
  FROM public."Orders" WHERE id = p_order_id;
  IF ready IS NULL THEN
    RAISE EXCEPTION 'Order is not ready for delivery (must be received at the hub first).';
  END IF;
  IF status = 'delivered' THEN
    RAISE EXCEPTION 'Order is already delivered.';
  END IF;

  UPDATE public."Orders"
     SET delivery_status = 'out_for_delivery', updated_at = now()
   WHERE id = p_order_id;
END;
$$;

-- 3. Allow 'delivered' (and keep the rider's existing arrival fn intact).
--    rider_update_delivery_status already accepts 'delivered'.

REVOKE EXECUTE ON FUNCTION public.rider_receive_order_at_hub(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rider_start_order_delivery(bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rider_receive_order_at_hub(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rider_start_order_delivery(bigint) TO authenticated;