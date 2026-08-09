-- Add selling_unit to Product table
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS selling_unit TEXT NOT NULL DEFAULT 'piece';

-- Populate selling_unit based on ordering_mode logic:
--   fixed_quantity  → piece  (broiler-chicken, siakap)
--   whole_or_weight → piece  (premium fish priced per kg but sold per piece)
--   weight_only     → kg     (fish, prawns, squid sold by weight)
UPDATE "Product" SET selling_unit = 'kg'   WHERE id IN (
  'cencaru', 'mabong-a', 'keli', 'nyok', 'pelaling', 'parang',
  'talapia-merah', 'tongkol-hitam', 'tongkol-putih',
  'selar', 'selar-kuning', 'sardin', 'kerisi-a',
  'udang-a', 'udang-rencah', 'sotong-a', 'sotong-kembang'
);

-- Migrate combo_items: drop quantity, add quantity_value + selling_unit
ALTER TABLE combo_items
  ADD COLUMN IF NOT EXISTS quantity_value DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS selling_unit TEXT NOT NULL DEFAULT 'piece';

-- Migrate existing rows: copy quantity → quantity_value
-- The legacy quantity column only exists on databases upgraded from an older
-- schema; fresh databases created by 20260730000001 never have it. Guard the
-- copy so it only runs when the column is actually present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'combo_items'
      AND column_name = 'quantity'
  ) THEN
    UPDATE combo_items SET quantity_value = quantity WHERE quantity IS NOT NULL;
  END IF;
END;
$$;

-- Drop the old INTEGER quantity column
ALTER TABLE combo_items DROP COLUMN IF EXISTS quantity;

-- Update seed combo_items with correct selling_unit
UPDATE combo_items SET selling_unit = 'piece' WHERE product_id IN ('broiler-chicken', 'siakap');
UPDATE combo_items SET selling_unit = 'kg'    WHERE product_id IN ('udang-a', 'cencaru');

-- Update udang-a to 0.5kg
UPDATE combo_items SET quantity_value = 0.5 WHERE product_id = 'udang-a' AND combo_id = 'family-combo';

-- Rebuild the combo price (58 = 19×1 + 11×1 + 36×0.5 + 10×1)
UPDATE combos SET original_value = 58, price = 35 WHERE id = 'family-combo';
