-- Supabase Anonymous Sign-In authorization boundary hardening.
-- Anonymous users carry the Postgres role `authenticated`; permanent-account
-- authorization must therefore be explicit. This migration does not enable
-- Anonymous Sign-Ins and is intentionally safe to stage before that setting.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_permanent_authenticated_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND COALESCE(auth.jwt() ->> 'is_anonymous', 'false') <> 'true';
$$;

REVOKE ALL ON FUNCTION public.is_permanent_authenticated_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_permanent_authenticated_user() TO authenticated;

COMMENT ON FUNCTION public.is_permanent_authenticated_user() IS
  'True only for a signed-in non-anonymous Supabase user. Use at registered-customer authorization boundaries.';

-- Anonymous identities must be creatable without pretending that they have
-- accepted the registered-account privacy notice.
CREATE OR REPLACE FUNCTION public.capture_signup_privacy_consents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_version text := COALESCE(NULLIF(NEW.raw_user_meta_data->>'privacy_policy_version', ''), '2026-08-25');
BEGIN
  IF COALESCE(NEW.is_anonymous, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.raw_app_meta_data->>'provider' = 'google' THEN
    INSERT INTO public.customer_privacy_consents
      (customer_id, consent_type, granted, policy_version, source)
    VALUES
      (NEW.id, 'privacy_notice', false, v_version, 'signup'),
      (NEW.id, 'marketing', false, v_version, 'signup');
    RETURN NEW;
  END IF;

  IF COALESCE((NEW.raw_user_meta_data->>'privacy_notice_accepted')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Privacy Notice acceptance is required to create a customer account.';
  END IF;

  INSERT INTO public.customer_privacy_consents
    (customer_id, consent_type, granted, policy_version, source)
  VALUES
    (NEW.id, 'privacy_notice', true, v_version, 'signup'),
    (NEW.id, 'marketing', COALESCE((NEW.raw_user_meta_data->>'marketing_opt_in')::boolean, false), v_version, 'signup');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_customer_privacy_consents(
  p_privacy_notice_accepted boolean,
  p_marketing_opt_in boolean DEFAULT NULL,
  p_policy_version text DEFAULT '2026-08-25',
  p_source text DEFAULT 'checkout'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_id uuid := auth.uid();
BEGIN
  IF NOT public.is_permanent_authenticated_user() THEN
    RAISE EXCEPTION 'A permanent customer account is required.' USING ERRCODE = '42501';
  END IF;
  IF p_privacy_notice_accepted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Privacy Notice acceptance is required.';
  END IF;
  IF p_policy_version IS NULL OR length(trim(p_policy_version)) = 0 THEN
    RAISE EXCEPTION 'A privacy policy version is required.';
  END IF;
  IF p_source NOT IN ('signup', 'checkout', 'profile') THEN
    RAISE EXCEPTION 'Invalid privacy consent source.';
  END IF;

  INSERT INTO public.customer_privacy_consents
    (customer_id, consent_type, granted, policy_version, source)
  VALUES
    (v_customer_id, 'privacy_notice', true, trim(p_policy_version), p_source);

  IF p_marketing_opt_in IS NOT NULL THEN
    INSERT INTO public.customer_privacy_consents
      (customer_id, consent_type, granted, policy_version, source)
    VALUES
      (v_customer_id, 'marketing', p_marketing_opt_in, trim(p_policy_version), p_source);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_current_customer_privacy_consent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_permanent_authenticated_user() AND EXISTS (
    SELECT 1
    FROM public.customer_privacy_consents AS consent
    WHERE consent.customer_id = auth.uid()
      AND consent.consent_type = 'privacy_notice'
      AND consent.granted = true
      AND consent.policy_version = '2026-08-25'
  );
$$;

-- Registered checkout requires consent. Guest checkout is admitted only when
-- the tightly scoped guest wrapper marks this transaction as verified.
CREATE OR REPLACE FUNCTION public.enforce_customer_privacy_consent_before_checkout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.customer_id = auth.uid() AND NOT public.is_admin() THEN
    IF COALESCE(auth.jwt() ->> 'is_anonymous', 'false') = 'true' THEN
      IF current_setting('freshgo.guest_checkout', true) IS DISTINCT FROM 'verified' THEN
        RAISE EXCEPTION 'Guest checkout must use the verified guest checkout endpoint.' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT public.has_current_customer_privacy_consent() THEN
      RAISE EXCEPTION 'Please accept the FreshGo Privacy Notice before placing an order.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- RLS remains defense in depth even when a row happens to match an anonymous
-- auth.uid(). Staff identities are permanent users and continue through their
-- existing role-specific permissive policies.
CREATE POLICY permanent_customer_profiles_boundary ON public.customer_profiles AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.is_permanent_authenticated_user())
WITH CHECK (public.is_permanent_authenticated_user());

CREATE POLICY permanent_legacy_orders_boundary ON public."Orders" AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.is_permanent_authenticated_user())
WITH CHECK (public.is_permanent_authenticated_user());

CREATE POLICY permanent_notifications_boundary ON public.notifications AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.is_permanent_authenticated_user())
WITH CHECK (public.is_permanent_authenticated_user());

