-- Qualify identifiers in the guarded fixed-price placement and staged-receipt
-- transaction. The function's RETURNS TABLE columns are PL/pgSQL variables,
-- so unqualified table columns with the same names can be ambiguous.

BEGIN;

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
  sales_order_id uuid, order_number text, price_status text, payment_status text,
  requires_supplier_finalisation boolean, estimated_total numeric, final_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_id uuid := auth.uid();
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_result record;
  v_stage public.checkout_payment_receipt_staging%ROWTYPE;
  v_snapshotted_payment_version_id uuid;
  v_receipt_id uuid;
BEGIN
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF p_expected_final_total IS NULL OR p_expected_final_total < 0 THEN
    RAISE EXCEPTION 'A valid expected final total is required.' USING ERRCODE = '22023';
  END IF;
  IF p_expected_payment_configuration_version_id IS NULL THEN
    RAISE EXCEPTION 'An expected payment configuration is required.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_customer_id::text || ':' || v_key, 0));
  SELECT stage.* INTO v_stage
  FROM public.checkout_payment_receipt_staging AS stage
  WHERE stage.customer_id = v_customer_id
    AND stage.idempotency_key = v_key
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Upload a payment receipt before placing this order.'; END IF;
  IF round(v_stage.expected_final_total, 2) <> round(p_expected_final_total, 2)
     OR v_stage.payment_configuration_version_id IS DISTINCT FROM p_expected_payment_configuration_version_id THEN
    RAISE EXCEPTION 'The checkout payment details changed after receipt upload. Review the amount and upload the receipt again.';
  END IF;

  SELECT placed.* INTO v_result
  FROM public.place_sales_order(
    p_customer_snapshot, p_delivery_request, p_items, p_preparation_answers, v_key
  ) AS placed;

  SELECT orders.payment_configuration_version_id INTO v_snapshotted_payment_version_id
  FROM public.sales_orders AS orders
  WHERE orders.id = v_result.sales_order_id
    AND orders.customer_id = v_customer_id;

  IF v_result.requires_supplier_finalisation OR v_result.price_status <> 'final' OR v_result.final_total IS NULL THEN
    RAISE EXCEPTION 'This order requires supplier finalisation. Refresh checkout and place it without pre-payment.';
  END IF;
  IF round(v_result.final_total, 2) <> round(p_expected_final_total, 2) THEN
    RAISE EXCEPTION 'The checkout total changed before placement. Refresh checkout before paying or placing the order.';
  END IF;
  IF v_snapshotted_payment_version_id IS DISTINCT FROM p_expected_payment_configuration_version_id THEN
    RAISE EXCEPTION 'The payment QR changed before placement. Refresh checkout before paying or placing the order.';
  END IF;

  SELECT receipts.id INTO v_receipt_id
  FROM public.sales_order_payment_receipts AS receipts
  WHERE receipts.sales_order_id = v_result.sales_order_id
    AND receipts.storage_path = v_stage.storage_path;
  IF v_receipt_id IS NULL THEN
    PERFORM set_config('freshgo.canonical_operation', 'receipt_submission', true);
    INSERT INTO public.sales_order_payment_receipts AS receipts (
      sales_order_id, storage_path, original_file_name, mime_type, file_size, uploaded_by
    ) VALUES (
      v_result.sales_order_id, v_stage.storage_path, v_stage.original_file_name,
      v_stage.mime_type, v_stage.file_size, v_customer_id
    ) RETURNING receipts.id INTO v_receipt_id;
    UPDATE public.sales_orders AS orders
    SET payment_status = 'receipt_submitted', receipt_submitted_at = now()
    WHERE orders.id = v_result.sales_order_id
      AND orders.payment_status = 'pending';
    INSERT INTO public.sales_order_events (sales_order_id, event_type, actor_id, payload)
    VALUES (v_result.sales_order_id, 'payment_receipt_submitted', v_customer_id, jsonb_build_object('receipt_id', v_receipt_id, 'source', 'checkout'));
    INSERT INTO public.notifications (recipient_role, sales_order_id, notification_type, title, message, payload)
    VALUES ('admin', v_result.sales_order_id, 'payment_receipt_submitted', 'Payment receipt received', 'A payment receipt is ready for verification.', jsonb_build_object('receipt_id', v_receipt_id));
  END IF;

  UPDATE public.checkout_payment_receipt_staging AS stage
  SET consumed_sales_order_id = v_result.sales_order_id,
      consumed_at = COALESCE(stage.consumed_at, now()),
      updated_at = now()
  WHERE stage.id = v_stage.id
    AND (stage.consumed_sales_order_id IS NULL
      OR stage.consumed_sales_order_id = v_result.sales_order_id);

  RETURN QUERY SELECT v_result.sales_order_id, v_result.order_number, v_result.price_status,
    'receipt_submitted'::text, v_result.requires_supplier_finalisation,
    v_result.estimated_total, v_result.final_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_sales_order_with_checkout_payment_preview(
  jsonb, jsonb, jsonb, jsonb, text, numeric, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_sales_order_with_checkout_payment_preview(
  jsonb, jsonb, jsonb, jsonb, text, numeric, uuid
) TO authenticated;

COMMIT;
