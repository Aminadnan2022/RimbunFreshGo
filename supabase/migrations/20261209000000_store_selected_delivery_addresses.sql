-- Persist the customer-selected Lalamove destination without mutating the
-- immutable canonical delivery snapshot or exposing coordinates to clients.

BEGIN;

CREATE TABLE public.sales_order_delivery_locations (
  sales_order_id uuid PRIMARY KEY REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  display_address text NOT NULL CHECK (char_length(btrim(display_address)) BETWEEN 5 AND 300),
  latitude numeric(10, 8) NOT NULL CHECK (latitude BETWEEN 0.8 AND 7.5),
  longitude numeric(11, 8) NOT NULL CHECK (longitude BETWEEN 99.5 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_order_delivery_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_order_delivery_locations FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.sales_order_delivery_locations IS
  'Append-only selected destination coordinates for external customer delivery. Written atomically by place_sales_order.';

CREATE OR REPLACE FUNCTION public.place_sales_order(
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
  v_display_address text;
  v_latitude numeric;
  v_longitude numeric;
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to place an order.';
  END IF;
  IF NOT public.is_permanent_authenticated_user()
     AND current_setting('freshgo.guest_checkout', true) IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'Anonymous checkout must use the verified guest checkout endpoint.' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_key) < 16 OR char_length(v_key) > 128
     OR v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$' THEN
    RAISE EXCEPTION 'A valid checkout idempotency key is required.' USING ERRCODE = '22023';
  END IF;

  IF p_delivery_request ->> 'method_code' = 'instant_customer_lalamove' THEN
    v_display_address := btrim(COALESCE(p_delivery_request ->> 'display_address', ''));
    BEGIN
      v_latitude := NULLIF(p_delivery_request ->> 'latitude', '')::numeric;
      v_longitude := NULLIF(p_delivery_request ->> 'longitude', '')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Selected delivery coordinates are invalid.' USING ERRCODE = '22023';
    END;
    IF char_length(v_display_address) < 5 OR char_length(v_display_address) > 300
       OR v_latitude IS NULL OR v_longitude IS NULL
       OR v_latitude NOT BETWEEN 0.8 AND 7.5
       OR v_longitude NOT BETWEEN 99.5 AND 120 THEN
      RAISE EXCEPTION 'A selected Malaysian delivery address and coordinates are required.' USING ERRCODE = '22023';
    END IF;
  END IF;

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

  IF p_delivery_request ->> 'method_code' = 'instant_customer_lalamove' THEN
    INSERT INTO public.sales_order_delivery_locations (
      sales_order_id, display_address, latitude, longitude
    ) VALUES (
      v_result.sales_order_id, v_display_address, v_latitude, v_longitude
    );
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.place_sales_order(jsonb, jsonb, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_sales_order(jsonb, jsonb, jsonb, jsonb, text) TO authenticated;

COMMIT;