CREATE POLICY permanent_push_subscriptions_boundary ON public.push_subscriptions AS RESTRICTIVE
FOR ALL TO authenticated
USING (public.is_permanent_authenticated_user())
WITH CHECK (public.is_permanent_authenticated_user());

-- Legacy batch rows contain supplier notes and private tracking URLs. The old
-- policy intentionally served signed-in customers, not temporary identities.
CREATE POLICY permanent_delivery_batches_boundary ON public.delivery_batches AS RESTRICTIVE
FOR SELECT TO authenticated
USING (public.is_permanent_authenticated_user());

-- Old storage policies treated every authenticated user as CMS staff.
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;
DROP POLICY IF EXISTS "Branding Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Branding Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS "Branding Authenticated users can delete" ON storage.objects;

CREATE POLICY product_images_admin_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND public.is_admin());
CREATE POLICY product_images_admin_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'product-images' AND public.is_admin())
WITH CHECK (bucket_id = 'product-images' AND public.is_admin());
CREATE POLICY product_images_admin_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'product-images' AND public.is_admin());

CREATE POLICY branding_admin_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'branding' AND public.is_admin());
CREATE POLICY branding_admin_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'branding' AND public.is_admin())
WITH CHECK (bucket_id = 'branding' AND public.is_admin());
CREATE POLICY branding_admin_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'branding' AND public.is_admin());

-- An anonymous identity may upload only checkout staging owned by that uid or
-- a guest receipt for an active, token-verified guest order session.
CREATE POLICY anonymous_receipt_insert_boundary ON storage.objects AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id <> 'sales-order-payment-receipts'
  OR public.is_permanent_authenticated_user()
  OR (
    COALESCE(auth.jwt() ->> 'is_anonymous', 'false') = 'true'
    AND (
      (
        split_part(name, '/', 1) = 'staging'
        AND split_part(name, '/', 2) = auth.uid()::text
        AND split_part(name, '/', 3) ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
        AND split_part(name, '/', 4) ~ '^[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp|pdf)$'
        AND split_part(name, '/', 5) = ''
      )
      OR (
        name ~ '^guest/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp|pdf)$'
        AND public.has_guest_sales_order_session_path(split_part(name, '/', 2))
      )
    )
  )
);

CREATE POLICY anonymous_delivery_proof_read_boundary ON storage.objects AS RESTRICTIVE
FOR SELECT TO authenticated
USING (
  bucket_id <> 'delivery-proof'
  OR public.is_permanent_authenticated_user()
  OR (
    COALESCE(auth.jwt() ->> 'is_anonymous', 'false') = 'true'
    AND public.can_guest_read_delivery_proof(name)
  )
);

