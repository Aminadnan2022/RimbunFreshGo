-- FreshGo guest checkout: canonical order placement plus token-scoped buyer access.
-- Raw access tokens are accepted only as RPC inputs and are never persisted.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.guest_sales_order_access (
  sales_order_id uuid PRIMARY KEY REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  guest_identity_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  access_token_hash bytea NOT NULL CHECK (octet_length(access_token_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz,
  claimed_customer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  CHECK ((claimed_customer_id IS NULL) = (claimed_at IS NULL))
);

CREATE TABLE public.guest_sales_order_sessions (
  sales_order_id uuid NOT NULL REFERENCES public.guest_sales_order_access(sales_order_id) ON DELETE CASCADE,
  session_identity_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  PRIMARY KEY (sales_order_id, session_identity_id),
  CHECK (expires_at > verified_at)
);

CREATE TABLE public.guest_sales_order_access_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_identity_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_reference_hash bytea NOT NULL CHECK (octet_length(order_reference_hash) = 32),
  succeeded boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX guest_access_attempts_rate_idx
  ON public.guest_sales_order_access_attempts (session_identity_id, attempted_at DESC);
CREATE INDEX guest_sessions_expiry_idx
  ON public.guest_sales_order_sessions (session_identity_id, expires_at);

ALTER TABLE public.guest_sales_order_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_sales_order_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_sales_order_access_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.guest_sales_order_access FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_sales_order_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_sales_order_access_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_guest_sales_order_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = NEW.sales_order_id;
  IF NOT FOUND
     OR v_order.customer_id IS DISTINCT FROM NEW.guest_identity_id
     OR NULLIF(btrim(v_order.customer_snapshot ->> 'name'), '') IS NULL
     OR NULLIF(btrim(v_order.customer_snapshot ->> 'phone'), '') IS NULL
     OR NULLIF(btrim(v_order.delivery_snapshot ->> 'house_unit'), '') IS NULL
     OR COALESCE(
          NULLIF(btrim(v_order.delivery_snapshot ->> 'delivery_point_name'), ''),
          NULLIF(btrim(v_order.delivery_snapshot ->> 'pickup_location'), ''),
          NULLIF(btrim(v_order.delivery_snapshot ->> 'apartment'), '')
        ) IS NULL THEN
    RAISE EXCEPTION 'Guest order identity and immutable contact snapshots are required.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_guest_sales_order_access_before_write
BEFORE INSERT ON public.guest_sales_order_access
FOR EACH ROW EXECUTE FUNCTION public.validate_guest_sales_order_access();

-- The canonical privacy trigger remains mandatory for registered customers.
-- A guest is admitted only from the guarded wrapper below.
CREATE OR REPLACE FUNCTION public.enforce_customer_privacy_consent_before_checkout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.customer_id = auth.uid()
     AND NOT public.is_admin()
     AND NOT (
       COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false)
       AND current_setting('freshgo.guest_checkout', true) = 'verified'
     )
     AND NOT public.has_current_customer_privacy_consent() THEN
    RAISE EXCEPTION 'Please accept the FreshGo Privacy Notice before placing an order.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

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
  ON CONFLICT (sales_order_id, session_identity_id) DO UPDATE
    SET verified_at = now(), expires_at = now() + interval '24 hours';

  RETURN QUERY SELECT v_result.sales_order_id, v_result.order_number, v_result.price_status,
    v_result.payment_status, v_result.requires_supplier_finalisation,
    v_result.estimated_total, v_result.final_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_guest_sales_order(
  p_order_number text,
  p_access_token text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session_id uuid := auth.uid();
  v_order_id uuid;
  v_expected_hash bytea;
  v_allowed boolean := false;
BEGIN
  IF v_session_id IS NULL OR NULLIF(btrim(p_order_number), '') IS NULL THEN RETURN NULL; END IF;
  IF (SELECT count(*) FROM public.guest_sales_order_access_attempts a
      WHERE a.session_identity_id = v_session_id AND a.attempted_at > clock_timestamp() - interval '1 minute') >= 30 THEN
    RETURN NULL;
  END IF;

  SELECT o.id, a.access_token_hash INTO v_order_id, v_expected_hash
  FROM public.sales_orders o
  JOIN public.guest_sales_order_access a ON a.sales_order_id = o.id
  WHERE o.order_number = btrim(p_order_number);

  IF v_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.guest_sales_order_sessions s
    WHERE s.sales_order_id = v_order_id AND s.session_identity_id = v_session_id AND s.expires_at > now()
  ) THEN
    v_allowed := true;
  ELSIF v_order_id IS NOT NULL AND p_access_token IS NOT NULL
        AND char_length(p_access_token) BETWEEN 43 AND 128
        AND p_access_token ~ '^[A-Za-z0-9_-]+$'
        AND extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256') = v_expected_hash THEN
    v_allowed := true;
    INSERT INTO public.guest_sales_order_sessions (sales_order_id, session_identity_id)
    VALUES (v_order_id, v_session_id)
    ON CONFLICT (sales_order_id, session_identity_id) DO UPDATE
      SET verified_at = now(), expires_at = now() + interval '24 hours';
    UPDATE public.guest_sales_order_access SET last_accessed_at = now() WHERE sales_order_id = v_order_id;
  END IF;

  INSERT INTO public.guest_sales_order_access_attempts
    (session_identity_id, order_reference_hash, succeeded)
  VALUES (v_session_id, extensions.digest(convert_to(btrim(p_order_number), 'UTF8'), 'sha256'), v_allowed);

  IF v_allowed THEN RETURN v_order_id; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_guest_sales_order_session(p_sales_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.guest_sales_order_sessions s
    WHERE s.sales_order_id = p_sales_order_id
      AND s.session_identity_id = auth.uid()
      AND s.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_guest_sales_order_session_path(p_sales_order_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_sales_order_id ~ '^[0-9a-fA-F-]{36}$' AND EXISTS (
    SELECT 1 FROM public.guest_sales_order_sessions s
    WHERE s.sales_order_id::text = p_sales_order_id
      AND s.session_identity_id = auth.uid()
      AND s.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_guest_read_delivery_proof(p_storage_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.canonical_delivery_proofs p
    JOIN public.canonical_sales_order_deliveries d ON d.id = p.delivery_id
    JOIN public.guest_sales_order_sessions s ON s.sales_order_id = d.sales_order_id
    WHERE p.storage_path = p_storage_path
      AND d.status = 'delivered' AND d.delivered_at IS NOT NULL
      AND s.session_identity_id = auth.uid() AND s.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_guest_sales_order(
  p_order_number text,
  p_access_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_result jsonb;
BEGIN
  v_order_id := public.authorize_guest_sales_order(p_order_number, p_access_token);
  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Order access could not be verified.');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'order', jsonb_build_object(
      'id', o.id, 'orderNumber', o.order_number, 'createdAt', o.created_at,
      'status', o.status, 'priceStatus', o.price_status, 'paymentStatus', o.payment_status,
      'estimatedTotal', o.estimated_total, 'finalSubtotal', o.final_subtotal,
      'finalTotal', o.final_total, 'deliveryFee', o.delivery_fee,
      'receiptSubmittedAt', o.receipt_submitted_at,
      'customer', jsonb_build_object('name', o.customer_snapshot ->> 'name', 'phone', o.customer_snapshot ->> 'phone', 'email', NULLIF(o.customer_snapshot ->> 'email', '')),
      'delivery', o.delivery_snapshot,
      'payment', CASE WHEN o.price_status = 'final' THEN jsonb_build_object(
        'qrStoragePath', o.payment_configuration_snapshot ->> 'qr_storage_path',
        'instructions', o.payment_configuration_snapshot ->> 'instructions',
        'rejectionReason', (SELECT r.rejection_reason FROM public.sales_order_payment_receipts r WHERE r.sales_order_id = o.id AND r.verification_status = 'rejected' ORDER BY r.created_at DESC LIMIT 1)
      ) ELSE NULL END,
      'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'lineNumber', l.line_number, 'name', COALESCE(l.product_snapshot ->> 'name', l.product_snapshot ->> 'label', 'Item'),
        'quantity', l.quantity, 'sellingUnit', l.selling_unit, 'orderingMode', l.ordering_mode,
        'unitSellingPrice', l.unit_selling_price, 'estimatedLineTotal', l.estimated_line_total, 'finalLineTotal', l.final_line_total
      ) ORDER BY l.line_number) FROM public.sales_order_lines l WHERE l.sales_order_id = o.id), '[]'::jsonb),
      'tracking', jsonb_build_object(
        'packingStartedAt', (SELECT min(f.packing_started_at) FROM public.sales_order_supplier_fulfilments f WHERE f.sales_order_id = o.id),
        'packingCompletedAt', (SELECT CASE WHEN count(*) > 0 AND count(*) FILTER (WHERE f.status = 'packed') = count(*) THEN max(f.packing_completed_at) END FROM public.sales_order_supplier_fulfilments f WHERE f.sales_order_id = o.id),
        'supplierDispatchStartedAt', (SELECT min(b.dispatched_at) FROM public.canonical_supplier_delivery_batch_orders bo JOIN public.canonical_supplier_delivery_batches b ON b.id = bo.batch_id WHERE bo.sales_order_id = o.id AND b.status IN ('dispatched', 'arrived_hub')),
        'supplierDispatchCompletedAt', (SELECT CASE WHEN count(*) > 0 AND count(*) FILTER (WHERE b.status = 'arrived_hub') = count(*) THEN max(b.arrived_hub_at) END FROM public.canonical_supplier_delivery_batch_orders bo JOIN public.canonical_supplier_delivery_batches b ON b.id = bo.batch_id WHERE bo.sales_order_id = o.id AND b.status <> 'cancelled'),
        'trackingUrl', (SELECT b.tracking_url FROM public.canonical_supplier_delivery_batch_orders bo JOIN public.canonical_supplier_delivery_batches b ON b.id = bo.batch_id WHERE bo.sales_order_id = o.id AND b.status = 'dispatched' AND b.tracking_url IS NOT NULL ORDER BY b.dispatched_at DESC LIMIT 1),
        'readyForRiderAt', (SELECT d.ready_for_rider_at FROM public.canonical_sales_order_deliveries d WHERE d.sales_order_id = o.id),
        'deliveryStartedAt', (SELECT d.delivery_started_at FROM public.canonical_sales_order_deliveries d WHERE d.sales_order_id = o.id),
        'deliveredAt', (SELECT d.delivered_at FROM public.canonical_sales_order_deliveries d WHERE d.sales_order_id = o.id),
        'deliveryStatus', (SELECT d.status FROM public.canonical_sales_order_deliveries d WHERE d.sales_order_id = o.id)
      ),
      'deliveryProofs', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', p.proof_type, 'storagePath', p.storage_path, 'uploadedAt', p.uploaded_at))
        FROM public.canonical_sales_order_deliveries d JOIN public.canonical_delivery_proofs p ON p.delivery_id = d.id
        WHERE d.sales_order_id = o.id AND d.status = 'delivered' AND d.delivered_at IS NOT NULL), '[]'::jsonb)
    )
  ) INTO v_result
  FROM public.sales_orders o WHERE o.id = v_order_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_guest_sales_order_payment_receipt(
  p_sales_order_id uuid,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size integer,
  p_expected_final_total numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_receipt_id uuid;
  v_order public.sales_orders%ROWTYPE;
BEGIN
  IF NOT public.has_guest_sales_order_session(p_sales_order_id) THEN
    RAISE EXCEPTION 'Payment receipt is not currently allowed.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sales_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status = 'cancelled' OR v_order.price_status <> 'final'
     OR v_order.payment_status NOT IN ('pending', 'rejected')
     OR v_order.final_total IS NULL OR round(v_order.final_total, 2) <> round(p_expected_final_total, 2) THEN
    RAISE EXCEPTION 'Payment receipt is not currently allowed.';
  END IF;
  IF p_storage_path !~ ('^guest/' || p_sales_order_id::text || '/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp|pdf)$')
     OR p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
     OR p_file_size <= 0 OR p_file_size > 5242880
     OR NOT EXISTS (SELECT 1 FROM storage.objects so WHERE so.bucket_id = 'sales-order-payment-receipts' AND so.name = p_storage_path) THEN
    RAISE EXCEPTION 'Receipt file is invalid.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('freshgo.canonical_operation', 'receipt_submission', true);
  INSERT INTO public.sales_order_payment_receipts
    (sales_order_id, storage_path, original_file_name, mime_type, file_size, uploaded_by)
  VALUES (p_sales_order_id, p_storage_path, left(p_original_file_name, 255), p_mime_type, p_file_size, auth.uid())
  RETURNING id INTO v_receipt_id;
  UPDATE public.sales_orders SET payment_status = 'receipt_submitted', receipt_submitted_at = now() WHERE id = p_sales_order_id;
  INSERT INTO public.sales_order_events (sales_order_id, event_type, actor_id, payload)
  VALUES (p_sales_order_id, 'payment_receipt_submitted', auth.uid(), jsonb_build_object('receipt_id', v_receipt_id, 'source', 'guest_session'));
  RETURN v_receipt_id;
END;
$$;

-- Anonymous Auth users cannot query canonical buyer/order data directly.
CREATE POLICY guest_no_direct_sales_orders_select ON public.sales_orders AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY guest_no_direct_sales_order_lines_select ON public.sales_order_lines AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY guest_no_direct_sales_order_units_select ON public.sales_order_line_units AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY guest_no_direct_sales_order_components_select ON public.sales_order_line_components AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY guest_no_direct_sales_order_component_units_select ON public.sales_order_line_component_units AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY guest_no_direct_sales_order_answers_select ON public.sales_order_preparation_answers AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY guest_no_direct_sales_order_receipts_select ON public.sales_order_payment_receipts AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY guest_no_direct_sales_order_events_select ON public.sales_order_events AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY guest_no_direct_sales_order_adjustments_select ON public.sales_order_adjustments AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY guest_no_direct_supplier_fulfilments_select ON public.sales_order_supplier_fulfilments AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY guest_no_direct_canonical_deliveries_select ON public.canonical_sales_order_deliveries AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY guest_no_direct_canonical_delivery_proofs_select ON public.canonical_delivery_proofs AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY guest_no_direct_supplier_batch_orders_select ON public.canonical_supplier_delivery_batch_orders AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));
CREATE POLICY guest_no_direct_supplier_batches_select ON public.canonical_supplier_delivery_batches AS RESTRICTIVE
FOR SELECT TO authenticated USING (NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false));

