/*
# Recreate Product table with full schema + seed catalog

## Summary
Drops the existing empty "Product" table and recreates it with a complete
schema that covers both the user-requested columns and all fields from the
Product TypeScript interface. Then seeds all 28 products from the hardcoded
catalog so the app can read from Supabase instead of a TypeScript file.

## Table: Product
Columns:
- `id`                   — Text primary key (e.g. 'broiler-chicken'), matches app
- `name`                 — Product name in English (text, not null)
- `name_ms`              — Product name in Malay (text, not null)
- `category`             — chicken | fish | prawns | squid | combo (text, not null)
- `price`                — Unit price in RM (numeric(10,2), not null)
- `unit`                 — Unit of sale, e.g. "per kg" (text, not null)
- `price_note`            — Optional pricing caveat (text, nullable)
- `weight`               — Optional weight description (text, nullable)
- `quantity`              — Stock quantity on hand (integer, not null, default 0)
- `description`          — Short card description (text, not null)
- `long_description`     — Full detail page description (text, not null)
- `image`                — Primary image URL (text, not null)
- `images`               — Gallery URLs (text[], default '{}')
- `freshness`            — available | limited | sold-out (text, not null, default 'available')
- `preparation_options`  — Allowed prep options (text[], default '{}')
- `vendor_id`            — Vendor ID, e.g. 'vendor-hassan' (text, not null)
- `vendor_name`          — Human-readable vendor name (text, not null)
- `tags`                 — Search/filter tags (text[], default '{}')
- `is_popular`           — Show in "Popular" section (boolean, default false)
- `created_at`           — Row creation timestamp (timestamptz, default now())

## Security
- RLS enabled on `Product`.
- 4 CRUD policies scoped to `anon, authenticated` (no-auth app, public catalog).

## Notes
1. Table was confirmed empty (0 rows) before dropping — no data loss.
2. `id` is TEXT (not uuid) because the app uses string slugs like 'siakap'.
3. All 28 products from src/data/products.ts are seeded via INSERT.
4. Idempotent: DROP + CREATE + INSERT ON CONFLICT DO NOTHING.
*/

DROP TABLE IF EXISTS "Product";

CREATE TABLE "Product" (
  id                    text PRIMARY KEY,
  name                  text NOT NULL,
  name_ms               text NOT NULL,
  category              text NOT NULL CHECK (category IN ('chicken', 'fish', 'prawns', 'squid', 'combo')),
  price                 numeric(10,2) NOT NULL,
  unit                  text NOT NULL,
  price_note            text,
  weight                text,
  quantity              integer NOT NULL DEFAULT 0,
  description           text NOT NULL,
  long_description      text NOT NULL,
  image                 text NOT NULL,
  images                text[] NOT NULL DEFAULT '{}',
  freshness             text NOT NULL DEFAULT 'available' CHECK (freshness IN ('available', 'limited', 'sold-out')),
  preparation_options   text[] NOT NULL DEFAULT '{}',
  vendor_id             text NOT NULL,
  vendor_name           text NOT NULL,
  tags                  text[] NOT NULL DEFAULT '{}',
  is_popular            boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_category ON "Product" (category);
CREATE INDEX IF NOT EXISTS idx_product_vendor_id ON "Product" (vendor_id);

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_products" ON "Product";
CREATE POLICY "anon_select_products" ON "Product" FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_products" ON "Product";
CREATE POLICY "anon_insert_products" ON "Product" FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_products" ON "Product";
CREATE POLICY "anon_update_products" ON "Product" FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_products" ON "Product";
CREATE POLICY "anon_delete_products" ON "Product" FOR DELETE
  TO anon, authenticated USING (true);

-- ── Seed all 28 products ──────────────────────────────────────────────────
-- Image URLs
-- Chicken
INSERT INTO "Product" (id, name, name_ms, category, price, unit, weight, description, long_description, image, images, freshness, preparation_options, vendor_id, vendor_name, tags, is_popular)
VALUES
('broiler-chicken', 'Whole Broiler Chicken', 'Ayam Broiler (Utuh)', 'chicken', 19.00, 'per bird', '1.5–1.7 kg',
 'Freshly slaughtered broiler chicken. Choose your preferred cut — from whole bird to 16 pieces.',
 'Our broiler chickens are slaughtered fresh every morning at our Halal-certified partner farm in Rawang, Selangor, never chilled for more than a few hours before delivery. Each bird weighs between 1.5 and 1.7 kg and arrives cleaned and ready to cook. Choose to receive it whole, cleaned, or have it cut into 4, 12, or 16 pieces — ideal for curries, grilling, roasting, or family-style cooking. No hormones, no additives.',
 'https://images.pexels.com/photos/10842248/pexels-photo-10842248.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/10842248/pexels-photo-10842248.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/6210876/pexels-photo-6210876.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','cut4','cut12','cut16'], 'vendor-hassan', 'Hassan Poultry Farm',
 ARRAY['fresh-daily','halal','no-hormones'], true)