-- Canonical registered checkout remains callable from the guest wrapper only
-- while that wrapper's transaction-local verification marker is present.
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

CREATE OR REPLACE FUNCTION public.submit_sales_order_payment_receipt(
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
  IF NOT public.is_permanent_authenticated_user() THEN
    RAISE EXCEPTION 'A permanent customer account is required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_order FROM public.sales_orders
  WHERE id = p_sales_order_id AND customer_id = auth.uid() AND status <> 'cancelled'
    AND price_status = 'final' AND payment_status IN ('pending', 'rejected')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment receipt is not currently allowed.'; END IF;
  IF p_expected_final_total IS NULL OR round(p_expected_final_total, 2) <> round(v_order.final_total, 2) THEN
    RAISE EXCEPTION 'The final amount changed. Refresh the order and upload a receipt for the current amount.';
  END IF;
  IF p_storage_path NOT LIKE p_sales_order_id::text || '/%' THEN
    RAISE EXCEPTION 'Receipt path must belong to the order.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'sales-order-payment-receipts' AND name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'Receipt Storage object does not exist in the payment-receipts bucket.';
  END IF;
  PERFORM set_config('freshgo.canonical_operation', 'receipt_submission', true);
  INSERT INTO public.sales_order_payment_receipts
    (sales_order_id, storage_path, original_file_name, mime_type, file_size, uploaded_by)
  VALUES
    (p_sales_order_id, p_storage_path, p_original_file_name, p_mime_type, p_file_size, auth.uid())
  RETURNING id INTO v_receipt_id;
  UPDATE public.sales_orders
  SET payment_status = 'receipt_submitted', receipt_submitted_at = now()
  WHERE id = p_sales_order_id;
  INSERT INTO public.sales_order_events (sales_order_id, event_type, actor_id, payload)
  VALUES (p_sales_order_id, 'payment_receipt_submitted', auth.uid(), jsonb_build_object('receipt_id', v_receipt_id));
  RETURN v_receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_order_preparation_snapshot(
  p_legacy_order_id bigint,
  p_questionnaire_snapshot jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_permanent_authenticated_user() THEN
    RAISE EXCEPTION 'A permanent customer account is required.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_questionnaire_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Snapshot must be an object.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."Orders" o
    WHERE o.id = p_legacy_order_id AND o.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;
  INSERT INTO public.order_preparation_snapshots
    (legacy_order_id, customer_id, questionnaire_snapshot, created_by)
  VALUES (p_legacy_order_id, auth.uid(), p_questionnaire_snapshot, auth.uid())
  ON CONFLICT (legacy_order_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.order_preparation_snapshots
    WHERE legacy_order_id = p_legacy_order_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_order_payment_display(p_sales_order_id uuid)
RETURNS TABLE (qr_storage_path text, instructions text, configuration_source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_snapshot_path text;
  v_snapshot_instructions text;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sales_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF NOT (
    public.is_admin()
    OR (public.is_permanent_authenticated_user() AND v_order.customer_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Order access denied.' USING ERRCODE = '42501';
  END IF;
  v_snapshot_path := NULLIF(btrim(v_order.payment_configuration_snapshot ->> 'qr_storage_path'), '');
  v_snapshot_instructions := NULLIF(btrim(v_order.payment_configuration_snapshot ->> 'instructions'), '');
  IF v_snapshot_path IS NOT NULL THEN
    RETURN QUERY SELECT v_snapshot_path, v_snapshot_instructions, 'order_snapshot'::text;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT v.qr_storage_path, v.instructions, 'current_published_fallback'::text
  FROM public.payment_configuration_versions v
  WHERE v.configuration_code = 'freshgo_manual_qr'
    AND v.status = 'published'
    AND v.effective_from <= now()
    AND (v.effective_to IS NULL OR v.effective_to > now())
    AND v.qr_storage_path IS NOT NULL
  ORDER BY v.effective_from DESC, v.version_number DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_order_supplier_fulfilment_tracking(p_sales_order_id uuid)
RETURNS TABLE (
  packing_started_at timestamptz,
  packing_completed_at timestamptz,
  supplier_count integer,
  packing_supplier_count integer,
  packed_supplier_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sales_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF NOT (
    public.is_admin()
    OR (public.is_permanent_authenticated_user() AND v_order.customer_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Order access denied.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    MIN(f.packing_started_at) FILTER (WHERE f.packing_started_at IS NOT NULL),
    CASE WHEN COUNT(*) > 0 AND COUNT(*) FILTER (WHERE f.status = 'packed') = COUNT(*)
      THEN MAX(f.packing_completed_at) ELSE NULL END,
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE f.status = 'packing')::integer,
    COUNT(*) FILTER (WHERE f.status = 'packed')::integer
  FROM public.sales_order_supplier_fulfilments f
  WHERE f.sales_order_id = p_sales_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_order_canonical_delivery_tracking(p_sales_order_id uuid)
RETURNS TABLE (
  supplier_dispatch_started_at timestamptz,
  supplier_dispatch_completed_at timestamptz,
  tracking_url text,
  batch_count integer,
  dispatched_batch_count integer,
  arrived_batch_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sales_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF NOT (
    public.is_admin()
    OR (public.is_permanent_authenticated_user() AND v_order.customer_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Order access denied.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    MIN(b.dispatched_at) FILTER (WHERE b.status IN ('dispatched', 'arrived_hub')),
    CASE WHEN COUNT(*) > 0 AND COUNT(*) FILTER (WHERE b.status = 'arrived_hub') = COUNT(*)
      THEN MAX(b.arrived_hub_at) ELSE NULL END,
    (
      SELECT b2.tracking_url
      FROM public.canonical_supplier_delivery_batch_orders bo2
      JOIN public.canonical_supplier_delivery_batches b2 ON b2.id = bo2.batch_id
      WHERE bo2.sales_order_id = p_sales_order_id
        AND b2.status = 'dispatched' AND b2.tracking_url IS NOT NULL
      ORDER BY b2.dispatched_at DESC LIMIT 1
    ),
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE b.status IN ('dispatched', 'arrived_hub'))::integer,
    COUNT(*) FILTER (WHERE b.status = 'arrived_hub')::integer
  FROM public.canonical_supplier_delivery_batch_orders bo
  JOIN public.canonical_supplier_delivery_batches b ON b.id = bo.batch_id
  WHERE bo.sales_order_id = p_sales_order_id AND b.status <> 'cancelled';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_order_canonical_rider_tracking(p_sales_order_id uuid)
RETURNS TABLE (
  ready_for_rider_at timestamptz,
  delivery_started_at timestamptz,
  delivered_at timestamptz,
  delivery_status text,
  rider_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_orders o
    WHERE o.id = p_sales_order_id
      AND (
        public.is_admin()
        OR (public.is_permanent_authenticated_user() AND o.customer_id = auth.uid())
      )
  ) THEN
    RAISE EXCEPTION 'Order access denied.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT d.ready_for_rider_at, d.delivery_started_at, d.delivered_at, d.status,
    COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''),
      NULLIF(u.raw_user_meta_data ->> 'name', ''), u.email)
  FROM public.canonical_sales_order_deliveries d
  LEFT JOIN auth.users u ON u.id = d.assigned_rider_id
  WHERE d.sales_order_id = p_sales_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_order_canonical_delivery_proofs(p_sales_order_id uuid)
RETURNS TABLE (proof_type text, storage_path text, uploaded_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery public.canonical_sales_order_deliveries%ROWTYPE;
  v_customer_id uuid;
BEGIN
  SELECT d.* INTO v_delivery
  FROM public.canonical_sales_order_deliveries d
  WHERE d.sales_order_id = p_sales_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Canonical delivery not found.'; END IF;
  SELECT o.customer_id INTO v_customer_id
  FROM public.sales_orders o WHERE o.id = p_sales_order_id;
  IF public.is_admin() THEN
    NULL;
  ELSIF public.is_delivery_rider() AND v_delivery.assigned_rider_id = auth.uid() THEN
    NULL;
  ELSIF public.is_permanent_authenticated_user()
        AND v_customer_id = auth.uid()
        AND v_delivery.status = 'delivered'
        AND v_delivery.delivered_at IS NOT NULL THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Delivery proof access denied.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.proof_type, p.storage_path, p.uploaded_at
  FROM public.canonical_delivery_proofs p
  WHERE p.delivery_id = v_delivery.id
  ORDER BY CASE p.proof_type WHEN 'closeup' THEN 1 WHEN 'placement' THEN 2 ELSE 99 END;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_canonical_delivery_proof_object(p_storage_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sales_order_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_storage_path IS NULL
     OR p_storage_path !~ '^[0-9a-fA-F-]{36}/(closeup|placement)/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp)$' THEN
    RETURN false;
  END IF;
  BEGIN
    v_sales_order_id := split_part(p_storage_path, '/', 1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  IF public.is_admin() THEN RETURN true; END IF;
  IF public.is_delivery_rider() AND EXISTS (
    SELECT 1 FROM public.canonical_sales_order_deliveries d
    WHERE d.sales_order_id = v_sales_order_id AND d.assigned_rider_id = auth.uid()
  ) THEN RETURN true; END IF;
  IF public.is_permanent_authenticated_user() AND EXISTS (
    SELECT 1
    FROM public.canonical_sales_order_deliveries d
    JOIN public.sales_orders o ON o.id = d.sales_order_id
    WHERE d.sales_order_id = v_sales_order_id
      AND o.customer_id = auth.uid()
      AND d.status = 'delivered' AND d.delivered_at IS NOT NULL
  ) THEN RETURN true; END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.tracking_rider_name(p_delivery_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rider_name text;
BEGIN
  IF NOT (
    (
      public.is_permanent_authenticated_user()
      AND EXISTS (
        SELECT 1
        FROM public."Orders" o
        JOIN public.delivery_batches db ON db.id = o.delivery_batch_id
        WHERE o.user_id = auth.uid() AND db.delivery_date = p_delivery_date
      )
    )
    OR public.is_admin()
    OR public.is_delivery_rider()
  ) THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(NULLIF(au.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(au.raw_user_meta_data ->> 'name', ''), au.email)
  INTO rider_name
  FROM public.delivery_assignments da
  JOIN auth.users au ON au.id = da.rider_id
  WHERE da.delivery_date = p_delivery_date
  ORDER BY da.id LIMIT 1;
  RETURN rider_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_own_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_user uuid;
  subscription_id uuid;
BEGIN
  IF NOT public.is_permanent_authenticated_user() THEN
    RAISE EXCEPTION 'A permanent customer account is required.' USING ERRCODE = '42501';
  END IF;
  SELECT user_id INTO existing_user
  FROM public.push_subscriptions WHERE endpoint = p_endpoint FOR UPDATE;
  IF existing_user IS NOT NULL AND existing_user <> auth.uid() THEN
    RAISE EXCEPTION 'Push endpoint belongs to another account' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth)
  ON CONFLICT (endpoint) DO UPDATE SET
    p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, last_seen_at = now(),
    disabled_at = NULL, failure_count = 0, last_failure_at = NULL, last_failure_reason = NULL
  RETURNING id INTO subscription_id;
  RETURN subscription_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_own_push_subscription(p_endpoint text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_permanent_authenticated_user() THEN
    RAISE EXCEPTION 'A permanent customer account is required.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.push_subscriptions
  SET disabled_at = now()
  WHERE user_id = auth.uid() AND endpoint = p_endpoint;
END;
$$;

COMMIT;
