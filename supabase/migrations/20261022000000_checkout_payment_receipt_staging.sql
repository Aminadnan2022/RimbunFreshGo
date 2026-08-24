-- Secure pre-order payment receipt staging for fixed-price checkout.

BEGIN;

CREATE TABLE public.checkout_payment_receipt_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (
    char_length(idempotency_key) BETWEEN 16 AND 128
    AND idempotency_key = btrim(idempotency_key)
  ),
  storage_path text NOT NULL UNIQUE,
  original_file_name text NOT NULL CHECK (char_length(original_file_name) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size integer NOT NULL CHECK (file_size BETWEEN 1 AND 5242880),
  expected_final_total numeric(12,2) NOT NULL CHECK (expected_final_total >= 0),
  payment_configuration_version_id uuid NOT NULL REFERENCES public.payment_configuration_versions(id) ON DELETE RESTRICT,
  consumed_sales_order_id uuid UNIQUE REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key),
  CHECK ((consumed_sales_order_id IS NULL) = (consumed_at IS NULL))
);

ALTER TABLE public.checkout_payment_receipt_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.checkout_payment_receipt_staging FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stage_checkout_payment_receipt(
  p_idempotency_key text,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size integer,
  p_expected_final_total numeric,
  p_payment_configuration_version_id uuid
)
RETURNS TABLE (id uuid, storage_path text, original_file_name text, mime_type text, file_size integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_customer_id uuid := auth.uid();
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_row public.checkout_payment_receipt_staging%ROWTYPE;
BEGIN
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF char_length(v_key) < 16 OR char_length(v_key) > 128
     OR v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$' THEN
    RAISE EXCEPTION 'A valid checkout idempotency key is required.' USING ERRCODE = '22023';
  END IF;
  IF split_part(p_storage_path, '/', 1) <> 'staging'
     OR split_part(p_storage_path, '/', 2) <> v_customer_id::text
     OR split_part(p_storage_path, '/', 3) <> v_key
     OR split_part(p_storage_path, '/', 4) !~ '^[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp|pdf)$'
     OR split_part(p_storage_path, '/', 5) <> '' THEN
    RAISE EXCEPTION 'Invalid staged receipt path.' USING ERRCODE = '22023';
  END IF;
  IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
     OR p_file_size < 1 OR p_file_size > 5242880 THEN
    RAISE EXCEPTION 'Receipt must be JPG, PNG, WebP, or PDF and no larger than 5 MB.' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(p_original_file_name, '')), '') IS NULL OR char_length(p_original_file_name) > 255 THEN
    RAISE EXCEPTION 'Invalid receipt file name.' USING ERRCODE = '22023';
  END IF;
  IF p_expected_final_total IS NULL OR p_expected_final_total < 0 THEN
    RAISE EXCEPTION 'A valid expected final total is required.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payment_configuration_versions v
    WHERE v.id = p_payment_configuration_version_id
      AND v.configuration_code = 'freshgo_manual_qr'
      AND v.status = 'published'
  ) THEN RAISE EXCEPTION 'Invalid payment configuration.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'sales-order-payment-receipts'
      AND o.name = p_storage_path
      AND o.owner_id = v_customer_id::text
  ) THEN RAISE EXCEPTION 'Staged receipt object was not found.'; END IF;

  INSERT INTO public.checkout_payment_receipt_staging AS s (
    customer_id, idempotency_key, storage_path, original_file_name, mime_type,
    file_size, expected_final_total, payment_configuration_version_id
  ) VALUES (
    v_customer_id, v_key, p_storage_path, btrim(p_original_file_name), p_mime_type,
    p_file_size, round(p_expected_final_total, 2), p_payment_configuration_version_id
  )
  ON CONFLICT (customer_id, idempotency_key) DO UPDATE SET
    storage_path = EXCLUDED.storage_path,
    original_file_name = EXCLUDED.original_file_name,
    mime_type = EXCLUDED.mime_type,
    file_size = EXCLUDED.file_size,
    expected_final_total = EXCLUDED.expected_final_total,
    payment_configuration_version_id = EXCLUDED.payment_configuration_version_id,
    updated_at = now()
  WHERE s.consumed_sales_order_id IS NULL
  RETURNING s.* INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'This checkout receipt has already been consumed.'; END IF;
  RETURN QUERY SELECT v_row.id, v_row.storage_path, v_row.original_file_name, v_row.mime_type, v_row.file_size;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stage_checkout_payment_receipt(text, text, text, text, integer, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stage_checkout_payment_receipt(text, text, text, text, integer, numeric, uuid) TO authenticated;

DROP POLICY IF EXISTS checkout_receipt_staging_insert ON storage.objects;
CREATE POLICY checkout_receipt_staging_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'sales-order-payment-receipts'
  AND split_part(name, '/', 1) = 'staging'
  AND split_part(name, '/', 2) = auth.uid()::text
  AND split_part(name, '/', 3) ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
  AND split_part(name, '/', 4) ~ '^[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp|pdf)$'
  AND split_part(name, '/', 5) = ''
);

