/*
# Orders Payment-Integrity Guard — Corrective Fix

Corrects `guard_order_payment()` regression introduced by
20260827000000_orders_payment_integrity_guard.sql.

Root cause: the non-admin "Paid requires admin" branch and the supplier
forward-only branch tested payment_status by VALUE, not by TRANSITION. Any
UPDATE on an already-Paid order (operational columns only, payment_status
unchanged) was rejected because NEW.payment_status = 'Paid'.

The fix makes both branches TRANSITION-aware using IS DISTINCT FROM:

  CASE A (must stay BLOCKED):  OLD.payment_status <> 'Paid' AND NEW.payment_status = 'Paid'
  CASE B (must be ALLOWED):    OLD.payment_status = 'Paid' AND NEW.payment_status = 'Paid'
                               (operational fields only; financials still frozen)

Unchanged invariants:
- Paid orders are terminal (cannot be reverted to Ready To Pay / Pending).
- Paid-order financial fields are immutable for BOTH supplier and admin.
- paid_at / paid_by are admin-only.
- Supplier forward-only pre-Paid workflow (Pending <-> Ready To Pay) is preserved.
- RLS policies, operational RPCs, and application code are untouched.

Idempotent: CREATE OR REPLACE FUNCTION + guarded trigger recreation.
*/
CREATE OR REPLACE FUNCTION public.guard_order_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_is_admin    boolean;
  caller_is_supplier boolean;
  status_transitioned boolean;
BEGIN
  caller_is_admin    := public.is_admin();     -- SECURITY DEFINER (existing)
  caller_is_supplier := public.is_supplier();  -- SECURITY DEFINER (existing)
  status_transitioned := NEW.payment_status IS DISTINCT FROM OLD.payment_status;

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
    -- Transition into Paid — CASE A must remain blocked; CASE B (unchanged
    -- 'Paid') must NOT raise so legitimate operational updates can occur.
    IF status_transitioned AND NEW.payment_status = 'Paid' THEN
      RAISE EXCEPTION 'Only admins can set payment_status to Paid (order %)', OLD.id;
    END IF;
  END IF;

  -- ── Supplier workflow: forward-only transitions (Pending -> Ready To Pay) ─
  IF caller_is_supplier AND NOT caller_is_admin AND status_transitioned THEN
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