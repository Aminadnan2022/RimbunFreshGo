/*
# Delivery Points extra fields (Phase 1b)

## Summary
Extends `delivery_points` with the fields the Admin Delivery Points manager
needs today and that Phase 2 (maps / delivery notes) will rely on:

- `area`         (text)      — Area / residence label (e.g. "Residensi Rimbun")
- `pickup_notes` (text)      — optional handover instructions (Phase 2 uses)
- `latitude`     (numeric)   — optional GPS latitude (Phase 2 uses; not used now)
- `longitude`    (numeric)   — optional GPS longitude (Phase 2 uses; not used now)

No maps are implemented in this phase — the coordinates are only stored.

## Backfill
Existing seed points get a sensible area based on their name so the new
"Area" column is not blank. Everything else stays NULL / empty until edited.

Idempotent: all ALTERs are ADD COLUMN IF NOT EXISTS and the backfill only
touches rows with an empty area.
*/

ALTER TABLE public.delivery_points
  ADD COLUMN IF NOT EXISTS area         text,
  ADD COLUMN IF NOT EXISTS pickup_notes text,
  ADD COLUMN IF NOT EXISTS latitude     numeric(10, 8),
  ADD COLUMN IF NOT EXISTS longitude    numeric(11, 8);

-- Backfill area for existing seed points (only where currently empty).
UPDATE public.delivery_points
SET area = CASE
  WHEN name ILIKE '%Rimbun%'  THEN 'Residensi Rimbun'
  WHEN name ILIKE '%Mutiara%' THEN 'Residensi Mutiara'
  WHEN name ILIKE '%Zamrud%'  THEN 'Residensi Zamrud'
  WHEN name ILIKE '%Emas%'    THEN 'Residensi Emas'
  ELSE ''
END
WHERE area IS NULL OR area = '';
