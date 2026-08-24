/*
  Standard handover instruction for residences without a drop-off table.

  Preserve any note an administrator has already written, while ensuring the
  existing Emas and Parkland points give customers the correct instruction.
*/

UPDATE public.delivery_points
SET
  pickup_notes = 'Please come down to collect your order; the delivery rider will wait in the vehicle until you arrive for handover.',
  updated_at = now()
WHERE
  (COALESCE(area, '') ILIKE '%Emas%'
    OR COALESCE(name, '') ILIKE '%Emas%'
    OR COALESCE(area, '') ILIKE '%Parkland%'
    OR COALESCE(name, '') ILIKE '%Parkland%')
  AND COALESCE(btrim(pickup_notes), '') = '';
