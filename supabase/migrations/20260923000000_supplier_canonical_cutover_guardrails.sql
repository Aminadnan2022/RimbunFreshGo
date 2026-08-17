-- Canonical supplier cutover: operational permissions only.
-- Intentionally contains no supplier, user mapping, product, price, or order data.

BEGIN;

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT ON TABLE public.suppliers TO service_role;
GRANT SELECT ON TABLE public.supplier_users TO service_role;
GRANT SELECT ON TABLE public.supplier_profiles TO service_role;
GRANT SELECT ON TABLE public.supplier_price_history TO service_role;

COMMIT;
