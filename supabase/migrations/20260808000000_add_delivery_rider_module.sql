/*
# Delivery Rider Module

## Summary
Adds a first-class Delivery Rider role and the supporting schema so that riders
can run an efficient delivery round and admins can manage deliveries + riders.

## New Function
- `public.is_delivery_rider()` — SECURITY DEFINER helper that returns true when
  the calling user has role = 'delivery_rider' in user_roles. Mirrors
  is_admin() / is_supplier().

## Changes to existing table: Orders
### New columns
- `delivery_date`   (date, nullable)     — the actual calendar date of the delivery run
- `delivery_status` (text, default 'pending') — 'pending' | 'arrived' | 'delivered'
- `delivered_at`    (timestamptz, nullable)   — when the order was marked delivered
- `delivered_by`    (uuid, nullable, FK auth.users) — which rider marked it delivered

`delivery_date` is computed automatically on INSERT from `delivery_slot` (the
lowercase weekday) + `created_at`, matching the next-occurrence logic used by
Checkout. Existing rows are backfilled with the same rule.

### Capacity enforcement
A BEFORE INSERT trigger (`enforce_order_capacity`) computes `delivery_date` and
rejects the insert when that date already has >= `max_orders_per_day` orders.
`max_orders_per_day` is a JSONB string row in `site_settings` (default 20).
This closes the delivery slot automatically at checkout without modifying the
customer checkout flow.

## New Tables
### delivery_points
Maps each pickup/delivery location to its handover method + a Google Maps query.
- `location`   (text, PK)   — matches Orders.pickup_location / site_settings pickup_locations
- `method`     (text)       — Lobby Collection | Security Collection | Customer Come Down | Doorstep Delivery
- `maps_query` (text)       — query passed to Google Maps search
Seeded from the default pickup locations; admins can edit in Delivery Settings.

### delivery_assignments
Assigns rider(s) to a specific delivery date. A delivery day only appears for a
rider when they are assigned to it.
- `delivery_date` (date)
- `rider_id`      (uuid, FK auth.users)
- UNIQUE (delivery_date, rider_id)

## New RPC
- `public.rider_update_delivery_status(order_id, status)` — SECURITY DEFINER.
  Riders (and admins) may move an order from pending -> arrived -> delivered.
  Only the delivery columns are written; payment/order data is never touched by
  riders. Riders get no direct UPDATE policy on Orders.

## RLS
- Orders:    `rider_select_orders` — riders can SELECT all orders (their round).
- delivery_points:      riders + admins SELECT, admins full CRUD.
- delivery_assignments: riders SELECT own rows, admins full CRUD.

## Notes
1. user_roles.role has no CHECK constraint, so 'delivery_rider' inserts work
   without a schema change.
2. The capacity trigger runs as table owner (bypasses RLS) and reads
   site_settings directly, so it is safe even for anon/authenticated inserts.
3. Idempotent: all ADD COLUMN / CREATE TABLE / CREATE POLICY are guarded.
*/

-- 1. is_delivery_rider() helper
CREATE OR REPLACE FUNCTION public.is_delivery_rider()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE id = auth.uid() AND role = 'delivery_rider'
  );
$$;

-- 2. New columns on Orders
ALTER TABLE "Orders"
  ADD COLUMN IF NOT EXISTS delivery_date   date,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS delivered_at    timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for "today's deliveries" queries
DROP INDEX IF EXISTS idx_orders_delivery_date;
CREATE INDEX idx_orders_delivery_date ON "Orders" (delivery_date);

-- 3. max_orders_per_day setting (JSONB string, default 20)
INSERT INTO site_settings (key, value, updated_at)
VALUES ('max_orders_per_day', '"20"', now())
ON CONFLICT (key) DO NOTHING;

