-- ═══════════════════════════════════════════════════════════════════════════
-- FRESHGO R1 REMEDIATION — REPORTING VIEW EXPOSURE
--
-- All 11 reporting objects were granted SELECT to anon, authenticated in
-- 20260821000000_pricing_and_profit_accounting_v2_1.sql (lines 596-606).
-- The application reads Orders directly and never queries these views, so no
-- consumer requires access. Authenticated includes every app role
-- (admin/supplier/delivery_rider/customer), so revoking it also removes them.
-- Nothing is dropped or altered; no RLS, RPC, payment, or order logic changes.
-- Idempotent: REVOKE of a non-existent grant is a no-op.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE SELECT ON public.vw_order_item_flat      FROM anon, authenticated;
REVOKE SELECT ON public.vw_sales_summary_daily  FROM anon, authenticated;
REVOKE SELECT ON public.vw_sales_summary_monthly FROM anon, authenticated;
REVOKE SELECT ON public.vw_product_profit       FROM anon, authenticated;
REVOKE SELECT ON public.vw_supplier_profit      FROM anon, authenticated;
REVOKE SELECT ON public.vw_category_profit      FROM anon, authenticated;
REVOKE SELECT ON public.vw_top_products         FROM anon, authenticated;
REVOKE SELECT ON public.vw_top_profit_products  FROM anon, authenticated;
REVOKE SELECT ON public.vw_order_profit         FROM anon, authenticated;
REVOKE SELECT ON public.vw_dashboard_kpis       FROM anon, authenticated;
REVOKE SELECT ON public.mv_sales_summary_monthly FROM anon, authenticated;
