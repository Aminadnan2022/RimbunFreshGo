/*
  TEST parity repair.  This migration is safe to run repeatedly on TEST.
  It contains no production project reference and no production data.

  IMPORTANT: apply only to jypujsyiecgcjtjrqjfx.  Production is read-only.
*/

-- PostgREST checks table privileges before RLS.  The prior policies alone
-- caused 42501 for delivery_batches and prevented service-role E2E fixtures.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.delivery_batches TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_batches TO service_role;

-- The reporting screen is admin-only; grant the role then let RLS enforce it.
GRANT SELECT ON public.historical_business_daily TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.historical_business_daily TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Reference-data access used by storefront/admin UI and test fixtures.
GRANT SELECT ON public."Product", public.combos, public.combo_items,
  public.delivery_points, public.site_settings TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public."Product", public.combos,
  public.combo_items, public.delivery_points, public.site_settings TO service_role;

-- Reassert the intended RLS policy for batch reads (idempotently).
ALTER TABLE public.delivery_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_delivery_batches" ON public.delivery_batches;
CREATE POLICY "read_delivery_batches" ON public.delivery_batches
  FOR SELECT TO authenticated USING (true);

-- Historical reports must remain inaccessible to non-admin authenticated users.
ALTER TABLE public.historical_business_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historical_daily_admin_select" ON public.historical_business_daily;
CREATE POLICY "historical_daily_admin_select" ON public.historical_business_daily
  FOR SELECT TO authenticated USING (public.is_admin() = true);
