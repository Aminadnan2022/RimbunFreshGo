/*
# Add customer & order detail columns to Orders table

## Summary
Adds all customer delivery information, item details, and financial summary
columns needed to store a complete order record from the Rimbun FreshGo app.

## Changes to existing table: Orders
### New columns added
- `full_name`       — Customer's full name (text, not null)
- `phone_number`    — Customer's phone number (text, not null)
- `email_address`   — Customer's email address (text, not null)
- `street_address`  — Delivery street address (text, not null)
- `postcode`        — 5-digit Malaysian postcode (text, not null)
- `city`            — Delivery city (text, not null)
- `state`           — Delivery state (text, not null, default 'Selangor')
- `order_notes`     — Optional customer notes / special requests (text, nullable)
- `item_options`    — Per-item preparation preferences as JSON array (jsonb, default '[]')
- `order_items`     — Full array of cart items (name, price, qty, image, etc.) as JSON (jsonb, default '[]')
- `delivery_slot`   — Selected delivery day: 'wednesday' or 'friday' (text, not null)
- `order_summary`   — Human-readable order summary / status timeline as JSON (jsonb, default '{}')
- `subtotal`        — Order subtotal before delivery fee, in RM (numeric(10,2), default 0)
- `delivery_fee`    — Delivery fee charged, in RM (numeric(10,2), default 0)
- `total`           — Grand total (subtotal + delivery_fee), in RM (numeric(10,2), default 0)

## Security
- RLS is already enabled on Orders.
- No policies existed; this migration adds 4 CRUD policies scoped to
  `anon, authenticated` because this app has no sign-in screen and the
  frontend uses only the anon key.

## Notes
1. All ADD COLUMN statements use IF NOT EXISTS so this migration is safe to re-run.
2. Columns that must always be present use NOT NULL with sensible defaults.
3. JSONB columns default to empty array/object so callers can append without
   checking for null.
4. Financial columns use numeric(10,2) to avoid floating-point rounding errors.
*/

-- ── New columns ──────────────────────────────────────────────────────────────

ALTER TABLE "Orders"
  ADD COLUMN IF NOT EXISTS full_name       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_number    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_address   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS street_address  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS postcode        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city            text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS state           text NOT NULL DEFAULT 'Selangor',
  ADD COLUMN IF NOT EXISTS order_notes     text,
  ADD COLUMN IF NOT EXISTS item_options    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS order_items     jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_slot   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS order_summary   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS subtotal        numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee    numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total           numeric(10,2) NOT NULL DEFAULT 0;

-- ── RLS policies (no-auth app — anon + authenticated) ────────────────────────

DROP POLICY IF EXISTS "anon_select_orders" ON "Orders";
CREATE POLICY "anon_select_orders" ON "Orders" FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_orders" ON "Orders";
CREATE POLICY "anon_insert_orders" ON "Orders" FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_orders" ON "Orders";
CREATE POLICY "anon_update_orders" ON "Orders" FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_orders" ON "Orders";
CREATE POLICY "anon_delete_orders" ON "Orders" FOR DELETE
  TO anon, authenticated USING (true);
