/*
# Customer Live Tracking — helper RPC

## Summary
Connects the existing Customer Order Tracking page to the Delivery Batch and
Delivery Assignment modules WITHOUT duplicating any status columns.

- Order status (`delivery_status`, `delivered_at`) lives on "Orders".
- Delivery progress (`status`, `lalamove_tracking_url`, `hub_name`) lives on
  `delivery_batches` (already readable by authenticated customers).
- The assigned rider for a day lives in `delivery_assignments` (rider/admin only,
  no customer policy).

This migration adds ONE SECURITY DEFINER RPC that resolves the rider's display
name for a delivery date. The customer may only query the date they actually
have an order on (checked against `Orders.user_id`), so no internal rider data
leaks to arbitrary users.

No tables, columns, or status fields are created.
*/

-- Resolve the assigned rider's name for a delivery date.
-- Returns NULL when no rider is assigned or the caller has no order that day.
-- The caller's order date is resolved via delivery_batches (Orders.delivery_date
-- no longer exists; the batch owns the date).
CREATE OR REPLACE FUNCTION public.tracking_rider_name(p_delivery_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rider_name text;
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1
      FROM "Orders" o
      JOIN public.delivery_batches db ON db.id = o.delivery_batch_id
      WHERE o.user_id = auth.uid()
        AND db.delivery_date = p_delivery_date
    )
    OR public.is_admin()
    OR public.is_delivery_rider()
  ) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    NULLIF(au.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(au.raw_user_meta_data ->> 'name', ''),
    au.email
  )
  INTO rider_name
  FROM public.delivery_assignments da
  JOIN auth.users au ON au.id = da.rider_id
  WHERE da.delivery_date = p_delivery_date
  ORDER BY da.id
  LIMIT 1;

  RETURN rider_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tracking_rider_name(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tracking_rider_name(date) TO authenticated;