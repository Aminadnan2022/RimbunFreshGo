/*
  Restore delivery-point deletion for admins.

  PostgREST checks PostgreSQL table privileges before evaluating RLS. The
  existing admin-only DELETE policy therefore could not run when the
  authenticated role lacked DELETE on delivery_points.
*/

ALTER TABLE public.delivery_points ENABLE ROW LEVEL SECURITY;

-- This only makes DELETE eligible for authenticated requests; RLS below
-- still restricts the operation to users whose profile passes is_admin().
GRANT DELETE ON TABLE public.delivery_points TO authenticated;

DROP POLICY IF EXISTS "admin_delete_delivery_points" ON public.delivery_points;
CREATE POLICY "admin_delete_delivery_points" ON public.delivery_points
  FOR DELETE TO authenticated
  USING (public.is_admin());