ON CONFLICT (id) DO NOTHING;

-- Fish
INSERT INTO "Product" (id, name, name_ms, category, price, unit, price_note, description, long_description, image, images, freshness, preparation_options, vendor_id, vendor_name, tags, is_popular)
VALUES
('bawal-emas', 'Bawal Emas (Golden Pomfret)', 'Bawal Emas', 'fish', 32.00, 'per ekor', 'RM32/kg',
 'Golden pomfret — prized for its rich, sweet flesh. Excellent steamed or fried.',
 'Bawal Emas, or Golden Pomfret, is one of the most sought-after table fish in Malaysia. Its firm, white flesh has a naturally sweet flavour with minimal bones. Best steamed whole with soy, ginger, and spring onion, or deep-fried until golden. Priced at RM32/kg — final price adjusted to actual fish weight at delivery.',
 'https://images.pexels.com/photos/31534520/pexels-photo-31534520.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/31534520/pexels-photo-31534520.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/18907099/pexels-photo-18907099.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['premium','pomfret','sweet-flesh'], true),
('bawal-hitam', 'Bawal Hitam (Black Pomfret)', 'Bawal Hitam', 'fish', 27.00, 'per ekor', 'RM27/kg',
 'Black pomfret with firm, flavourful flesh. Great for curry or grilling.',
 'Bawal Hitam (Black Pomfret) has a more pronounced sea flavour than its golden cousin — slightly firmer and excellent in curry, assam pedas, or grilled over charcoal. A popular affordable choice for family meals. Priced at RM27/kg; final price based on actual fish weight.',
 'https://images.pexels.com/photos/31534520/pexels-photo-31534520.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/31534520/pexels-photo-31534520.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['pomfret','curry','affordable'], false),
('bawal-putih', 'Bawal Putih (White Pomfret)', 'Bawal Putih', 'fish', 34.00, 'per ekor', 'RM34/kg',
 'Premium white pomfret. Delicate, near-boneless — the finest pomfret variety.',
 'Bawal Putih (White Pomfret or Silver Pomfret) is considered the finest of the pomfret family in Malaysia. Its flesh is delicate, lightly sweet, and nearly boneless — making it a favourite for steaming and light broths. Priced at RM34/kg; final price based on actual fish weight.',
 'https://images.pexels.com/photos/31534520/pexels-photo-31534520.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/31534520/pexels-photo-31534520.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/18907099/pexels-photo-18907099.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['premium','white-pomfret','delicate'], true),
('cencaru', 'Cencaru (Torpedo Scad)', 'Ikan Cencaru', 'fish', 10.00, 'per ekor', 'RM10/kg',
 'Classic kampung fish. Perfect stuffed with sambal and fried crispy.',
 'Cencaru is a beloved affordable Malaysian table fish packed with omega-3s. Star of the famous ikan cencaru sumbat sambal, it''s also great grilled, fried whole, or in a sour assam broth. Priced at RM10/kg; final price based on actual fish weight.',
 'https://images.pexels.com/photos/5948977/pexels-photo-5948977.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/5948977/pexels-photo-5948977.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/10112465/pexels-photo-10112465.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['affordable','kampung','omega-3'], true),
('jenahak-potong', 'Jenahak Potong (Red Snapper — Cut)', 'Jenahak Potong', 'fish', 45.00, 'per ekor', 'RM45/kg',
 'Premium red snapper, pre-cut — restaurant-quality, ready to cook.',
 'Jenahak Potong refers to larger red snapper cut into steaks — the same premium fish used in fine dining, now delivered fresh to your door. Rich, firm flesh ideal for grilling, baking, or a luxurious curry. Priced at RM45/kg.',
 'https://images.pexels.com/photos/31024081/pexels-photo-31024081.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/31024081/pexels-photo-31024081.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['premium','snapper','cut'], false),
('jenahak-b', 'Jenahak B (Red Snapper B)', 'Jenahak B', 'fish', 37.00, 'per ekor', 'RM37/kg',
 'Medium-grade red snapper. Flavourful and versatile for everyday cooking.',
 'Jenahak B is a medium-sized red snapper — firm, flavourful flesh with a mild sweetness. Excellent steamed whole, baked, or in a clear soup. A more affordable entry point to the premium snapper family. Priced at RM37/kg.',
 'https://images.pexels.com/photos/31024081/pexels-photo-31024081.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/31024081/pexels-photo-31024081.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['snapper','versatile','everyday'], false),
('kerisi-a', 'Kerisi A (Pink Snapper)', 'Ikan Kerisi A', 'fish', 16.00, 'per ekor', 'RM16/kg',
 'Sweet pink snapper. Family favourite with fine, delicate flesh.',
 'Kerisi (Pink Snapper or Threadfin Bream) is adored for its sweet, fine-textured flesh and relatively small bones. Grade-A batch means consistently sized, fresh fish. Try it steamed, deep-fried crispy, or in a light lemak broth. Priced at RM16/kg.',
 'https://images.pexels.com/photos/31024081/pexels-photo-31024081.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/31024081/pexels-photo-31024081.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['pink-snapper','family-friendly','delicate'], true),
('mabong-a', 'Mabong A (Indian Mackerel)', 'Ikan Mabong A', 'fish', 19.00, 'per ekor', 'RM19/kg',
 'Fatty, flavourful Indian mackerel. Rich in omega-3 and excellent fried.',
 'Mabong (Indian Mackerel) is one of Malaysia''s most nutritious everyday fish — loaded with omega-3 fatty acids. Its bold, oily flavour stands up beautifully to rempah-based curries, sambal, or a simple garlic stir-fry. Grade A means larger, plumper fish. Priced at RM19/kg.',
 'https://images.pexels.com/photos/9143774/pexels-photo-9143774.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/9143774/pexels-photo-9143774.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/2980246/pexels-photo-2980246.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['mackerel','omega-3','flavourful'], false),
('merah-potong', 'Merah Potong (Red Grouper — Cut)', 'Ikan Merah Potong', 'fish', 45.00, 'per ekor', 'RM45/kg',
 'Premium red grouper cut into steaks. Restaurant-grade, fresh daily.',
 'Ikan Merah Potong — red grouper steaks — is a highly prized restaurant-quality fish. The flesh is thick, firm, and naturally sweet. Available pre-cut for convenience; perfect for steaming, frying, or baking in a claypot. Priced at RM45/kg.',
 'https://images.pexels.com/photos/31024081/pexels-photo-31024081.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/31024081/pexels-photo-31024081.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['premium','grouper','restaurant-grade'], false),
('merah-b', 'Merah B (Red Grouper B)', 'Ikan Merah B', 'fish', 39.00, 'per ekor', 'RM39/kg',
 'Red grouper — firm, sweet flesh. A premium fish at a friendlier price.',
 'Ikan Merah B is a medium-grade red grouper — still premium quality, just a smaller or slightly less uniform cut. Excellent for steaming whole, making a clear soup, or frying with rempah. Priced at RM39/kg.',
 'https://images.pexels.com/photos/31024081/pexels-photo-31024081.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/31024081/pexels-photo-31024081.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['grouper','sweet-flesh','steaming'], false),
('nyok', 'Nyok (Indian Halibut)', 'Ikan Nyok', 'fish', 30.00, 'per ekor', 'RM30/kg',
 'Flat, firm-fleshed halibut. Excellent fried whole or in a rich curry.',
 'Nyok (Indian Halibut or flounder) is a flat-bodied, thick-fleshed fish with a mild, clean flavour. It fries beautifully to a crispy exterior while staying moist inside. Also excellent in assam pedas or mild coconut curry. Priced at RM30/kg.',
 'https://images.pexels.com/photos/31534520/pexels-photo-31534520.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/31534520/pexels-photo-31534520.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/18907099/pexels-photo-18907099.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['halibut','flat-fish','crispy-fried'], false),
('pelaling', 'Pelaling (Yellowstripe Scad)', 'Ikan Pelaling', 'fish', 16.00, 'per ekor', 'RM16/kg',
 'Affordable everyday fish. Tasty fried whole or in a light curry.',
 'Pelaling (Yellowstripe Scad) is a small, affordable everyday fish with a pleasant mild flavour. Often fried whole until crispy and served with sambal belacan, or used in light soups. A household staple across Malaysia. Priced at RM16/kg.',
 'https://images.pexels.com/photos/5948977/pexels-photo-5948977.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/5948977/pexels-photo-5948977.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/10112465/pexels-photo-10112465.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['scad','affordable','everyday'], false),
('parang', 'Parang (Wolf Herring)', 'Ikan Parang', 'fish', 15.00, 'per kg', 'Harga mengikut pasaran',
 'Elongated silver herring. Popular for otah-otah and fish paste dishes.',
 'Ikan Parang (Wolf Herring) is a long, silver-bodied fish most famous as the main ingredient in traditional otah-otah and kerisik-paste dishes. Its oily, fine-textured meat blends beautifully with spice pastes. Sold by the kilogram; price follows market rate and will be confirmed at time of order.',
 'https://images.pexels.com/photos/9143774/pexels-photo-9143774.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/9143774/pexels-photo-9143774.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['herring','otah-otah','paste-fish'], false),
('siakap', 'Siakap (Asian Sea Bass)', 'Ikan Siakap', 'fish', 11.00, 'per ekor', 'RM11/ekor',
 'Fresh siakap, delivered the day it leaves the water. A Malaysian household favourite.',
 'Siakap (Asian Sea Bass) is one of Malaysia''s most prized and versatile table fish. Firm white flesh, naturally sweet, and adaptable to almost any cooking style — steamed with soy and ginger, grilled with sambal, in a light assam soup, or deep-fried. Delivered fresh the same day it leaves our partner farm. Fixed price RM11 per fish.',
 'https://images.pexels.com/photos/1023960/pexels-photo-1023960.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/1023960/pexels-photo-1023960.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['sea-bass','local','versatile'], true),
('selar', 'Selar (Oxeye Scad)', 'Ikan Selar', 'fish', 14.00, 'per ekor', 'RM14/kg',
 'Small round scad. Crispy fried whole or in asam pedas — simple and delicious.',
 'Ikan Selar is a small, round-bodied scad common across Malaysian waters. Its firm white flesh fries beautifully and tastes great with a sharp asam pedas. Often served whole — the crispy tail and fins are considered a delicacy by many. Priced at RM14/kg.',
 'https://images.pexels.com/photos/5948977/pexels-photo-5948977.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/5948977/pexels-photo-5948977.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/10112465/pexels-photo-10112465.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['scad','fried','everyday'], false),
('selar-kuning', 'Selar Kuning (Yellowstripe Trevally)', 'Ikan Selar Kuning', 'fish', 13.00, 'per ekor', 'RM13/kg',
 'Small fish with a vivid yellow stripe. Delicious fried or in soups.',
 'Selar Kuning (Yellowstripe Trevally) is distinguished by a bright yellow stripe along its silver body. Its flesh is slightly firmer than regular selar, with a more pronounced flavour. Great fried with turmeric, in a clear stock-based soup, or marinated and grilled. Priced at RM13/kg.',
 'https://images.pexels.com/photos/5948977/pexels-photo-5948977.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/5948977/pexels-photo-5948977.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/10112465/pexels-photo-10112465.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['trevally','yellow-stripe','soups'], false),
('sardin', 'Sardin (Indian Oil Sardine)', 'Ikan Sardin', 'fish', 14.00, 'per ekor', 'RM14/kg',
 'Fresh local sardines — not the canned kind. Grilled, fried, or curried.',
 'Fresh sardin (Indian Oil Sardine) is a world away from the canned version — rich, oily, and deeply flavourful. Grilled over charcoal with a squeeze of lime, fried with turmeric and chilli, or cooked in a robust tomato-based curry. An excellent source of omega-3s and calcium. Priced at RM14/kg.',
 'https://images.pexels.com/photos/10112464/pexels-photo-10112464.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/10112464/pexels-photo-10112464.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/6148977/pexels-photo-6148977.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['sardine','omega-3','fresh'], false),
('talapia-merah', 'Talapia Merah (Red Tilapia)', 'Ikan Talapia Merah', 'fish', 17.00, 'per ekor', 'RM17/kg',
 'Farm-fresh red tilapia. Mild, versatile, and great value for families.',
 'Talapia Merah (Red Tilapia) is a widely loved freshwater fish across Malaysia — mild-flavoured, easy to cook, and affordable. Excellent steamed with soy sauce, fried whole, or cooked in a clear herbal soup. Farm-raised fresh, delivered same day. Priced at RM17/kg.',
 'https://images.pexels.com/photos/8352786/pexels-photo-8352786.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/8352786/pexels-photo-8352786.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['tilapia','farm-fresh','mild'], false),
('tenggiri', 'Tenggiri (Spanish Mackerel)', 'Ikan Tenggiri', 'fish', 37.00, 'per ekor', 'RM37/kg',
 'Premium Spanish mackerel. Firm, almost boneless — ideal for steaks and curries.',
 'Tenggiri (Spanish Mackerel) is one of Malaysia''s most premium everyday fish — firm, near-boneless, and rich in flavour. Famous for its use in fish crackers and premium fish balls, but equally wonderful as thick steaks fried or in a spiced curry. Priced at RM37/kg.',
 'https://images.pexels.com/photos/9143774/pexels-photo-9143774.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/9143774/pexels-photo-9143774.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/2980246/pexels-photo-2980246.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['mackerel','premium','firm-flesh'], true),
('tenggiri-potong', 'Tenggiri Potong (Spanish Mackerel — Cut)', 'Tenggiri Potong', 'fish', 45.00, 'per ekor', 'RM45/kg',
 'Spanish mackerel pre-cut into thick steaks. Ready to cook straight away.',
 'Tenggiri Potong is Spanish Mackerel already cut into thick, even steaks — perfect for households who want zero prep work. The large, firm pieces hold their shape beautifully when fried, grilled, or added to a rich masak lemak. Priced at RM45/kg.',
 'https://images.pexels.com/photos/9143774/pexels-photo-9143774.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/9143774/pexels-photo-9143774.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['cleaned'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['mackerel','cut-steak','convenient'], false),
('tongkol-hitam', 'Tongkol Hitam (Frigate Tuna)', 'Tongkol Hitam', 'fish', 15.00, 'per ekor', 'RM15/kg',
 'Dark-fleshed tuna. Bold, robust flavour — excellent in sambal and curries.',
 'Tongkol Hitam (Frigate Tuna) has a darker, richer flesh than its paler cousin. Its bold flavour stands up to strongly spiced preparations — sambal, rendang, or a thick black-pepper sauce. A popular and very affordable tuna option. Priced at RM15/kg.',
 'https://images.pexels.com/photos/9143774/pexels-photo-9143774.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/9143774/pexels-photo-9143774.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['tuna','bold-flavour','sambal'], false),
('tongkol-putih', 'Tongkol Putih (Bullet Tuna)', 'Tongkol Putih', 'fish', 13.00, 'per ekor', 'RM13/kg',
 'Lighter-fleshed small tuna. Milder than tongkol hitam, great for nasi lemak sambal.',
 'Tongkol Putih (Bullet Tuna) has lighter, slightly milder flesh compared to tongkol hitam. It''s the fish behind some of Malaysia''s most iconic nasi lemak sambal ikan — firm, slightly oily, and deeply satisfying. Also good grilled or in a dry-fried sambal with shallots and chilli. Priced at RM13/kg.',
 'https://images.pexels.com/photos/2980246/pexels-photo-2980246.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/2980246/pexels-photo-2980246.jpeg?auto=compress&cs=tinysrgb=w=800','https://images.pexels.com/photos/9143774/pexels-photo-9143774.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned','descaled','gutted'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['tuna','nasi-lemak','sambal'], false),
('keli', 'Keli (Catfish)', 'Ikan Keli', 'fish', 9.00, 'per ekor', 'RM9/kg',
 'Fresh local catfish. Tender, flavourful, and incredibly affordable.',
 'Ikan Keli (Catfish) is one of Malaysia''s most affordable and nutritious freshwater fish. Its tender, slightly fatty flesh absorbs spice wonderfully — making it a standout in sambal keli, masak lemak, or deep-fried whole until crispy. Farm-raised locally and delivered fresh. At RM9/kg, it''s exceptional value.',
 'https://images.pexels.com/photos/23885137/pexels-photo-23885137.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/23885137/pexels-photo-23885137.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/8352786/pexels-photo-8352786.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned'], 'vendor-aminah', 'Aminah Seafood Trading',
 ARRAY['catfish','affordable','tender'], false)
ON CONFLICT (id) DO NOTHING;

-- Prawns
INSERT INTO "Product" (id, name, name_ms, category, price, unit, price_note, weight, description, long_description, image, images, freshness, preparation_options, vendor_id, vendor_name, tags, is_popular)
VALUES
('udang-a', 'Udang A (Grade A Prawns)', 'Udang A', 'prawns', 36.00, 'per kg', 'RM36/kg', '1 kg',
 'Premium grade-A prawns — large, plump, and sweet. Harvested fresh same morning.',
 'Udang A is our premium grade of freshwater and brackish prawns — the largest, most uniform batch we source each delivery day. Harvested the morning of your delivery from prawn farms in Perak and Selangor, never frozen. The shells are firm and bright, the flesh sweet and snappy — a hallmark of genuine freshness. Perfect for butter prawns, sambal udang, grilled whole, or simply steamed with garlic.',
 'https://images.pexels.com/photos/2714384/pexels-photo-2714384.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/2714384/pexels-photo-2714384.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/566344/pexels-photo-566344.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned'], 'vendor-razif', 'Razif Aqua & Marine',
 ARRAY['grade-a','premium','large','never-frozen'], true),
('udang-rencah', 'Udang Rencah (Mixed Small Prawns)', 'Udang Rencah', 'prawns', 19.00, 'per kg', 'RM19/kg', '1 kg',
 'Mixed small prawns — ideal for prawn noodles, curries, and sambals.',
 'Udang Rencah are smaller mixed prawns, fantastic value for dishes where size matters less than flavour. Their shells add incredible depth to prawn stock, noodle broths (mee udang), and spiced sambal bases. Fresh the same morning as delivery — never frozen. A kitchen staple for home cooks who want genuine prawn flavour without the premium price.',
 'https://images.pexels.com/photos/566344/pexels-photo-566344.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/566344/pexels-photo-566344.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/2714384/pexels-photo-2714384.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned'], 'vendor-razif', 'Razif Aqua & Marine',
 ARRAY['small-prawns','stock','curries','affordable'], false)
ON CONFLICT (id) DO NOTHING;

-- Squid
INSERT INTO "Product" (id, name, name_ms, category, price, unit, price_note, weight, description, long_description, image, images, freshness, preparation_options, vendor_id, vendor_name, tags, is_popular)
VALUES
('sotong-a', 'Sotong A (Grade A Squid)', 'Sotong A', 'squid', 37.00, 'per kg', 'RM37/kg', '1 kg',
 'Premium grade-A squid — firm tubes and tentacles, landed fresh daily.',
 'Sotong A is our grade-A squid — the largest, most uniform tubes from our day-boat catch. Landed fresh from the Strait of Malacca and South China Sea each morning. The flesh is firm, milky-white, and naturally sweet when cooked correctly. Ideal for sambal sotong, crispy fried calamari, black-ink pasta, or stuffed and baked whole. Best quality for presentation-worthy dishes.',
 'https://images.pexels.com/photos/9995821/pexels-photo-9995821.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/9995821/pexels-photo-9995821.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/30648997/pexels-photo-30648997.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned'], 'vendor-razif', 'Razif Aqua & Marine',
 ARRAY['grade-a','premium','squid','fresh'], true),
('sotong-kembang', 'Sotong Kembang (Cuttlefish)', 'Sotong Kembang', 'squid', 20.00, 'per kg', 'RM20/kg', '1 kg',
 'Fresh cuttlefish — meaty, thick-bodied, wonderful in dry curries and stir-fries.',
 'Sotong Kembang (Cuttlefish) is the rounder, flatter cousin of tube squid. Its body is thicker and meatier, making it especially satisfying in dry-style dishes. Absolutely delicious in a dry sambal hitam, a Nyonya-style kari sotong, or simply scored, marinated, and grilled over charcoal. Landed fresh daily from coastal boats. Exceptional value at RM20/kg.',
 'https://images.pexels.com/photos/30648997/pexels-photo-30648997.jpeg?auto=compress&cs=tinysrgb&w=800',
 ARRAY['https://images.pexels.com/photos/30648997/pexels-photo-30648997.jpeg?auto=compress&cs=tinysrgb&w=800','https://images.pexels.com/photos/9995821/pexels-photo-9995821.jpeg?auto=compress&cs=tinysrgb&w=800'],
 'available', ARRAY['whole','cleaned'], 'vendor-razif', 'Razif Aqua & Marine',
 ARRAY['cuttlefish','meaty','dry-curry','affordable'], false)
ON CONFLICT (id) DO NOTHING;
