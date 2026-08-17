-- Phase 4C.2
-- Fix supplier canonical SELECT RLS recursion introduced by Phase 4C.1.
--
-- Problem:
--   sales_order_lines supplier policy queried sales_order_line_components
--   directly. The existing component SELECT policy joins sales_order_lines,
--   creating an RLS cycle:
--
--     sales_order_lines
--       -> sales_order_line_components
--       -> sales_order_lines
--
-- Fix:
--   move "supplier owns a component under this line" lookup into a
--   SECURITY DEFINER ownership helper, then keep the RLS policy itself
--   free of direct cross-table component queries.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_supplier_for_sales_order_line_via_component(
  p_sales_order_line_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_supplier()
     AND EXISTS (
       SELECT 1
         FROM public.sales_order_line_components c
         JOIN public.supplier_users su
           ON su.supplier_id = c.supplier_id
        WHERE c.sales_order_line_id = p_sales_order_line_id
          AND su.user_id = auth.uid()
          AND su.active
     );
$$;

REVOKE EXECUTE
ON FUNCTION public.is_supplier_for_sales_order_line_via_component(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.is_supplier_for_sales_order_line_via_component(uuid)
TO authenticated;

DROP POLICY IF EXISTS phase4c1_sales_order_lines_supplier_select
ON public.sales_order_lines;

CREATE POLICY phase4c1_sales_order_lines_supplier_select
ON public.sales_order_lines
FOR SELECT TO authenticated
USING (
  public.is_supplier_for_sales_order_line(id)
  OR public.is_supplier_for_sales_order_line_via_component(id)
);

COMMIT;
