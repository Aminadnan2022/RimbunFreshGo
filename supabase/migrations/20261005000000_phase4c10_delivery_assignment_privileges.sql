-- Phase 4C10
-- Repair table privileges for the existing delivery_assignments RLS model.
--
-- RLS remains authoritative:
--   - admins may select / insert / update / delete
--   - riders may select only their own assignments
--   - other authenticated roles receive no rows / mutation access
--
-- Table privileges are required in addition to RLS policies.

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.delivery_assignments
TO authenticated;

-- Existing admin assignment UI uses UPSERT, which may execute UPDATE
-- when the (delivery_date, rider_id) unique key already exists.
DROP POLICY IF EXISTS "admin_update_assignments"
ON public.delivery_assignments;

CREATE POLICY "admin_update_assignments"
ON public.delivery_assignments
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- delivery_assignments.id is an identity-backed bigint.
-- Grant sequence access required by INSERT where applicable.
GRANT USAGE, SELECT
ON SEQUENCE public.delivery_assignments_id_seq
TO authenticated;
