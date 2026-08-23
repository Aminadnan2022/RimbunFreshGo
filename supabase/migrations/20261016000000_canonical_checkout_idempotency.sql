-- Gate 2: canonical checkout idempotency.
-- A key is authoritative only within one authenticated customer's namespace.
-- An error in checkout rolls the entire transaction back, including this map.

BEGIN;

CREATE TABLE public.sales_order_checkout_idempotency (
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (
    char_length(idempotency_key) BETWEEN 16 AND 128
    AND idempotency_key = btrim(idempotency_key)
  ),
  sales_order_id uuid NOT NULL UNIQUE REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, idempotency_key)
);

REVOKE ALL ON TABLE public.sales_order_checkout_idempotency FROM PUBLIC;
REVOKE ALL ON TABLE public.sales_order_checkout_idempotency FROM anon, authenticated;

-- Keep Gate 1's checked checkout implementation private; the wrapper below
-- owns the network-retry boundary.
ALTER FUNCTION public.place_sales_order(jsonb, jsonb, jsonb, jsonb)
  RENAME TO place_sales_order_unkeyed_internal;
REVOKE EXECUTE ON FUNCTION public.place_sales_order_unkeyed_internal(jsonb, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.place_sales_order(
  p_customer_snapshot jsonb,
  p_delivery_request jsonb,
  p_items jsonb,
  p_preparation_answers jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE (
  sales_order_id uuid,
  order_number text,
  price_status text,
  payment_status text,
  requires_supplier_finalisation boolean,
  estimated_total numeric,
  final_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_id uuid := auth.uid();
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_existing public.sales_order_checkout_idempotency%ROWTYPE;
  v_result record;
  v_response jsonb;
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to place an order.';
  END IF;
  IF char_length(v_key) < 16 OR char_length(v_key) > 128
     OR v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$' THEN
    RAISE EXCEPTION 'A valid checkout idempotency key is required.' USING ERRCODE = '22023';
  END IF;

  -- Only same customer/key requests serialise. The primary key is the
  -- durable backstop if this implementation ever changes.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_customer_id::text || ':' || v_key, 0));

  SELECT * INTO v_existing
    FROM public.sales_order_checkout_idempotency
   WHERE customer_id = v_customer_id AND idempotency_key = v_key;
  IF FOUND THEN
    RETURN QUERY SELECT
      v_existing.sales_order_id,
      v_existing.response ->> 'order_number',
      v_existing.response ->> 'price_status',
      v_existing.response ->> 'payment_status',
      (v_existing.response ->> 'requires_supplier_finalisation')::boolean,
      (v_existing.response ->> 'estimated_total')::numeric,
      NULLIF(v_existing.response ->> 'final_total', '')::numeric;
    RETURN;
  END IF;

  SELECT * INTO v_result
    FROM public.place_sales_order_unkeyed_internal(
      p_customer_snapshot, p_delivery_request, p_items, p_preparation_answers
    );

  v_response := jsonb_build_object(
    'order_number', v_result.order_number,
    'price_status', v_result.price_status,
    'payment_status', v_result.payment_status,
    'requires_supplier_finalisation', v_result.requires_supplier_finalisation,
    'estimated_total', v_result.estimated_total,
    'final_total', v_result.final_total
  );
  INSERT INTO public.sales_order_checkout_idempotency (
    customer_id, idempotency_key, sales_order_id, response
  ) VALUES (v_customer_id, v_key, v_result.sales_order_id, v_response);

  RETURN QUERY SELECT v_result.sales_order_id, v_result.order_number,
    v_result.price_status, v_result.payment_status,
    v_result.requires_supplier_finalisation, v_result.estimated_total,
    v_result.final_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_sales_order(jsonb, jsonb, jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_sales_order(jsonb, jsonb, jsonb, jsonb, text) TO authenticated;

COMMIT;
