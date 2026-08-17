-- Phase 4C.1: canonical supplier read access.
--
-- Goals:
--   * supplier may see an order only when assigned to at least one direct line
--     or combo component in that order;
--   * direct lines remain supplier-scoped;
--   * combo components remain supplier-scoped;
--   * units and preparation answers inherit the ownership of their parent;
--   * no supplier write access is added;
--   * existing customer/admin policies remain unchanged.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Order-level supplier ownership must include both:
--      a) direct sales_order_lines.supplier_id ownership
--      b) combo sales_order_line_components.supplier_id ownership
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_supplier_for_sales_order(
  p_sales_order_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_supplier()
     AND (
       EXISTS (
         SELECT 1
           FROM public.sales_order_lines l
           JOIN public.supplier_users su
             ON su.supplier_id = l.supplier_id
          WHERE l.sales_order_id = p_sales_order_id
            AND su.user_id = auth.uid()
            AND su.active
       )
       OR EXISTS (
         SELECT 1
           FROM public.sales_order_line_components c
           JOIN public.sales_order_lines l
             ON l.id = c.sales_order_line_id
           JOIN public.supplier_users su
             ON su.supplier_id = c.supplier_id
          WHERE l.sales_order_id = p_sales_order_id
            AND su.user_id = auth.uid()
            AND su.active
       )
     );
$$;

-- ---------------------------------------------------------------------------
-- 2. Supplier may see canonical order header only when they participate in it.
-- ---------------------------------------------------------------------------

CREATE POLICY phase4c1_sales_orders_supplier_select
ON public.sales_orders
FOR SELECT TO authenticated
USING (
  public.is_supplier_for_sales_order(id)
);

-- ---------------------------------------------------------------------------
-- 3. Supplier may see:
--      * their own direct line; OR
--      * a combo parent line containing at least one component they own.
--
--    This does NOT expose sibling direct lines from another supplier.
-- ---------------------------------------------------------------------------

CREATE POLICY phase4c1_sales_order_lines_supplier_select
ON public.sales_order_lines
FOR SELECT TO authenticated
USING (
  public.is_supplier_for_sales_order_line(id)
  OR EXISTS (
    SELECT 1
      FROM public.sales_order_line_components c
     WHERE c.sales_order_line_id = id
       AND public.is_supplier_for_sales_order_line_component(c.id)
  )
);

-- ---------------------------------------------------------------------------
-- 4. Normal physical units inherit direct-line ownership.
-- ---------------------------------------------------------------------------

CREATE POLICY phase4c1_sales_order_line_units_supplier_select
ON public.sales_order_line_units
FOR SELECT TO authenticated
USING (
  public.is_supplier_for_sales_order_line(sales_order_line_id)
);

-- ---------------------------------------------------------------------------
-- 5. Combo components are strictly component-owner scoped.
--    A supplier owning one component does NOT gain access to sibling components.
-- ---------------------------------------------------------------------------

CREATE POLICY phase4c1_sales_order_line_components_supplier_select
ON public.sales_order_line_components
FOR SELECT TO authenticated
USING (
  public.is_supplier_for_sales_order_line_component(id)
);

CREATE POLICY phase4c1_sales_order_line_component_units_supplier_select
ON public.sales_order_line_component_units
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.sales_order_line_components c
     WHERE c.id = sales_order_line_component_id
       AND public.is_supplier_for_sales_order_line_component(c.id)
  )
);

-- ---------------------------------------------------------------------------
-- 6. Preparation answers follow their precise supplier-owned scope.
--
--    Normal line / normal unit:
--      component id is NULL and the direct line must belong to supplier.
--
--    Combo component / component unit:
--      the referenced component must belong to supplier.
-- ---------------------------------------------------------------------------

CREATE POLICY phase4c1_sales_order_preparation_answers_supplier_select
ON public.sales_order_preparation_answers
FOR SELECT TO authenticated
USING (
  (
    sales_order_line_component_id IS NULL
    AND public.is_supplier_for_sales_order_line(sales_order_line_id)
  )
  OR
  (
    sales_order_line_component_id IS NOT NULL
    AND public.is_supplier_for_sales_order_line_component(
      sales_order_line_component_id
    )
  )
);

-- Explicitly retain authenticated execute access after function replacement.
REVOKE EXECUTE
ON FUNCTION public.is_supplier_for_sales_order(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.is_supplier_for_sales_order(uuid)
TO authenticated;

COMMIT;
