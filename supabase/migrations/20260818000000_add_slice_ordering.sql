-- Slice-Based Ordering (sold by slices, priced per kg, weighed by supplier)
--
-- Adds a new ordering method "By Slice (Supplier Weighs)" to the Product table.
--   - ordering_mode = 'slice'      (reuse existing TEXT column; no enum change)
--   - Slice products are priced PER KG (Product.price = RM per kg).
--   - Customers pick a slice count; the supplier weighs the slices; the final
--     price is computed by the system as: actual_weight x price.
--   - Order items carry slice_quantity / slice_instruction in the JSONB snapshot
--     on Orders.order_items (no order_items table exists).

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS slice_unit TEXT NOT NULL DEFAULT 'slice',
  ADD COLUMN IF NOT EXISTS min_slice INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_slice INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS default_slice INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS slice_increment INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS slice_instruction TEXT NOT NULL DEFAULT '';

-- Constraint: min_slice >= 1, max_slice >= min_slice, increment >= 1.
ALTER TABLE "Product"
  DROP CONSTRAINT IF EXISTS chk_product_slice_limits;
ALTER TABLE "Product"
  ADD CONSTRAINT chk_product_slice_limits CHECK (
    min_slice >= 1 AND max_slice >= min_slice AND slice_increment >= 1
  );