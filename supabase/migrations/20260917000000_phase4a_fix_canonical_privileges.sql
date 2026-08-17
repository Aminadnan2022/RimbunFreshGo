-- Phase 4A corrective privileges only.
-- No data, schema, business rules, or configuration seeds are changed here.
-- RLS remains the row-level authorization boundary.

-- -----------------------------------------------------------------------------
-- 1. Read privileges for canonical sales facts and Phase 4A tables
-- -----------------------------------------------------------------------------
-- Existing canonical RLS policies already limit authenticated reads to the
-- customer/admin relationship. These grants only make those policies reachable.
GRANT SELECT ON TABLE
  public.sales_orders,
  public.sales_order_lines,
  public.sales_order_line_units,
  public.sales_order_preparation_answers,
  public.sales_order_events,
  public.sales_order_adjustments
TO authenticated, service_role;

GRANT SELECT ON TABLE
  public.supplier_users,
  public.sales_order_payment_receipts,
  public.notifications
TO authenticated, service_role;

-- Backend verification and future system workers need read access. No direct
-- service_role DML is granted because canonical writes are RPC-controlled.
GRANT SELECT ON TABLE
  public.payment_configuration_versions,
  public.delivery_method_versions,
  public.delivery_method_version_days,
  public.delivery_method_version_windows,
  public.delivery_method_version_zones,
  public.payment_reminder_rules,
  public.payment_reminder_attempts
TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Published configuration reads for authenticated checkout clients
-- -----------------------------------------------------------------------------
-- Admin FOR ALL policies from Phase 4A remain in place. These additional SELECT
-- policies expose only the currently effective published configuration.
DROP POLICY IF EXISTS phase4a_payment_config_published_select
  ON public.payment_configuration_versions;
CREATE POLICY phase4a_payment_config_published_select
  ON public.payment_configuration_versions
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND effective_from <= now()
    AND (effective_to IS NULL OR effective_to > now())
  );

DROP POLICY IF EXISTS phase4a_delivery_config_published_select
  ON public.delivery_method_versions;
CREATE POLICY phase4a_delivery_config_published_select
  ON public.delivery_method_versions
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND active
    AND effective_from <= now()
    AND (effective_to IS NULL OR effective_to > now())
  );

DROP POLICY IF EXISTS phase4a_delivery_days_published_select
  ON public.delivery_method_version_days;
CREATE POLICY phase4a_delivery_days_published_select
  ON public.delivery_method_version_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.delivery_method_versions v
      WHERE v.id = delivery_method_version_id
        AND v.status = 'published'
        AND v.active
        AND v.effective_from <= now()
        AND (v.effective_to IS NULL OR v.effective_to > now())
    )
  );

DROP POLICY IF EXISTS phase4a_delivery_windows_published_select
  ON public.delivery_method_version_windows;
CREATE POLICY phase4a_delivery_windows_published_select
  ON public.delivery_method_version_windows
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.delivery_method_versions v
      WHERE v.id = delivery_method_version_id
        AND v.status = 'published'
        AND v.active
        AND v.effective_from <= now()
        AND (v.effective_to IS NULL OR v.effective_to > now())
    )
  );

DROP POLICY IF EXISTS phase4a_delivery_zones_published_select
  ON public.delivery_method_version_zones;
CREATE POLICY phase4a_delivery_zones_published_select
  ON public.delivery_method_version_zones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.delivery_method_versions v
      WHERE v.id = delivery_method_version_id
        AND v.status = 'published'
        AND v.active
        AND v.effective_from <= now()
        AND (v.effective_to IS NULL OR v.effective_to > now())
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Least-privilege admin configuration writes
-- -----------------------------------------------------------------------------
-- RLS still requires public.is_admin() for every row mutation.
GRANT INSERT, UPDATE, DELETE ON TABLE
  public.payment_configuration_versions,
  public.delivery_method_versions,
  public.delivery_method_version_days,
  public.delivery_method_version_windows,
  public.delivery_method_version_zones,
  public.payment_reminder_rules
TO authenticated;

GRANT SELECT ON TABLE
  public.payment_configuration_versions,
  public.delivery_method_versions,
  public.delivery_method_version_days,
  public.delivery_method_version_windows,
  public.delivery_method_version_zones,
  public.payment_reminder_rules,
  public.payment_reminder_attempts
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_users TO authenticated;

-- Reminder attempts are system-owned; no authenticated direct DML is granted.
-- Receipt metadata, canonical orders, lines, notifications, and payment state
-- remain RPC-only for application roles.

-- -----------------------------------------------------------------------------
-- 4. Explicit function execution boundary
-- -----------------------------------------------------------------------------
-- PostgreSQL grants EXECUTE on functions to PUBLIC by default. Remove that
-- implicit exposure, then grant only the intended authenticated call surface.
REVOKE EXECUTE ON FUNCTION public.is_supplier_for_sales_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_sales_order_pricing(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_sales_order_payment_receipt(uuid, text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_sales_order_payment_receipt(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_sales_order_payment(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.publish_payment_configuration_version(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.publish_delivery_method_version(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.retire_payment_configuration_version(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.retire_delivery_method_version(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.phase4a_assert_supplier_paid(uuid) FROM PUBLIC, authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION public.is_supplier_for_sales_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_sales_order_pricing(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_sales_order_payment_receipt(uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_sales_order_payment_receipt(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_sales_order_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_payment_configuration_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_delivery_method_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_payment_configuration_version(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_delivery_method_version(uuid, timestamptz) TO authenticated;

-- The paid guard is an internal SECURITY DEFINER helper for future canonical
-- supplier RPCs; it is intentionally not callable by client roles.
