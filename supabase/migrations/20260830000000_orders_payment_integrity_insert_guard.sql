/*
# Orders Payment-Integrity Guard — BEFORE INSERT

Closes the R2 confirmed defect: a customer could INSERT an Orders row already
in `Paid` state with arbitrary financials because `guard_order_payment()` is
attached to BEFORE UPDATE only.

This migration adds a **BEFORE INSERT** trigger that enforces, for every
authenticated NON-ADMIN INSERT (the `insert_own_orders` RLS audience):

- `payment_status` must be `NULL` or `'Pending'` — `'Paid'` / `'Ready To Pay'`
  are rejected at creation time, so the intended state machine
  (`Pending -> Ready To Pay -> Paid`) can only be entered at `Pending`.
- `paid_at` must be `NULL`.
- `paid_by` must be `NULL`.
- `subtotal`, `delivery_fee`, `total` must be non-negative.
- `total` must equal `subtotal + delivery_fee` within the agreed cent
  tolerance (0.005) — a forged `total` (e.g. 0.01 against a 41.50 basket) is
  rejected even when internally self-consistent money is supplied.
- When `delivery_point_name` resolves to an ACTIVE `delivery_points` row, the
  supplied `delivery_fee` must match the authoritative fee (± tolerance).
  Unknown / fake delivery-point names stay LENIENT because existing test
  fixtures (verify.checkout.ts, verify.order-calculation.ts, ...) depend on
  non-existent point names being accepted.

Pass-through (unchanged behaviour):

- **Service-role / no-auth inserts** (auth.uid() IS NULL): allowed. Test
  fixtures seed `Paid` orders via the service client (ui-operations.spec.ts).
- **Admin inserts** (public.is_admin()): allowed — admins may restore /
  backfill orders in any payment state.

Explicitly NOT changed (per approved R2 design):

- The existing BEFORE UPDATE guard `trg_guard_order_payment` is untouched.
- `freeze_order_pricing()` / `trg_freeze_order_pricing_insert` are untouched
  (they recompute revenue/supplier_cost/gross_profit from item snapshots; the
  guard only neutralises the `frozen_total := COALESCE(NEW.total, ...)` leak by
  forcing `total = subtotal + delivery_fee`).
- No RLS policies are modified.
- No application code is modified.

Idempotent: CREATE OR REPLACE FUNCTION + guarded trigger recreation.
*/
CREATE OR REPLACE FUNCTION public.guard_order_payment_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  point_fee numeric(10,2);
BEGIN
  -- Only guard authenticated non-admin INSERTs. Service-role / no-auth
  -- inserts (auth.uid() IS NULL) and admin inserts pass through.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN

    -- ── Payment state must start Pending (NULL falls back to the column
    --    DEFAULT 'Pending'); Paid / Ready To Pay are creation-time rejects. ──
    IF NEW.payment_status IS NOT NULL AND NEW.payment_status <> 'Pending' THEN
      RAISE EXCEPTION 'Customer-created orders must start with payment_status Pending (got %).', NEW.payment_status;
    END IF;

    -- ── Payment provenance must be empty at creation. ──────────────────────
    IF NEW.paid_at IS NOT NULL THEN
      RAISE EXCEPTION 'Customer-created orders cannot set paid_at.';
    END IF;
    IF NEW.paid_by IS NOT NULL THEN
      RAISE EXCEPTION 'Customer-created orders cannot set paid_by.';
    END IF;

    -- ── Money must be non-negative and internally consistent. ──────────────
    IF NEW.subtotal < 0 OR NEW.delivery_fee < 0 OR NEW.total < 0 THEN
      RAISE EXCEPTION 'Customer-created orders cannot have negative subtotal, delivery_fee or total.';
    END IF;
    IF abs(NEW.total - (NEW.subtotal + NEW.delivery_fee)) > 0.005 THEN
      RAISE EXCEPTION 'Customer-created orders must satisfy total = subtotal + delivery_fee (got total %, subtotal %, fee %).',
        NEW.total, NEW.subtotal, NEW.delivery_fee;
    END IF;

    -- ── Authoritative delivery fee when the point resolves (lenient otherwise). ──
    IF NEW.delivery_point_name IS NOT NULL AND NEW.delivery_point_name <> '' THEN
      SELECT dp.delivery_fee INTO point_fee
        FROM public.delivery_points dp
       WHERE dp.name = NEW.delivery_point_name
         AND dp.active
       LIMIT 1;
      IF FOUND THEN
        IF abs(NEW.delivery_fee - point_fee) > 0.005 THEN
          RAISE EXCEPTION 'Delivery fee % does not match the active delivery point % (fee %).',
            NEW.delivery_fee, NEW.delivery_point_name, point_fee;
        END IF;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_order_payment_insert ON public."Orders";
CREATE TRIGGER trg_guard_order_payment_insert
  BEFORE INSERT ON public."Orders"
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_payment_insert();
