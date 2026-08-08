/*
# Delivery Points Management (Phase 1)

## Summary
Replaces the Pickup Location concept with a first-class `delivery_points`
table (the Delivery Rider module created this table earlier with
`location`/`method`/`maps_query`; this migration rebuilds it to the real
management model).

## New/changed table: delivery_points
- `id`             bigint identity PK (kept)
- `name`           (text, UNIQUE)  — the visible Delivery Point name
- `delivery_fee`   (numeric)       — fee charged at checkout (e.g. 2 = RM2)
- `delivery_method`(enum)          — Lobby Collection | Security Collection
                                     | Customer Come Down | Doorstep Delivery
- `display_order`  (int)          — ordering shown to checkout / riders
- `active`         (bool)         — disabled points are hidden from checkout
- `created_at` / `updated_at`

The old `location` / `method` / `maps_query` columns and Google-Maps seed are
removed (this phase has NO Google Maps / Lalamove / distance / optimisation).

## Orders snapshot columns
- `delivery_point_name` (text) — snapshot of the chosen point at order time
- `delivery_method`     (text) — snapshot of the handover instruction
- (`delivery_fee` already exists; it is the snapshot of the point's fee)
Orders keep writing `pickup_location` as a backward-compatible backfill so
existing views keep working.

## RLS
- authenticated customers may SELECT rows where `active = true` (checkout)
- riders + admins may SELECT all rows; admins full CRUD.

## Seed
Six default points (RM2 each) matching the phase-1 specification.

Idempotent: the table is rebuilt with DROP TABLE IF EXISTS; enum creation is
guarded; all ADD COLUMN are IF NOT EXISTS.
*/

-- 1. delivery_method enum (guarded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_method') THEN
    CREATE TYPE public.delivery_method AS ENUM (
      'Lobby Collection',
      'Security Collection',
      'Customer Come Down',
      'Doorstep Delivery'
    );
  END IF;
END
$$;

-- 2. Rebuild delivery_points to the real management schema.
-- Nothing else references this table by FK, and the previous seed rows are
-- intentionally replaced by the phase-1 default points.
DROP TABLE IF EXISTS public.delivery_points;

CREATE TABLE public.delivery_points (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            text NOT NULL UNIQUE,
  delivery_fee    numeric(10, 2) NOT NULL DEFAULT 2,
  delivery_method public.delivery_method NOT NULL DEFAULT 'Customer Come Down',
  display_order   int NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_points ENABLE ROW LEVEL SECURITY;

-- Seed (Phase-1 specification): 6 default points, RM2 each
INSERT INTO public.delivery_points (name, delivery_fee, delivery_method, display_order, active) VALUES
  ('Rimbun Lobby A',           2, 'Lobby Collection',     1, true),
  ('Rimbun Lobby B',           2, 'Lobby Collection',     2, true),
  ('Mutiara Lobby A',          2, 'Lobby Collection',     3, true),
  ('Mutiara Lobby B',          2, 'Lobby Collection',     4, true),
  ('Zamrud Security House',    2, 'Security Collection',  5, true),
  ('Emas Security Gate',       2, 'Customer Come Down',   6, true)
ON CONFLICT (name) DO NOTHING;

-- 3. RLS policies
-- Customers (any authenticated user) can read ACTIVE points for checkout.
DROP POLICY IF EXISTS "customer_select_active_delivery_points" ON public.delivery_points;
CREATE POLICY "customer_select_active_delivery_points" ON public.delivery_points
  FOR SELECT TO authenticated
  USING (active = true);

-- Riders + admins can read all points.
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

-- 4. Orders snapshot columns
ALTER TABLE "Orders"
  ADD COLUMN IF NOT EXISTS delivery_point_name text,
  ADD COLUMN IF NOT EXISTS delivery_method     text;

-- 5. Backfill snapshots for existing orders from pickup_location.
UPDATE "Orders"
SET
  delivery_point_name = COALESCE(NULLIF(pickup_location, ''), NULL),
  delivery_method = CASE
    WHEN pickup_location ILIKE '%Lobby%'    THEN 'Lobby Collection'
    WHEN pickup_location ILIKE '%Security%' THEN 'Security Collection'
    ELSE 'Customer Come Down'
  END
WHERE delivery_point_name IS NULL;