DROP POLICY IF EXISTS checkout_receipt_staging_select ON storage.objects;
CREATE POLICY checkout_receipt_staging_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'sales-order-payment-receipts'
  AND split_part(name, '/', 1) = 'staging'
  AND split_part(name, '/', 2) = auth.uid()::text
);

DROP POLICY IF EXISTS checkout_receipt_staging_delete ON storage.objects;
CREATE POLICY checkout_receipt_staging_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'sales-order-payment-receipts'
  AND split_part(name, '/', 1) = 'staging'
  AND split_part(name, '/', 2) = auth.uid()::text
  AND NOT EXISTS (
    SELECT 1 FROM public.checkout_payment_receipt_staging s
    WHERE s.storage_path = name AND s.consumed_sales_order_id IS NOT NULL
  )
);

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
  SELECT * INTO v_stage FROM public.checkout_payment_receipt_staging
  WHERE customer_id = v_customer_id AND idempotency_key = v_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Upload a payment receipt before placing this order.'; END IF;
  IF round(v_stage.expected_final_total, 2) <> round(p_expected_final_total, 2)
     OR v_stage.payment_configuration_version_id IS DISTINCT FROM p_expected_payment_configuration_version_id THEN
    RAISE EXCEPTION 'The checkout payment details changed after receipt upload. Review the amount and upload the receipt again.';
  END IF;

  SELECT * INTO v_result FROM public.place_sales_order(
    p_customer_snapshot, p_delivery_request, p_items, p_preparation_answers, v_key
  );

  SELECT o.payment_configuration_version_id INTO v_snapshotted_payment_version_id
  FROM public.sales_orders o WHERE o.id = v_result.sales_order_id AND o.customer_id = v_customer_id;

  IF v_result.requires_supplier_finalisation OR v_result.price_status <> 'final' OR v_result.final_total IS NULL THEN
    RAISE EXCEPTION 'This order requires supplier finalisation. Refresh checkout and place it without pre-payment.';
  END IF;
  IF round(v_result.final_total, 2) <> round(p_expected_final_total, 2) THEN
    RAISE EXCEPTION 'The checkout total changed before placement. Refresh checkout before paying or placing the order.';
  END IF;
  IF v_snapshotted_payment_version_id IS DISTINCT FROM p_expected_payment_configuration_version_id THEN
    RAISE EXCEPTION 'The payment QR changed before placement. Refresh checkout before paying or placing the order.';
  END IF;

  SELECT r.id INTO v_receipt_id FROM public.sales_order_payment_receipts r
  WHERE r.sales_order_id = v_result.sales_order_id AND r.storage_path = v_stage.storage_path;
  IF v_receipt_id IS NULL THEN
    PERFORM set_config('freshgo.canonical_operation', 'receipt_submission', true);
    INSERT INTO public.sales_order_payment_receipts (
      sales_order_id, storage_path, original_file_name, mime_type, file_size, uploaded_by
    ) VALUES (
      v_result.sales_order_id, v_stage.storage_path, v_stage.original_file_name,
      v_stage.mime_type, v_stage.file_size, v_customer_id
    ) RETURNING id INTO v_receipt_id;
    UPDATE public.sales_orders SET payment_status = 'receipt_submitted', receipt_submitted_at = now()
    WHERE id = v_result.sales_order_id AND payment_status = 'pending';
    INSERT INTO public.sales_order_events (sales_order_id, event_type, actor_id, payload)
    VALUES (v_result.sales_order_id, 'payment_receipt_submitted', v_customer_id, jsonb_build_object('receipt_id', v_receipt_id, 'source', 'checkout'));
    INSERT INTO public.notifications (recipient_role, sales_order_id, notification_type, title, message, payload)
    VALUES ('admin', v_result.sales_order_id, 'payment_receipt_submitted', 'Payment receipt received', 'A payment receipt is ready for verification.', jsonb_build_object('receipt_id', v_receipt_id));
  END IF;

  UPDATE public.checkout_payment_receipt_staging SET
    consumed_sales_order_id = v_result.sales_order_id, consumed_at = COALESCE(consumed_at, now()), updated_at = now()
  WHERE id = v_stage.id AND (consumed_sales_order_id IS NULL OR consumed_sales_order_id = v_result.sales_order_id);

  RETURN QUERY SELECT v_result.sales_order_id, v_result.order_number, v_result.price_status,
    'receipt_submitted'::text, v_result.requires_supplier_finalisation,
    v_result.estimated_total, v_result.final_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_sales_order_with_checkout_payment_preview(jsonb, jsonb, jsonb, jsonb, text, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_sales_order_with_checkout_payment_preview(jsonb, jsonb, jsonb, jsonb, text, numeric, uuid) TO authenticated;

COMMIT;
