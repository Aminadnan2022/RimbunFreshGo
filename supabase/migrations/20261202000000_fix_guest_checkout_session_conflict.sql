-- Qualify the guest-session upsert conflict target inside the table-returning
-- function so PL/pgSQL does not confuse output-column variables with columns.
BEGIN;

CREATE OR REPLACE FUNCTION public.place_guest_sales_order(
  p_customer_snapshot jsonb,
  p_delivery_request jsonb,
  p_items jsonb,
  p_preparation_answers jsonb,
  p_idempotency_key text,
  p_access_token text,
  p_expected_final_total numeric DEFAULT NULL,
  p_expected_payment_configuration_version_id uuid DEFAULT NULL
)
RETURNS TABLE (
  sales_order_id uuid, order_number text, price_status text, payment_status text,
  requires_supplier_finalisation boolean, estimated_total numeric, final_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_identity_id uuid := auth.uid();
  v_result record;
  v_existing_hash bytea;
  v_token_hash bytea;
  v_phone text := regexp_replace(COALESCE(p_customer_snapshot ->> 'phone', ''), '\s', '', 'g');
  v_email text := btrim(COALESCE(p_customer_snapshot ->> 'email', ''));
BEGIN
  IF v_identity_id IS NULL OR NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'Guest checkout requires a temporary guest session.' USING ERRCODE = '42501';
  END IF;
  IF p_access_token IS NULL OR char_length(p_access_token) < 43 OR char_length(p_access_token) > 128
     OR p_access_token !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'A valid guest access token is required.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_customer_snapshot ->> 'name'), '') IS NULL THEN
    RAISE EXCEPTION 'Customer name is required.' USING ERRCODE = '22023';
  END IF;
  IF v_phone !~ '^((\+?60)|0)[0-9]{8,10}$' THEN
    RAISE EXCEPTION 'A valid phone or WhatsApp number is required.' USING ERRCODE = '22023';
  END IF;
  IF v_email <> '' AND v_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Email address is invalid.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_delivery_request ->> 'house_unit'), '') IS NULL
     OR COALESCE(
          NULLIF(btrim(p_delivery_request ->> 'delivery_point_name'), ''),
          NULLIF(btrim(p_delivery_request ->> 'pickup_location'), ''),
          NULLIF(btrim(p_delivery_request ->> 'apartment'), '')
        ) IS NULL THEN
    RAISE EXCEPTION 'A delivery address is required.' USING ERRCODE = '22023';
  END IF;

  v_token_hash := extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256');
  PERFORM set_config('freshgo.guest_checkout', 'verified', true);

  IF p_expected_final_total IS NOT NULL OR p_expected_payment_configuration_version_id IS NOT NULL THEN
    IF p_expected_final_total IS NULL OR p_expected_payment_configuration_version_id IS NULL THEN
      RAISE EXCEPTION 'Complete payment preview details are required.' USING ERRCODE = '22023';
    END IF;
    SELECT placed.* INTO v_result
    FROM public.place_sales_order_with_checkout_payment_preview(
      p_customer_snapshot, p_delivery_request, p_items, p_preparation_answers,
      p_idempotency_key, p_expected_final_total, p_expected_payment_configuration_version_id
    ) AS placed;
  ELSE
    SELECT placed.* INTO v_result
    FROM public.place_sales_order(
      p_customer_snapshot, p_delivery_request, p_items, p_preparation_answers, p_idempotency_key
    ) AS placed;
  END IF;

  SELECT access.access_token_hash INTO v_existing_hash
  FROM public.guest_sales_order_access AS access
  WHERE access.sales_order_id = v_result.sales_order_id;

  IF FOUND AND v_existing_hash <> v_token_hash THEN
    RAISE EXCEPTION 'The checkout retry could not be verified.' USING ERRCODE = '42501';
  ELSIF NOT FOUND THEN
    INSERT INTO public.guest_sales_order_access (sales_order_id, guest_identity_id, access_token_hash)
    VALUES (v_result.sales_order_id, v_identity_id, v_token_hash);
  END IF;

  INSERT INTO public.guest_sales_order_sessions (sales_order_id, session_identity_id)
  VALUES (v_result.sales_order_id, v_identity_id)
  ON CONFLICT ON CONSTRAINT guest_sales_order_sessions_pkey DO UPDATE
    SET verified_at = now(), expires_at = now() + interval '24 hours';

  RETURN QUERY SELECT v_result.sales_order_id, v_result.order_number, v_result.price_status,
    v_result.payment_status, v_result.requires_supplier_finalisation,
    v_result.estimated_total, v_result.final_total;
END;
$$;

COMMIT;
