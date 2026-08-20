-- Guard canonical supplier delivery batch membership by delivery date.
--
-- Canonical sales-order delivery date lives in:
--   sales_orders.delivery_snapshot ->> 'requested_date'
--
-- An order may only belong to a supplier delivery batch serving
-- the same requested delivery date.

CREATE OR REPLACE FUNCTION public.guard_canonical_supplier_batch_delivery_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_delivery_date date;
  v_order_delivery_date date;
BEGIN
  SELECT b.delivery_date
  INTO v_batch_delivery_date
  FROM public.canonical_supplier_delivery_batches b
  WHERE b.id = NEW.batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier delivery batch not found.';
  END IF;

  SELECT NULLIF(o.delivery_snapshot ->> 'requested_date', '')::date
  INTO v_order_delivery_date
  FROM public.sales_orders o
  WHERE o.id = NEW.sales_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order not found.';
  END IF;

  IF v_order_delivery_date IS NULL THEN
    RAISE EXCEPTION 'Order requested delivery date is missing.';
  END IF;

  IF v_order_delivery_date <> v_batch_delivery_date THEN
    RAISE EXCEPTION
      'Order delivery date (%) does not match supplier batch delivery date (%).',
      v_order_delivery_date,
      v_batch_delivery_date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_canonical_supplier_batch_delivery_date
ON public.canonical_supplier_delivery_batch_orders;

CREATE TRIGGER trg_guard_canonical_supplier_batch_delivery_date
BEFORE INSERT OR UPDATE OF batch_id, sales_order_id
ON public.canonical_supplier_delivery_batch_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_canonical_supplier_batch_delivery_date();