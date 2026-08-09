-- 20260824000000_site_settings_rls.sql
--
-- Enable Row Level Security on public.site_settings and grant access consistent
-- with the rest of the schema.
--
-- Background
-- ----------
-- The baseline (00_baseline.sql) created `site_settings` with RLS OFF, no
-- policies and no grants. The migration chain only ever INSERTs/UPDATEs seed
-- rows into it (as the owner / via SECURITY DEFINER functions) and never added
-- policies or grants. Consequently, on the live FreshGo TEST db, the `anon` and
-- `authenticated` roles hold only REFERENCES/TRUNCATE on `site_settings` and
-- have NO SELECT privilege, so the storefront cannot read its public settings.
--
-- The browser (anon-key) client reads these settings at runtime in
-- WebsiteSettingsContext -> supabase.from('site_settings').select(...)
-- which backs Header / Footer / HomePage visibility toggles. Anonymous visitors
-- therefore need a working SELECT, and only admins should be able to mutate rows.
--
-- Access model
-- ------------
--   * anon + authenticated  -> SELECT (all rows; public key/value config)
--   * authenticated (admin) -> INSERT / UPDATE / DELETE, gated by is_admin()
--
-- is_admin() is STABLE + SECURITY DEFINER and is already the admin gate used
-- across the schema (see 20260717152333_create_user_roles_and_admin_rls.sql).
-- The `FOR ALL ... TO authenticated USING (is_admin()) WITH CHECK (is_admin())`
-- pattern mirrors 20260819_add_delivery_batches.sql and
-- 20260820_pricing_and_profit_accounting_v2.sql.
--
-- Idempotency
-- -----------
--   * ALTER TABLE ... ENABLE ROW LEVEL SECURITY is a no-op when already enabled.
--   * Each policy uses DROP POLICY IF EXISTS before CREATE POLICY.
--   * GRANT SELECT ... TO anon, authenticated is additive / re-runnable.
-- This migration does NOT modify 00_baseline.sql; the baseline stays as-is.

-- 1. Enable RLS (no-op if already enabled).
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- 2. Public read: anon + authenticated can SELECT every setting row.
DROP POLICY IF EXISTS "site_settings_read_public" ON public.site_settings;
CREATE POLICY "site_settings_read_public" ON public.site_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 3. Admin-only write: INSERT / UPDATE / DELETE for authenticated admins only.
--    (anon is excluded by the `TO authenticated` clause; authenticated non-admins
--    are blocked by the USING/WITH CHECK is_admin() condition.)
DROP POLICY IF EXISTS "site_settings_admin_write" ON public.site_settings;
CREATE POLICY "site_settings_admin_write" ON public.site_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin() = true)
  WITH CHECK (public.is_admin() = true);

-- 4. Table-level SELECT privilege is required (in addition to the policy above)
--    for anon/authenticated to actually exercise the FOR SELECT policy under RLS.
--    This matches the GRANT SELECT ... TO anon, authenticated pattern already
--    used for the reporting views in 20260821_pricing_and_profit_accounting_v2_1.sql.
GRANT SELECT ON public.site_settings TO anon, authenticated;
