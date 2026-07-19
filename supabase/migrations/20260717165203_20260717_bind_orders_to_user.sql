/*
# Bind Orders to Authenticated Users

## Summary
Adds a user_id column to the "Orders" table and replaces the previous wide-open
RLS policies (which allowed any anon user to read or write any order) with
user-scoped policies. Each order now belongs to the authenticated user who placed
it, and only that user can see it. Admins retain full read access.

## Changes to existing table: Orders
### New column
- `user_id` (uuid, nullable FK → auth.users, defaults to auth.uid()) — the owner
  of each order. New rows automatically receive the calling user's ID via DEFAULT.
  Existing rows get NULL (no owner) — they remain visible only to admins.

## Security Changes
- Dropped the 4 old policies that used `USING (true)` / `WITH CHECK (true)` which
  gave any anon or authenticated user unrestricted access to every row.
- New SELECT policy: authenticated users can only read rows where user_id = their own UUID.
- New INSERT policy: authenticated users can only insert rows whose user_id = their UUID.
  The DEFAULT auth.uid() on the column means the frontend does NOT need to pass user_id;
  it is filled automatically at the DB level.
- UPDATE and DELETE are locked to admins only via is_admin().

## Notes
1. Existing orders without a user_id will not match any user's auth.uid() and will
   therefore be invisible to normal users — this is correct; they were placed before
   user accounts were required.
2. The column is nullable so the ALTER TABLE can be applied without breaking rows that
   were inserted before this migration.
3. is_admin() is already defined in a previous migration.
*/

-- 1. Add user_id column (nullable so existing rows don't break)
ALTER TABLE "Orders"
  ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Drop the old wide-open policies
DROP POLICY IF EXISTS "anon_select_orders" ON "Orders";
DROP POLICY IF EXISTS "anon_insert_orders" ON "Orders";
DROP POLICY IF EXISTS "anon_update_orders" ON "Orders";
DROP POLICY IF EXISTS "anon_delete_orders" ON "Orders";

-- 3. New user-scoped SELECT: each user sees only their own orders
DROP POLICY IF EXISTS "select_own_orders" ON "Orders";
CREATE POLICY "select_own_orders" ON "Orders" FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. Admins can read all orders
DROP POLICY IF EXISTS "admin_select_orders" ON "Orders";
CREATE POLICY "admin_select_orders" ON "Orders" FOR SELECT
  TO authenticated
  USING (public.is_admin() = true);

-- 5. Authenticated users can insert their own orders
DROP POLICY IF EXISTS "insert_own_orders" ON "Orders";
CREATE POLICY "insert_own_orders" ON "Orders" FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 6. Only admins can update orders (e.g. status changes)
DROP POLICY IF EXISTS "admin_update_orders" ON "Orders";
CREATE POLICY "admin_update_orders" ON "Orders" FOR UPDATE
  TO authenticated
  USING (public.is_admin() = true)
  WITH CHECK (public.is_admin() = true);

-- 7. Only admins can delete orders
DROP POLICY IF EXISTS "admin_delete_orders" ON "Orders";
CREATE POLICY "admin_delete_orders" ON "Orders" FOR DELETE
  TO authenticated
  USING (public.is_admin() = true);
