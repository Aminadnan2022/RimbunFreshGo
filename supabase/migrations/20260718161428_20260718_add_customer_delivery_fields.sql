-- Add apartment, house_unit, pickup_location to Orders
ALTER TABLE "Orders"
  ADD COLUMN IF NOT EXISTS apartment        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS house_unit       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pickup_location  text NOT NULL DEFAULT '';

-- Add apartment, house_unit, pickup_location to customer_profiles
ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS apartment        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS house_unit       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pickup_location  text NOT NULL DEFAULT '';

-- Seed initial pickup locations into site_settings
INSERT INTO site_settings (key, value)
VALUES (
  'pickup_locations',
  '["Delivery to Lobby A Rimbun","Delivery to Lobby B Rimbun","Delivery to Security House Zamrud Blok E","Delivery to Meja depan Surau Zamrud CD","Delivery to Meja depan Zaeem Mart Zamrud Blok AB","Delivery to Lobby A Mutiara","Delivery to Lobby B Mutiara","Delivery to Lobby C Mutiara","Delivery to Security House Emas"]'
)
ON CONFLICT (key) DO NOTHING;
