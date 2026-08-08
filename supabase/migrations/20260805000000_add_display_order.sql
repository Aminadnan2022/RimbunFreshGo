-- Add `display_order` to Product and combos for admin drag-and-drop sorting.
-- Existing rows are backfilled with sequential values (0, 1, 2, ...) preserving
-- their current display order so the customer website order is unchanged until
-- the admin re-sorts.
--
-- Products: backfilled by created_at then id (stable, deterministic).
-- Combos:   backfilled by featured DESC then created_at DESC (mirrors the
--           current featured-first, newest-first display order).

-- ── Product ──────────────────────────────────────────────────────────────
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

UPDATE "Product" p
SET display_order = r.rn
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) - 1 AS rn
  FROM "Product"
) r
WHERE p.id = r.id;

CREATE INDEX IF NOT EXISTS idx_product_display_order ON "Product" (display_order);

-- ── Combos ───────────────────────────────────────────────────────────────
ALTER TABLE combos ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

UPDATE combos c
SET display_order = r.rn
FROM (
  SELECT id, row_number() OVER (ORDER BY featured DESC, created_at DESC, id ASC) - 1 AS rn
  FROM combos
) r
WHERE c.id = r.id;

CREATE INDEX IF NOT EXISTS idx_combos_display_order ON combos (display_order);
