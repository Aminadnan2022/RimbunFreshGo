/*
# Orders Payment & State-Integrity Guard

Closes Phase 9 confirmed defects at the DATABASE layer. RLS policies
(`admin_update_orders`, `supplier_update_orders`) are intentionally left broad
so suppliers can process any order row; this migration adds the value/state
invariants that RLS (which only sees the NEW row pre-Postgres-18) cannot
express.

Enforced by `guard_order_payment()` (BEFORE UPDATE trigger):

- Paid orders are TERMINAL and their financial surface is FROZEN for everyone:
  - `payment_status` cannot be changed away from 'Paid'
  - `order_items, supplier_weights, revenue, supplier_cost, gross_profit,
     profit_margin_percent, subtotal, delivery_fee, total, frozen_total,
     pricing_snapshot_timestamp` must be byte-identical to the stored row
- Non-admin callers (suppliers/customers) can NEVER:
  - set `payment_status = 'Paid'`
  - change `paid_at` or `paid_by`
- Supplier payment transitions are forward-only relative to the existing
  application workflow (`Pending -> Ready To Pay`, same-status writes):
  - `Ready To Pay -> Pending` is rejected
  - any value outside `'Pending' / 'Ready To Pay'` is rejected

Operational/delivery columns are NOT locked (packing_*, supplier_dispatch_*,
ready_for_rider_at, delivery_status, lalamove_*, booking_reference,
updated_at, updated_by, ...) so the existing dispatch/rider RPCs
(20260808000000, 20260816000000) keep working on Paid orders.

Checks: adds `orders_payment_status_check` (Pending/Ready To Pay/Paid) guarded
by a DO-block that aborts if existing rows contain invalid values.
*/

-- 1. Fail loudly if existing data would violate the new CHECK constraint.
DO $$
DECLARE
  invalid_rows integer;
BEGIN
  SELECT count(*) INTO invalid_rows
    FROM public."Orders"
   WHERE payment_status IS NULL
      OR payment_status NOT IN ('Pending', 'Ready To Pay', 'Paid');
  IF invalid_rows > 0 THEN
    RAISE EXCEPTION 'Cannot add payment_status CHECK: % order(s) have an invalid payment_status.', invalid_rows;
  END IF;
END
$$;

-- 2. Canonical payment-status enum (defense in depth).
ALTER TABLE public."Orders"
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public."Orders"
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('Pending', 'Ready To Pay', 'Paid'));

-- 3. Payment / state-integrity guard trigger.
CREATE OR REPLACE FUNCTION public.guard_order_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_is_admin    boolean;
  caller_is_supplier boolean;
BEGIN
  caller_is_admin    := public.is_admin();     -- SECURITY DEFINER (existing)
  caller_is_supplier := public.is_supplier();  -- SECURITY DEFINER (existing)

  -- ── Paid orders are terminal; financial surface frozen for EVERYONE ──────
  IF OLD.payment_status = 'Paid' THEN
    IF NEW.payment_status IS DISTINCT FROM 'Paid' THEN
      RAISE EXCEPTION 'Paid order % cannot be reverted to %', OLD.id, COALESCE(NEW.payment_status, 'NULL');
    END IF;

    IF row(NEW.order_items, NEW.supplier_weights,
           NEW.revenue, NEW.supplier_cost, NEW.gross_profit,
           NEW.profit_margin_percent, NEW.subtotal,
           NEW.delivery_fee, NEW.total, NEW.frozen_total,
           NEW.pricing_snapshot_timestamp)
       IS DISTINCT FROM
       row(OLD.order_items, OLD.supplier_weights,
           OLD.revenue, OLD.supplier_cost, OLD.gross_profit,
           OLD.profit_margin_percent, OLD.subtotal,
           OLD.delivery_fee, OLD.total, OLD.frozen_total,
           OLD.pricing_snapshot_timestamp) THEN
      RAISE EXCEPTION 'Paid order % is locked: financial fields are immutable once an order is Paid.', OLD.id;
    END IF;
  END IF;

  -- ── Non-admin callers: payment-admin fields are admin-only ───────────────
  IF NOT caller_is_admin THEN
    IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION 'Only admins can modify paid_at on order %.', OLD.id;
    END IF;
    IF NEW.paid_by IS DISTINCT FROM OLD.paid_by THEN
      RAISE EXCEPTION 'Only admins can modify paid_by on order %.', OLD.id;
    END IF;
    IF NEW.payment_status = 'Paid' THEN
      RAISE EXCEPTION 'Only admins can set payment_status to Paid (order %)', OLD.id;
    END IF;
  END IF;

  -- ── Supplier workflow: forward-only transitions (Pending -> Ready To Pay) ─
  IF caller_is_supplier AND NOT caller_is_admin THEN
    IF OLD.payment_status = 'Ready To Pay' AND NEW.payment_status = 'Pending' THEN
      RAISE EXCEPTION 'Supplier cannot move a Ready To Pay order back to Pending (order %)', OLD.id;
    END IF;
    IF NEW.payment_status IS DISTINCT FROM 'Pending' AND NEW.payment_status IS DISTINCT FROM 'Ready To Pay' THEN
      RAISE EXCEPTION 'Supplier can only set payment_status to Pending or Ready To Pay (order %)', OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_payment ON public."Orders";
CREATE TRIGGER trg_guard_order_payment
  BEFORE UPDATE ON public."Orders"
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_payment();