-- 4. delivery_points table + seed
CREATE TABLE IF NOT EXISTS public.delivery_points (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location   text NOT NULL UNIQUE,
  method     text NOT NULL DEFAULT 'Customer Come Down',
  maps_query text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_points ENABLE ROW LEVEL SECURITY;

-- Seed from the default pickup locations (best-effort method inference)
INSERT INTO public.delivery_points (location, method, maps_query)
SELECT
  loc,
  CASE
    WHEN loc ILIKE '%Lobby%' THEN 'Lobby Collection'
    WHEN loc ILIKE '%Security%' THEN 'Security Collection'
    ELSE 'Customer Come Down'
  END AS method,
  loc AS maps_query
FROM (
  SELECT unnest(ARRAY[
    'Delivery to Lobby A Rimbun',
    'Delivery to Lobby B Rimbun',
    'Delivery to Security House Zamrud Blok E',
    'Delivery to Meja depan Surau Zamrud CD',
    'Delivery to Meja depan Zaeem Mart Zamrud Blok AB',
    'Delivery to Lobby A Mutiara',
    'Delivery to Lobby B Mutiara',
    'Delivery to Lobby C Mutiara',
    'Delivery to Security House Emas'
  ]) AS loc
) s
ON CONFLICT (location) DO NOTHING;

-- 5. delivery_assignments table
CREATE TABLE IF NOT EXISTS public.delivery_assignments (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_date date NOT NULL,
  rider_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_assignments_date_rider_key UNIQUE (delivery_date, rider_id)
);

ALTER TABLE public.delivery_assignments ENABLE ROW LEVEL SECURITY;

-- 6. Capacity trigger on Orders
CREATE OR REPLACE FUNCTION public.enforce_order_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_dow    int;
  diff          int;
  computed_date date;
  max_orders    int;
  cnt           int;
BEGIN
  IF NEW.delivery_date IS NULL THEN
    target_dow := CASE lower(NEW.delivery_slot)
      WHEN 'sunday'    THEN 0
      WHEN 'monday'    THEN 1
      WHEN 'tuesday'   THEN 2
      WHEN 'wednesday' THEN 3
      WHEN 'thursday'  THEN 4
      WHEN 'friday'    THEN 5
      WHEN 'saturday'  THEN 6
      ELSE 3 END;
    diff := (target_dow - EXTRACT(dow FROM COALESCE(NEW.created_at, now()))::int + 7) % 7;
    computed_date := (COALESCE(NEW.created_at, now())::date) + diff;
    NEW.delivery_date := computed_date;
  ELSE
    computed_date := NEW.delivery_date;
  END IF;

  SELECT COALESCE(NULLIF(value #>> '{}', ''), '20')::int
  INTO max_orders
  FROM site_settings
  WHERE key = 'max_orders_per_day';

  IF max_orders IS NULL OR max_orders <= 0 THEN
    max_orders := 20;
  END IF;

  SELECT count(*) INTO cnt FROM "Orders" WHERE delivery_date = computed_date;
  IF cnt >= max_orders THEN
    RAISE EXCEPTION 'This delivery slot is already full. Please choose another delivery day.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_order_capacity_trigger ON "Orders";
CREATE TRIGGER enforce_order_capacity_trigger
  BEFORE INSERT ON "Orders"
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_capacity();

-- 7. Backfill delivery_date for existing orders (same next-occurrence rule)
UPDATE "Orders"
SET delivery_date = (
  (created_at::date) + (
    ((
      CASE lower(delivery_slot)
        WHEN 'sunday'    THEN 0
        WHEN 'monday'    THEN 1
        WHEN 'tuesday'   THEN 2
        WHEN 'wednesday' THEN 3
        WHEN 'thursday'  THEN 4
        WHEN 'friday'    THEN 5
        WHEN 'saturday'  THEN 6
        ELSE 3
      END
    ) - EXTRACT(dow FROM created_at)::int + 7) % 7)
   )
WHERE delivery_date IS NULL;
-- 8. RPC: rider marks arrival/delivery (admin allowed too)
CREATE OR REPLACE FUNCTION public.rider_update_delivery_status(p_order_id bigint, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur text;
BEGIN
  IF NOT (public.is_delivery_rider() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_status NOT IN ('arrived', 'delivered') THEN
    RAISE EXCEPTION 'Invalid delivery status';
  END IF;

  SELECT delivery_status INTO cur FROM "Orders" WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF cur = 'delivered' THEN
    RAISE EXCEPTION 'Order is already delivered';
  END IF;

  IF p_status = 'arrived' THEN
    IF cur = 'pending' THEN
      UPDATE "Orders" SET delivery_status = 'arrived', delivered_by = auth.uid() WHERE id = p_order_id;
    END IF;
  ELSIF p_status = 'delivered' THEN
    UPDATE "Orders" SET delivery_status = 'delivered', delivered_at = now(), delivered_by = auth.uid() WHERE id = p_order_id;
  END IF;
END;
$$;

-- 9. RLS policies
-- Orders: riders can read all orders (their round)
DROP POLICY IF EXISTS "rider_select_orders" ON "Orders";
CREATE POLICY "rider_select_orders" ON "Orders"
  FOR SELECT TO authenticated
  USING (public.is_delivery_rider());

-- delivery_points: riders + admins can read
DROP POLICY IF EXISTS "select_delivery_points" ON public.delivery_points;
CREATE POLICY "select_delivery_points" ON public.delivery_points
  FOR SELECT TO authenticated
  USING (public.is_delivery_rider() OR public.is_admin());

DROP POLICY IF EXISTS "admin_insert_delivery_points" ON public.delivery_points;
CREATE POLICY "admin_insert_delivery_points" ON public.delivery_points
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_delivery_points" ON public.delivery_points;
CREATE POLICY "admin_update_delivery_points" ON public.delivery_points
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_delivery_points" ON public.delivery_points;
CREATE POLICY "admin_delete_delivery_points" ON public.delivery_points
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- delivery_assignments: rider reads own assignments
DROP POLICY IF EXISTS "rider_select_assignments" ON public.delivery_assignments;
CREATE POLICY "rider_select_assignments" ON public.delivery_assignments
  FOR SELECT TO authenticated
  USING (public.is_delivery_rider() AND rider_id = auth.uid());

DROP POLICY IF EXISTS "admin_select_assignments" ON public.delivery_assignments;
CREATE POLICY "admin_select_assignments" ON public.delivery_assignments
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_assignments" ON public.delivery_assignments;
CREATE POLICY "admin_insert_assignments" ON public.delivery_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_assignments" ON public.delivery_assignments;
CREATE POLICY "admin_delete_assignments" ON public.delivery_assignments
  FOR DELETE TO authenticated
  USING (public.is_admin());
