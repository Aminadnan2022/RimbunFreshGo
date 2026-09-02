-- Guest checkout must be able to list active community delivery points before
-- anonymous authentication is created. Inactive points remain hidden by RLS.

BEGIN;

ALTER TABLE public.delivery_points ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.delivery_points TO anon, authenticated;

DROP POLICY IF EXISTS "customer_select_active_delivery_points" ON public.delivery_points;
CREATE POLICY "customer_select_active_delivery_points"
  ON public.delivery_points
  FOR SELECT
  TO anon, authenticated
  USING (active = true);

COMMIT;
