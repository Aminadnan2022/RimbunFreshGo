-- Add ordering_mode column to Product table
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS ordering_mode TEXT NOT NULL DEFAULT 'fixed_quantity';

-- Update existing products with appropriate ordering_mode
UPDATE "Product" SET ordering_mode = 'combo'             WHERE category = 'combo';
UPDATE "Product" SET ordering_mode = 'fixed_quantity'     WHERE category = 'chicken';
UPDATE "Product" SET ordering_mode = 'whole_or_weight'    WHERE id IN (
  'bawal-emas', 'bawal-hitam', 'bawal-putih',
  'jenahak-potong', 'jenahak-b',
  'tenggiri', 'tenggiri-potong',
  'merah-potong', 'merah-b',
  'siakap'
);
UPDATE "Product" SET ordering_mode = 'weight_only' WHERE ordering_mode = 'fixed_quantity' AND (
  id IN (
    'cencaru', 'mabong-a', 'keli', 'nyok', 'pelaling', 'parang',
    'talapia-merah', 'tongkol-hitam', 'tongkol-putih',
    'selar', 'selar-kuning', 'sardin', 'kerisi-a',
    'udang-a', 'udang-rencah', 'sotong-a', 'sotong-kembang'
  )
);
