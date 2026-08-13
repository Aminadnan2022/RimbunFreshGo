/*
# Repair combo storefront access

The storefront reads only active combos (`fetchActiveCombos`,
`fetchActiveComboList`, and `fetchComboBySlug`).  Authenticated customers
therefore need SELECT access to active combo rows and their items, but must
not be able to create, edit, or delete either resource.

Admins retain full combo management access. Suppliers retain the broader
read-only access used by operational views.  The active-only policy applies
only to ordinary authenticated customers.
*/

ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;

-- Table privileges are checked before RLS. The test project currently lacks
-- these SELECT grants, which produces "permission denied for table combos".
GRANT SELECT ON TABLE public.combos, public.combo_items TO authenticated;

-- Replace only the obsolete permissive policies created with the combo tables.
DROP POLICY IF EXISTS "combos_select_all" ON public.combos;
DROP POLICY IF EXISTS "combos_insert_all" ON public.combos;
DROP POLICY IF EXISTS "combos_update_all" ON public.combos;
DROP POLICY IF EXISTS "combos_delete_all" ON public.combos;
DROP POLICY IF EXISTS "combo_items_select_all" ON public.combo_items;
DROP POLICY IF EXISTS "combo_items_insert_all" ON public.combo_items;
DROP POLICY IF EXISTS "combo_items_update_all" ON public.combo_items;
DROP POLICY IF EXISTS "combo_items_delete_all" ON public.combo_items;

DROP POLICY IF EXISTS "customer_select_active_combos" ON public.combos;
CREATE POLICY "customer_select_active_combos" ON public.combos
  FOR SELECT TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS "staff_select_all_combos" ON public.combos;
CREATE POLICY "staff_select_all_combos" ON public.combos
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_supplier());

DROP POLICY IF EXISTS "admin_manage_combos" ON public.combos;
CREATE POLICY "admin_manage_combos" ON public.combos
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "customer_select_items_for_active_combos" ON public.combo_items;
CREATE POLICY "customer_select_items_for_active_combos" ON public.combo_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.combos
      WHERE combos.id = combo_items.combo_id
        AND combos.active = true
    )
  );

DROP POLICY IF EXISTS "staff_select_all_combo_items" ON public.combo_items;
CREATE POLICY "staff_select_all_combo_items" ON public.combo_items
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_supplier());

DROP POLICY IF EXISTS "admin_manage_combo_items" ON public.combo_items;
CREATE POLICY "admin_manage_combo_items" ON public.combo_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
