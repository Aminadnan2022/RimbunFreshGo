/*
# Recreate Product table with requested columns

## Summary
The previous "Product" table (created in an earlier migration) had a different
column set and contained zero rows. This migration drops that empty table and
recreates it with the exact columns requested by the user. No data is lost
because the table was confirmed empty (0 rows) before dropping.

## New Table: Product
Columns:
- `product_id`           — UUID primary key (auto-generated)
- `product_name`          — Product name (text, not null)
- `product_category`      — Product category (text, not null)
- `product_price`         — Unit price in RM (numeric(10,2), not null)
- `product_unit`          — Unit of sale, e.g. "per kg" (text, not null)
- `product_quantity`      — Stock quantity on hand (integer, not null, default 0)
- `product_preparation`   — Preparation / processing options (text, nullable)
- `product_description`   — Product description (text, not null)
- `vendor_name`           — Name of the vendor supplying this product (text, not null)
- `freshness`             — Stock state: available, limited, sold-out (text, not null, default 'available')
- `image`                 — Product image URL (text, not null)
- `created_at`            — Row creation timestamp (timestamptz, default now())

## Security
- RLS enabled on `Product`.
- 4 CRUD policies scoped to `anon, authenticated` because this is a no-auth
  app and the catalog is intentionally public/shared data.

## Notes
1. The table was confirmed empty (0 rows) before dropping, so no data is lost.
2. `product_price` uses `numeric(10,2)` to avoid floating-point rounding on money.
3. `product_quantity` defaults to 0 so new rows start with zero stock.
4. `freshness` is CHECK-constrained to the three valid values the frontend uses.
5. Index added on `product_category` for fast shop-page filtering.
*/

DROP TABLE IF EXISTS "Product";

CREATE TABLE "Product" (
  product_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name           text NOT NULL,
  product_category       text NOT NULL,
  product_price          numeric(10,2) NOT NULL,
  product_unit           text NOT NULL,
  product_quantity       integer NOT NULL DEFAULT 0,
  product_preparation    text,
  product_description    text NOT NULL,
  vendor_name            text NOT NULL,
  freshness              text NOT NULL DEFAULT 'available' CHECK (freshness IN ('available', 'limited', 'sold-out')),
  image                  text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_category ON "Product" (product_category);

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
