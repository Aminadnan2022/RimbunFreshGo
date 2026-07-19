/*
# Add Supplier Role Support

## Summary
Introduces supplier as a first-class role alongside admin and customer.

## Changes

### New Functions
- `public.is_supplier()` — SECURITY DEFINER helper that returns true when the
  calling user has role = 'supplier' in user_roles. Mirrors the existing is_admin().

### New Tables
- `supplier_profiles` — links a supplier user to a vendor slug and stores
  optional display metadata.
  - `id` (uuid, PK)
  - `user_id` (uuid, FK auth.users, unique — one profile per user)
  - `vendor_id` (text — matches the id field in the front-end vendors data file)
  - `display_name` (text, nullable)
  - `created_at` (timestamptz)

### Security
- RLS enabled on supplier_profiles.
- Suppliers can select/update their own profile row.
- Admins (via is_admin()) can select, insert, update, and delete any row.

## Notes
1. user_roles.role has no CHECK constraint so 'supplier' inserts work without
   a schema change.
2. is_supplier() is SECURITY DEFINER so it bypasses RLS on user_roles (same
   pattern as is_admin()).
3. supplier_profiles.user_id has a UNIQUE constraint — one supplier account
   maps to exactly one vendor.
*/

-- 1. is_supplier() helper function
CREATE OR REPLACE FUNCTION public.is_supplier()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE id = auth.uid() AND role = 'supplier'
  );
$$;

-- 2. supplier_profiles table
CREATE TABLE IF NOT EXISTS public.supplier_profiles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id   text        NOT NULL DEFAULT '',
  display_name text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_profiles ENABLE ROW LEVEL SECURITY;

-- Supplier: read own profile
DROP POLICY IF EXISTS "supplier_select_own" ON public.supplier_profiles;
CREATE POLICY "supplier_select_own" ON public.supplier_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Supplier: update own profile
DROP POLICY IF EXISTS "supplier_update_own" ON public.supplier_profiles;
CREATE POLICY "supplier_update_own" ON public.supplier_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin: full access
DROP POLICY IF EXISTS "admin_select_supplier_profiles" ON public.supplier_profiles;
CREATE POLICY "admin_select_supplier_profiles" ON public.supplier_profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_supplier_profiles" ON public.supplier_profiles;
CREATE POLICY "admin_insert_supplier_profiles" ON public.supplier_profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_supplier_profiles" ON public.supplier_profiles;
CREATE POLICY "admin_update_supplier_profiles" ON public.supplier_profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_supplier_profiles" ON public.supplier_profiles;
CREATE POLICY "admin_delete_supplier_profiles" ON public.supplier_profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());
