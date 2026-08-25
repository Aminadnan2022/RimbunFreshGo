BEGIN;

-- Family Combo storefront is public.
-- Anonymous visitors may only read combos that are currently live.
GRANT SELECT ON TABLE public.combos TO anon, authenticated;

DROP POLICY IF EXISTS "public_select_active_combos" ON public.combos;

CREATE POLICY "public_select_active_combos"
ON public.combos
FOR SELECT
TO anon
USING (
  active = true
  AND lifecycle_status = 'active'
);

COMMIT;
