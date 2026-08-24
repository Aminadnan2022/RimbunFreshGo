-- New canonical orders use the shorter FreshGo prefix. Existing order_number
-- values are immutable references and are intentionally not updated.
CREATE OR REPLACE FUNCTION public.phase4b1_generate_order_number()
RETURNS text
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  SELECT 'FG-' || to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD')
    || '-' || lpad(nextval('public.sales_order_number_seq')::text, 5, '0');
$$;

REVOKE EXECUTE ON FUNCTION public.phase4b1_generate_order_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phase4b1_generate_order_number() TO authenticated;
