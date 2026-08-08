-- Combo Packages: featured flag.
--
-- Multiple combos may be featured at the same time. There is NO restriction
-- that only one combo can be featured, and no unique constraint is created.

-- 1. Ensure the featured column exists. If it already exists this is a no-op.
ALTER TABLE combos
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;

-- 2. Supporting index for the featured lookup (non-unique).
CREATE INDEX IF NOT EXISTS idx_combos_featured_active
  ON combos (featured, active, updated_at DESC);
