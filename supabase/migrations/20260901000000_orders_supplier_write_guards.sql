/*
# FRESHGO R4 REMEDIATION — SUPPLIER WRITE GUARDS + WRITE-ONCE WORKFLOW TIMESTAMPS

R4-A: supplier direct UPDATE column allowlist on "Orders".
- A direct (non SECURITY DEFINER) UPDATE issued by an authenticated supplier who
  is not also an admin may only change the approved workflow columns:
  supplier_weights, order_items, total, gross_profit, payment_status,
  updated_at, updated_by, packing_started_at, packing_completed_at.
- Every other Orders column is rejected for a supplier direct UPDATE.
- Payment-state transitions remain SOLELY the responsibility of the existing
  payment guard (trg_guard_order_payment): Pending -> Ready To Pay forward-only,
  suppliers blocked from setting Paid, Ready To Pay -> Pending blocked,
  Paid terminal, paid_at/paid_by admin-only, Paid financial freeze.
- SECURITY DEFINER workflow RPCs (current_user = 'postgres' — the function owner
  in this Supabase project) pass through untouched so supplier_book_lalamove_order
  etc. keep writing their tracking / dispatch fields on behalf of a supplier.

NOTE ON THE DISCRIMINATOR: In Supabase, PostgREST connects as the proxy role
'authenticator' and then SET ROLE to the JWT role claim. So session_user is
ALWAYS 'authenticator' (both for direct requests and inside SECURITY DEFINER
functions). The reliable way to detect "inside a SECURITY DEFINER function" here
is `current_user = 'postgres'` (the function owner). 'authenticated' marks a
direct request.

R4-B: write-once workflow timestamps on "Orders".
- packing_started_at, packing_completed_at, supplier_dispatch_started_at,
  supplier_dispatch_completed_at, ready_for_rider_at
- NULL -> value ALLOWED; NULL -> NULL ALLOWED; value -> identical value ALLOWED;
  value -> different value BLOCKED; value -> NULL BLOCKED.
- Enforced for ALL direct UPDATEs (current_user = session_user), including
  admins (no admin direct-update bypass). SECURITY DEFINER workflow RPCs pass
  through untouched.

Trigger firing order on BEFORE UPDATE (alphabetical by trigger name):
  1. trg_aa_guard_order_supplier_allowlist  (R4-A — must precede freeze so it
     sees the raw supplier-submitted row before freeze_order_pricing mutates
     NEW financial fields)
  2. trg_freeze_order_pricing               (existing pricing freeze)
  3. trg_guard_order_payment                (existing payment guard)
  4. trg_zz_guard_order_timestamps          (R4-B)

R4 verification probe: r4_context_probe() is a SECURITY DEFINER helper used by
e2e/verify.r4.ts to prove current_user/session_user/auth.uid()/role-helper
behaviour in direct vs SECURITY DEFINER context. It reads session metadata only
and exposes no secrets.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- R4-A — Supplier direct UPDATE column allowlist
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guard_order_supplier_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  allowed_columns text[] := ARRAY[
    'supplier_weights',
    'order_items',
    'total',
    'gross_profit',
    'payment_status',
    'updated_at',
    'updated_by',
    'packing_started_at',
    'packing_completed_at'
  ];
BEGIN
  -- Applicability gate: enforce ONLY for a direct (non SECURITY DEFINER)
  -- UPDATE issued by an authenticated supplier who is not also an admin.
  -- In this Supabase project, SECURITY DEFINER functions run as the owner
  -- ('postgres'); direct requests run as the JWT role ('authenticated').
  IF auth.uid() IS NULL
     OR current_user = 'postgres'
     OR NOT public.is_supplier()
     OR public.is_admin()
  THEN
    RETURN NEW;
  END IF;

  -- JSONB set subtraction: any change to a column outside the allowlist makes
  -- the two reduced objects differ. Fail-closed — future columns are
  -- automatically disallowed for supplier direct updates.
  IF (to_jsonb(NEW) - allowed_columns) IS DISTINCT FROM
     (to_jsonb(OLD) - allowed_columns)
  THEN
    RAISE EXCEPTION 'Suppliers may only update approved order workflow columns';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aa_guard_order_supplier_allowlist ON public."Orders";
CREATE TRIGGER trg_aa_guard_order_supplier_allowlist
  BEFORE UPDATE ON public."Orders"
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_supplier_allowlist();

-- ═══════════════════════════════════════════════════════════════════════════
-- R4-B — Write-once workflow timestamps
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guard_order_write_once()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- SECURITY DEFINER workflow RPCs (trusted, idempotent or one-shot) pass
  -- through untouched; write-once is enforced for all direct UPDATEs.
  -- In this Supabase project, SECURITY DEFINER functions run as the owner
  -- ('postgres'); direct requests run as the JWT role ('authenticated').
  IF current_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  IF OLD.packing_started_at IS NOT NULL
     AND OLD.packing_started_at IS DISTINCT FROM NEW.packing_started_at
  THEN
    RAISE EXCEPTION 'packing_started_at is write-once';
  END IF;

  IF OLD.packing_completed_at IS NOT NULL
     AND OLD.packing_completed_at IS DISTINCT FROM NEW.packing_completed_at
  THEN
    RAISE EXCEPTION 'packing_completed_at is write-once';
  END IF;

  IF OLD.supplier_dispatch_started_at IS NOT NULL
     AND OLD.supplier_dispatch_started_at IS DISTINCT FROM NEW.supplier_dispatch_started_at
  THEN
    RAISE EXCEPTION 'supplier_dispatch_started_at is write-once';
  END IF;

  IF OLD.supplier_dispatch_completed_at IS NOT NULL
     AND OLD.supplier_dispatch_completed_at IS DISTINCT FROM NEW.supplier_dispatch_completed_at
  THEN
    RAISE EXCEPTION 'supplier_dispatch_completed_at is write-once';
  END IF;

  IF OLD.ready_for_rider_at IS NOT NULL
     AND OLD.ready_for_rider_at IS DISTINCT FROM NEW.ready_for_rider_at
  THEN
    RAISE EXCEPTION 'ready_for_rider_at is write-once';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_guard_order_timestamps ON public."Orders";
CREATE TRIGGER trg_zz_guard_order_timestamps
  BEFORE UPDATE ON public."Orders"
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_write_once();

-- ═══════════════════════════════════════════════════════════════════════════
-- R4 verification probes — used by e2e/verify.r4.ts
-- ═══════════════════════════════════════════════════════════════════════════

-- SECURITY DEFINER context probe: runs as the function owner (postgres), while
-- session_user stays 'authenticated'. Proves the definer side of the
-- current_user <> session_user discriminator used by both R4 triggers.
CREATE OR REPLACE FUNCTION public.r4_context_probe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN jsonb_build_object(
    'current_user', current_user::text,
    'session_user', session_user::text,
    'auth_uid', auth.uid()::text,
    'is_admin', public.is_admin(),
    'is_supplier', public.is_supplier()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.r4_context_probe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.r4_context_probe() TO authenticated;

-- Invoker (direct) context probe: NOT SECURITY DEFINER, so it runs as the
-- calling role ('authenticated') — proves the direct side of the
-- current_user = session_user discriminator. Reads session metadata only.
CREATE OR REPLACE FUNCTION public.r4_context_probe_direct()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN jsonb_build_object(
    'current_user', current_user::text,
    'session_user', session_user::text,
    'auth_uid', auth.uid()::text,
    'is_admin', public.is_admin(),
    'is_supplier', public.is_supplier()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.r4_context_probe_direct() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.r4_context_probe_direct() TO authenticated;

-- Live trigger order for public."Orders" (alphabetical). The R4 design relies
-- on trg_aa_guard_order_supplier_allowlist firing before trg_freeze_order_pricing
-- and trg_zz_guard_order_timestamps firing last. Probes the live database
-- rather than assuming.
CREATE OR REPLACE FUNCTION public.r4_trigger_order()
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT array_agg(t.tgname ORDER BY t.tgname)
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'Orders' AND NOT t.tgisinternal
$$;

REVOKE EXECUTE ON FUNCTION public.r4_trigger_order() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.r4_trigger_order() TO authenticated;
