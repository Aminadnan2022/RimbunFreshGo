/*
# Add admin-read-all policy to user_roles

## Summary
Admins need to read ALL rows in user_roles (not just their own) to manage user roles
from the Admin Dashboard. Adds a SELECT policy scoped to is_admin().

## Changes
- New policy: admins can SELECT any row in user_roles.
- Existing "users_read_own_role" policy stays — customers can still read their own row.

## Notes
- is_admin() is SECURITY DEFINER so it bypasses RLS when checking the admin's own row.
- Policy name is distinct from the existing user policy so there is no conflict.
*/

DROP POLICY IF EXISTS "admins_read_all_roles" ON user_roles;
CREATE POLICY "admins_read_all_roles" ON user_roles FOR SELECT
  TO authenticated
  USING (public.is_admin());
