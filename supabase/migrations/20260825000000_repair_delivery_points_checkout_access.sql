/*
# Repair delivery-point checkout read access

The checkout client reads `delivery_points` with `active = true`.  The
delivery-points management migration already defines the intended RLS model,
but a test project can retain an older table grant/policy state when that
migration was not fully applied.

This forward-only repair restores the intended boundary:
- any authenticated customer may SELECT active points only;
- rider/admin policies from the management migration continue to provide
  their broader reads;
- no customer INSERT, UPDATE, or DELETE policy is created.
*/

ALTER TABLE public.delivery_points ENABLE ROW LEVEL SECURITY;

-- RLS policies do not replace PostgreSQL table privileges.
GRANT SELECT ON TABLE public.delivery_points TO authenticated;

DROP POLICY IF EXISTS "customer_select_active_delivery_points" ON public.delivery_points;
CREATE POLICY "customer_select_active_delivery_points" ON public.delivery_points
  FOR SELECT TO authenticated
  USING (active = true);

-- Preserve the management policy: admins and riders may read inactive points.
DROP POLICY IF EXISTS "select_delivery_points" ON public.delivery_points;
CREATE POLICY "select_delivery_points" ON public.delivery_points
  FOR SELECT TO authenticated
  USING (public.is_delivery_rider() OR public.is_admin());
