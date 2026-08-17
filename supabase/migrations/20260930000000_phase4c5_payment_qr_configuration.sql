-- Phase 4C.5
-- Canonical DuitNow QR configuration.
--
-- Goals:
-- 1. Admin uploads QR assets into a dedicated public-read bucket.
-- 2. Only admins may upload/update/delete QR assets.
-- 3. Replacing QR creates a new payment configuration version.
-- 4. Previous published configuration is retired, never overwritten.
-- 5. Historical orders keep their snapshotted QR.
-- 6. Orders created before payment configuration existed may fall back to the
--    currently published QR so PRE-LIVE historical test orders remain payable.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. QR storage
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (
  id,
  name,
  public,
  avif_autodetection,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'payment-qr',
  'payment-qr',
  true,
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS phase4c5_payment_qr_public_select
ON storage.objects;

DROP POLICY IF EXISTS phase4c5_payment_qr_admin_insert
ON storage.objects;

DROP POLICY IF EXISTS phase4c5_payment_qr_admin_update
ON storage.objects;

DROP POLICY IF EXISTS phase4c5_payment_qr_admin_delete
ON storage.objects;

CREATE POLICY phase4c5_payment_qr_public_select
ON storage.objects
FOR SELECT TO public
USING (
  bucket_id = 'payment-qr'
);

CREATE POLICY phase4c5_payment_qr_admin_insert
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-qr'
  AND public.is_admin()
  AND name ~ '^freshgo_manual_qr/v[0-9]+/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp)$'
);

CREATE POLICY phase4c5_payment_qr_admin_update
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'payment-qr'
  AND public.is_admin()
)
WITH CHECK (
  bucket_id = 'payment-qr'
  AND public.is_admin()
);

CREATE POLICY phase4c5_payment_qr_admin_delete
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-qr'
  AND public.is_admin()
);

-- ---------------------------------------------------------------------------
-- 2. Current configuration read helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_current_payment_configuration()
RETURNS TABLE (
  id uuid,
  configuration_code text,
  version_number integer,
  status text,
  qr_storage_path text,
  instructions text,
  currency_code text,
  effective_from timestamptz,
  published_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    v.configuration_code,
    v.version_number,
    v.status,
    v.qr_storage_path,
    v.instructions,
    v.currency_code,
    v.effective_from,
    v.published_at
  FROM public.payment_configuration_versions v
  WHERE v.configuration_code = 'freshgo_manual_qr'
    AND v.status = 'published'
    AND v.effective_from <= now()
    AND (v.effective_to IS NULL OR v.effective_to > now())
  ORDER BY v.effective_from DESC, v.version_number DESC
  LIMIT 1;
END;
$$;

REVOKE EXECUTE
ON FUNCTION public.get_current_payment_configuration()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.get_current_payment_configuration()
TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Atomic replacement / publishing.
--
-- The storage object must already exist before this RPC is called.
-- Previous published QR remains in storage for historical order snapshots.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_payment_qr_configuration(
  p_qr_storage_path text,
  p_instructions text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  version_number integer,
  qr_storage_path text,
  instructions text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_next_version integer;
  v_new_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF NULLIF(btrim(p_qr_storage_path), '') IS NULL THEN
    RAISE EXCEPTION 'QR storage path is required.';
  END IF;

  IF p_qr_storage_path !~
     '^freshgo_manual_qr/v[0-9]+/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp)$'
  THEN
    RAISE EXCEPTION 'Invalid payment QR storage path.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'payment-qr'
      AND name = p_qr_storage_path
  ) THEN
    RAISE EXCEPTION 'Payment QR storage object does not exist.';
  END IF;

  SELECT COALESCE(MAX(v.version_number), 0) + 1
    INTO v_next_version
  FROM public.payment_configuration_versions v
  WHERE v.configuration_code = 'freshgo_manual_qr';

  -- Retire current published version first.
  PERFORM set_config('freshgo.configuration_retire', 'on', true);

  UPDATE public.payment_configuration_versions
     SET status = 'retired',
         effective_to = v_now
   WHERE configuration_code = 'freshgo_manual_qr'
     AND status = 'published'
     AND effective_from < v_now
     AND (effective_to IS NULL OR effective_to > v_now);

  INSERT INTO public.payment_configuration_versions (
    configuration_code,
    version_number,
    status,
    effective_from,
    effective_to,
    qr_storage_path,
    instructions,
    currency_code,
    created_by,
    published_at,
    published_by
  )
  VALUES (
    'freshgo_manual_qr',
    v_next_version,
    'published',
    v_now,
    NULL,
    p_qr_storage_path,
    NULLIF(btrim(COALESCE(p_instructions, '')), ''),
    'MYR',
    auth.uid(),
    v_now,
    auth.uid()
  )
  RETURNING payment_configuration_versions.id
       INTO v_new_id;

  RETURN QUERY
  SELECT
    v.id,
    v.version_number,
    v.qr_storage_path,
    v.instructions
  FROM public.payment_configuration_versions v
  WHERE v.id = v_new_id;
END;
$$;

REVOKE EXECUTE
ON FUNCTION public.replace_payment_qr_configuration(text, text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.replace_payment_qr_configuration(text, text)
TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Customer payment display resolver.
--
-- Historical rule:
-- - If order contains its own QR snapshot -> always use it.
-- - Otherwise fall back to the currently published QR.
--
-- Only the order owner or admin may call this.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_sales_order_payment_display(
  p_sales_order_id uuid
)
RETURNS TABLE (
  qr_storage_path text,
  instructions text,
  configuration_source text
)
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
  SELECT *
    INTO v_order
  FROM public.sales_orders
  WHERE id = p_sales_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF NOT (
    v_order.customer_id = auth.uid()
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'Order access denied.';
  END IF;

  v_snapshot_path :=
    NULLIF(btrim(v_order.payment_configuration_snapshot ->> 'qr_storage_path'), '');

  v_snapshot_instructions :=
    NULLIF(btrim(v_order.payment_configuration_snapshot ->> 'instructions'), '');

  IF v_snapshot_path IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_snapshot_path,
      v_snapshot_instructions,
      'order_snapshot'::text;

    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v.qr_storage_path,
    v.instructions,
    'current_published_fallback'::text
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

REVOKE EXECUTE
ON FUNCTION public.get_sales_order_payment_display(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.get_sales_order_payment_display(uuid)
TO authenticated;

COMMIT;
