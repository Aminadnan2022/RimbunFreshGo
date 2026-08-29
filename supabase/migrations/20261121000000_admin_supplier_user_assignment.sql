-- Give admins one atomic operation for assigning a login to its supplier.
-- A supplier login has one active supplier assignment at a time, so its
-- dashboard scope is clear and changes do not leave a role without access.

BEGIN;

-- Existing RLS limits supplier rows to admins. This table privilege permits
-- the admin Users page to populate its supplier selector.
GRANT SELECT ON TABLE public.suppliers TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_supplier_user(
  p_user_id uuid,
  p_supplier_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_user_id IS NULL OR p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'A user and supplier are required.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own supplier access.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id) THEN
    RAISE EXCEPTION 'Supplier not found.';
  END IF;

  INSERT INTO public.user_roles (id, role)
  VALUES (p_user_id, 'supplier')
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role;

  -- The supplier dashboard is deliberately scoped to one supplier per login.
  -- Preserve historical rows but revoke any previous active assignment first.
  UPDATE public.supplier_users
     SET active = false
   WHERE user_id = p_user_id
     AND supplier_id <> p_supplier_id
     AND active;

  INSERT INTO public.supplier_users (supplier_id, user_id, active, created_by)
  VALUES (p_supplier_id, p_user_id, true, auth.uid())
  ON CONFLICT (supplier_id, user_id) DO UPDATE
    SET active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_supplier_user(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_supplier_user(uuid, bigint) TO authenticated;

COMMIT;
