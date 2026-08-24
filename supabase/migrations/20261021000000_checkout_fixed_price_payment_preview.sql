-- Fixed-price checkout payment preview.
-- Exposes only the currently payable QR metadata and adds a guarded placement
-- entrypoint. The guard rolls the whole transaction back if checkout pricing,
-- finalisation state, or payment configuration differs from what Step 4 showed.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_checkout_payment_configuration()
RETURNS TABLE (
  id uuid,
  qr_storage_path text,
  instructions text,
  currency_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT v.id, v.qr_storage_path, v.instructions, v.currency_code
  FROM public.payment_configuration_versions v
  WHERE v.configuration_code = 'freshgo_manual_qr'
    AND v.status = 'published'
    AND v.effective_from <= now()
    AND (v.effective_to IS NULL OR v.effective_to > now())
    AND NULLIF(btrim(v.qr_storage_path), '') IS NOT NULL
  ORDER BY v.effective_from DESC, v.version_number DESC
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.get_checkout_payment_configuration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_checkout_payment_configuration() TO authenticated;

CREATE OR REPLACE FUNCTION public.place_sales_order_with_checkout_payment_preview(
  p_customer_snapshot jsonb,
  p_delivery_request jsonb,
  p_items jsonb,
  p_preparation_answers jsonb,
  p_idempotency_key text,
  p_expected_final_total numeric,
  p_expected_payment_configuration_version_id uuid
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
  v_result record;
  v_snapshotted_payment_version_id uuid;
BEGIN
  IF p_expected_final_total IS NULL OR p_expected_final_total < 0 THEN
    RAISE EXCEPTION 'A valid expected final total is required.' USING ERRCODE = '22023';
  END IF;
  IF p_expected_payment_configuration_version_id IS NULL THEN
    RAISE EXCEPTION 'An expected payment configuration is required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_result
  FROM public.place_sales_order(
    p_customer_snapshot,
    p_delivery_request,
    p_items,
    p_preparation_answers,
    p_idempotency_key
  );

  SELECT o.payment_configuration_version_id
  INTO v_snapshotted_payment_version_id
  FROM public.sales_orders o
  WHERE o.id = v_result.sales_order_id
    AND o.customer_id = auth.uid();

  IF v_result.requires_supplier_finalisation
     OR v_result.price_status <> 'final'
     OR v_result.final_total IS NULL THEN
    RAISE EXCEPTION 'This order requires supplier finalisation. Refresh checkout and place it without pre-payment.'
      USING ERRCODE = 'P0001';
  END IF;

  IF round(v_result.final_total, 2) <> round(p_expected_final_total, 2) THEN
    RAISE EXCEPTION 'The checkout total changed before placement. Refresh checkout before paying or placing the order.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_snapshotted_payment_version_id IS DISTINCT FROM p_expected_payment_configuration_version_id THEN
    RAISE EXCEPTION 'The payment QR changed before placement. Refresh checkout before paying or placing the order.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT
    v_result.sales_order_id,
    v_result.order_number,
    v_result.price_status,
    v_result.payment_status,
    v_result.requires_supplier_finalisation,
    v_result.estimated_total,
    v_result.final_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_sales_order_with_checkout_payment_preview(
  jsonb, jsonb, jsonb, jsonb, text, numeric, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_sales_order_with_checkout_payment_preview(
  jsonb, jsonb, jsonb, jsonb, text, numeric, uuid
) TO authenticated;

COMMIT;