CREATE POLICY guest_receipt_storage_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'sales-order-payment-receipts'
  AND name ~ '^guest/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp|pdf)$'
  AND public.has_guest_sales_order_session_path(split_part(name, '/', 2))
);
CREATE POLICY guest_receipt_storage_private_select ON storage.objects AS RESTRICTIVE
FOR SELECT TO authenticated USING (
  bucket_id <> 'sales-order-payment-receipts'
  OR NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false)
);
CREATE POLICY guest_delivery_proof_storage_select ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'delivery-proof'
  AND public.can_guest_read_delivery_proof(name)
);

REVOKE ALL ON FUNCTION public.validate_guest_sales_order_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_guest_sales_order(jsonb,jsonb,jsonb,jsonb,text,text,numeric,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.authorize_guest_sales_order(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_guest_sales_order_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_guest_sales_order_session_path(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_guest_read_delivery_proof(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_guest_sales_order(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_guest_sales_order_payment_receipt(uuid,text,text,text,integer,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_guest_sales_order(jsonb,jsonb,jsonb,jsonb,text,text,numeric,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_guest_sales_order(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_guest_sales_order_payment_receipt(uuid,text,text,text,integer,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_guest_sales_order_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_guest_sales_order_session_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_guest_read_delivery_proof(text) TO authenticated;

COMMENT ON TABLE public.guest_sales_order_access IS
  'Guest access capability. Stores only SHA-256 token hashes; claim columns are reserved for future guest-to-account conversion.';
COMMENT ON FUNCTION public.get_guest_sales_order(text,text) IS
  'Customer-safe guest projection. Wrong token and unknown order return the same non-enumerating response.';

COMMIT;
