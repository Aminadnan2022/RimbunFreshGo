-- Add configurable discount_percent to combos for the new pricing system.
-- price (combo price) and original_value (original price) are stored as-is;
-- discount_percent is persisted so the customer side never recalculates.

ALTER TABLE combos
  ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Backfill existing rows from current price/original_value so legacy data
-- shows a sensible discount on the customer side.
UPDATE combos
SET discount_percent = CASE
  WHEN original_value > 0 THEN ROUND((1 - price / original_value) * 100, 2)
  ELSE 0
END;
