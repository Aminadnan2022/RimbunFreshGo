/*
# Create user_roles table, is_admin() helper, and tighten Product RLS

## Summary
Sets up a role-based admin system. Only users with a row in `user_roles` (role = 'admin')
can add, edit, or delete products. Normal users can still browse the catalog freely.

## New Tables
- `user_roles`
  - `id` (uuid, primary key, references auth.users)
  - `role` (text, not null, default 'admin')
  - `created_at` (timestamptz, default now())

## New Functions
- `public.is_admin()` — returns true if the calling user has an 'admin' row in user_roles

## Security Changes
- RLS enabled on `user_roles`.
  - Authenticated users can SELECT their own row.
  - Only existing admins can INSERT/UPDATE/DELETE rows (allows promoting/demoting others).
- Product table:
  - SELECT remains open to anon + authenticated (public catalog).
  - INSERT / UPDATE / DELETE now restricted to is_admin() = true.

## Notes
1. The initial admin (csmin92@gmail.com) is seeded via a lookup in auth.users.
2. If the email doesn't exist in auth.users yet (account not created), the INSERT is skipped gracefully.
3. is_admin() uses SECURITY DEFINER so it can read user_roles regardless of the caller's RLS context.
*/

-- 1. Create user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Policies for user_roles
DROP POLICY IF EXISTS "users_read_own_role" ON user_roles;
CREATE POLICY "users_read_own_role" ON user_roles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "admins_insert_roles" ON user_roles;
CREATE POLICY "admins_insert_roles" ON user_roles FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "admins_update_roles" ON user_roles;
CREATE POLICY "admins_update_roles" ON user_roles FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admins_delete_roles" ON user_roles;
CREATE POLICY "admins_delete_roles" ON user_roles FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE id = auth.uid() AND role = 'admin'));

-- 2. Create is_admin() helper function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 3. Seed the initial admin (csmin92@gmail.com)
INSERT INTO user_roles (id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'csmin92@gmail.com'
ON CONFLICT (id) DO NOTHING;

-- 4. Tighten Product RLS policies (keep SELECT open, restrict mutations to admins)
DROP POLICY IF EXISTS "anon_select_products" ON "Product";
CREATE POLICY "anon_select_products" ON "Product" FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_products" ON "Product";
DROP POLICY IF EXISTS "admin_insert_products" ON "Product";
CREATE POLICY "admin_insert_products" ON "Product" FOR INSERT
  TO authenticated WITH CHECK (public.is_admin() = true);

DROP POLICY IF EXISTS "anon_update_products" ON "Product";
DROP POLICY IF EXISTS "admin_update_products" ON "Product";
CREATE POLICY "admin_update_products" ON "Product" FOR UPDATE
  TO authenticated
  USING (public.is_admin() = true)
  WITH CHECK (public.is_admin() = true);

DROP POLICY IF EXISTS "anon_delete_products" ON "Product";
DROP POLICY IF EXISTS "admin_delete_products" ON "Product";
CREATE POLICY "admin_delete_products" ON "Product" FOR DELETE
  TO authenticated USING (public.is_admin() = true);
