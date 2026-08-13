/*
# Repair Product storefront + admin access

The storefront reads the live catalog (`fetchProducts`, `fetchProductById`,
`fetchProductsByCategory`, `fetchPopularProducts`) through the anonymous and
authenticated Supabase clients.  Admins additionally create, update, and
delete products through `AdminProductsPage`.

The product-table migrations define RLS policies for these paths, but RLS
policies do not replace PostgreSQL table privileges.  A test project can
retain a state where `"Product"` has policies but no table-level GRANT,
which surfaces as:

    permission denied for table Product

for anon, authenticated, and even service_role callers.

This forward-only repair restores the intended boundary:
- anon + authenticated may SELECT the catalog (grant matches `anon_select_products`);
- authenticated may INSERT / UPDATE / DELETE products, gated to admins via the
  existing `admin_insert_products` / `admin_update_products` /
  `admin_delete_products` RLS policies;
- no broad PUBLIC grants are added and no RLS gap is introduced.
*/

ALTER TABLE public."Product" ENABLE ROW LEVEL SECURITY;

-- RLS policies do not replace PostgreSQL table privileges.
GRANT SELECT ON TABLE public."Product" TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public."Product" TO authenticated;

-- Re-assert the intended policy set so repair is idempotent across projects.
DROP POLICY IF EXISTS "anon_select_products" ON public."Product";
CREATE POLICY "anon_select_products" ON public."Product"
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_insert_products" ON public."Product";
CREATE POLICY "admin_insert_products" ON public."Product"
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_products" ON public."Product";
CREATE POLICY "admin_update_products" ON public."Product"
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_products" ON public."Product";
CREATE POLICY "admin_delete_products" ON public."Product"
  FOR DELETE TO authenticated
  USING (public.is_admin());