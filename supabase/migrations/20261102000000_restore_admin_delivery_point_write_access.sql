/*
  Restore admin create/edit access for delivery points.

  RLS already limits INSERT and UPDATE to public.is_admin(). PostgreSQL table
  privileges are also required before PostgREST can evaluate those policies.
*/

ALTER TABLE public.delivery_points ENABLE ROW LEVEL SECURITY;

-- These grants only make the requests eligible for the RLS checks below.
GRANT INSERT, UPDATE ON TABLE public.delivery_points TO authenticated;

DROP POLICY IF EXISTS "admin_insert_delivery_points" ON public.delivery_points;
CREATE POLICY "admin_insert_delivery_points" ON public.delivery_points
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_delivery_points" ON public.delivery_points;
CREATE POLICY "admin_update_delivery_points" ON public.delivery_points
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
