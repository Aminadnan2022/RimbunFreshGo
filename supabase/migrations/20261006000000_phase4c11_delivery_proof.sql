-- Phase 4C11 — Canonical Proof of Delivery
--
-- Requires two mandatory delivery photographs:
--   1. closeup    — close view of parcel / FreshGo bag label
--   2. placement  — wider view showing where parcel was left
--
-- Flow:
--   ready_for_rider
--     -> out_for_delivery
--     -> rider uploads + registers both proofs
--     -> delivered
--
-- Customer may see POD only after delivery is completed.

BEGIN;

-- ===========================================================================
-- 1. PRIVATE STORAGE BUCKET
-- ===========================================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  avif_autodetection,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'delivery-proof',
  'delivery-proof',
  false,
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ===========================================================================
-- 2. PROOF METADATA
-- ===========================================================================

CREATE TABLE public.canonical_delivery_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  delivery_id uuid NOT NULL
    REFERENCES public.canonical_sales_order_deliveries(id)
    ON DELETE RESTRICT,

  sales_order_id uuid NOT NULL
    REFERENCES public.sales_orders(id)
    ON DELETE RESTRICT,

  proof_type text NOT NULL
    CHECK (proof_type IN ('closeup', 'placement')),

  storage_path text NOT NULL,

  uploaded_by uuid NOT NULL
    REFERENCES auth.users(id)
    ON DELETE RESTRICT,

  uploaded_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT canonical_delivery_proofs_delivery_type_key
    UNIQUE (delivery_id, proof_type),

  CONSTRAINT canonical_delivery_proofs_storage_path_key
    UNIQUE (storage_path)
);

CREATE INDEX canonical_delivery_proofs_sales_order_idx
ON public.canonical_delivery_proofs (sales_order_id);

ALTER TABLE public.canonical_delivery_proofs
ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- 3. TABLE READ SECURITY
-- ===========================================================================

-- Admin may inspect all POD metadata.
CREATE POLICY phase4c11_delivery_proof_admin_select
ON public.canonical_delivery_proofs
FOR SELECT TO authenticated
USING (
  public.is_admin()
);

-- Assigned rider may inspect POD for their own delivery.
CREATE POLICY phase4c11_delivery_proof_rider_select
ON public.canonical_delivery_proofs
FOR SELECT TO authenticated
USING (
  public.is_delivery_rider()
  AND EXISTS (
    SELECT 1
    FROM public.canonical_sales_order_deliveries d
    WHERE d.id = delivery_id
      AND d.assigned_rider_id = auth.uid()
  )
);

-- Customer may inspect proof only after the order is delivered.
CREATE POLICY phase4c11_delivery_proof_customer_select
ON public.canonical_delivery_proofs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.canonical_sales_order_deliveries d
    JOIN public.sales_orders o
      ON o.id = d.sales_order_id
    WHERE d.id = delivery_id
      AND o.customer_id = auth.uid()
      AND d.status = 'delivered'
      AND d.delivered_at IS NOT NULL
  )
);

GRANT SELECT
ON public.canonical_delivery_proofs
TO authenticated;


-- ===========================================================================
-- 4. STORAGE SECURITY
--
-- Object path:
--
--   <sales_order_uuid>/<proof_type>/<file_uuid>.<ext>
--
-- Example:
--
--   89b95.../closeup/68d7....jpg
--   89b95.../placement/77c1....jpg
-- ===========================================================================

DROP POLICY IF EXISTS phase4c11_delivery_proof_insert
ON storage.objects;

DROP POLICY IF EXISTS phase4c11_delivery_proof_select
ON storage.objects;


-- Rider may upload only while:
--   * assigned to that exact canonical order
--   * order is out_for_delivery
--   * path has valid proof type and file format
CREATE POLICY phase4c11_delivery_proof_insert
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'delivery-proof'

  AND name ~
    '^[0-9a-fA-F-]{36}/(closeup|placement)/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp)$'

  AND public.is_delivery_rider()

  AND EXISTS (
    SELECT 1
    FROM public.canonical_sales_order_deliveries d
    WHERE d.sales_order_id::text = split_part(name, '/', 1)
      AND d.assigned_rider_id = auth.uid()
      AND d.status = 'out_for_delivery'
      AND d.delivery_started_at IS NOT NULL
      AND d.delivered_at IS NULL
  )
);


-- Private object read:
--
-- Admin:
--   always
--
-- Assigned rider:
--   own delivery
--
-- Customer:
--   own order, but only after delivery is completed
CREATE POLICY phase4c11_delivery_proof_select
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'delivery-proof'

  AND name ~
    '^[0-9a-fA-F-]{36}/(closeup|placement)/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp)$'

  AND (
    public.is_admin()

    OR EXISTS (
      SELECT 1
      FROM public.canonical_sales_order_deliveries d
      WHERE d.sales_order_id::text = split_part(name, '/', 1)
        AND public.is_delivery_rider()
        AND d.assigned_rider_id = auth.uid()
    )

    OR EXISTS (
      SELECT 1
      FROM public.canonical_sales_order_deliveries d
      JOIN public.sales_orders o
        ON o.id = d.sales_order_id
      WHERE d.sales_order_id::text = split_part(name, '/', 1)
        AND o.customer_id = auth.uid()
        AND d.status = 'delivered'
        AND d.delivered_at IS NOT NULL
    )
  )
);


-- ===========================================================================
-- 5. RIDER REGISTERS AN UPLOADED POD OBJECT
--
-- Storage upload occurs first.
-- This RPC validates that object and makes it the current proof for that type.
--
-- Retaking a photo is allowed before Delivered.
-- The newest registered path replaces the previous metadata pointer.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.rider_register_canonical_delivery_proof(
  p_sales_order_id uuid,
  p_proof_type text,
  p_storage_path text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery public.canonical_sales_order_deliveries%ROWTYPE;
  v_proof_id uuid;
  v_expected_prefix text;
BEGIN
  IF NOT public.is_delivery_rider() THEN
    RAISE EXCEPTION 'Delivery rider access required.';
  END IF;

  IF p_proof_type NOT IN ('closeup', 'placement') THEN
    RAISE EXCEPTION 'Invalid proof type.';
  END IF;

  IF NULLIF(btrim(p_storage_path), '') IS NULL THEN
    RAISE EXCEPTION 'Proof storage path is required.';
  END IF;

  SELECT *
    INTO v_delivery
  FROM public.canonical_sales_order_deliveries
  WHERE sales_order_id = p_sales_order_id
    AND assigned_rider_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical delivery is not assigned to this rider.';
  END IF;

  IF v_delivery.status <> 'out_for_delivery'
     OR v_delivery.delivery_started_at IS NULL
     OR v_delivery.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION
      'Delivery proof may only be uploaded while the order is out for delivery.';
  END IF;

  v_expected_prefix :=
    p_sales_order_id::text || '/' || p_proof_type || '/';

  IF p_storage_path NOT LIKE v_expected_prefix || '%' THEN
    RAISE EXCEPTION 'Proof storage path does not match the sales order and proof type.';
  END IF;

  IF p_storage_path !~
    '^[0-9a-fA-F-]{36}/(closeup|placement)/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp)$'
  THEN
    RAISE EXCEPTION 'Invalid proof storage path.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects so
    WHERE so.bucket_id = 'delivery-proof'
      AND so.name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'Delivery proof storage object does not exist.';
  END IF;

  INSERT INTO public.canonical_delivery_proofs (
    delivery_id,
    sales_order_id,
    proof_type,
    storage_path,
    uploaded_by,
    uploaded_at
  )
  VALUES (
    v_delivery.id,
    p_sales_order_id,
    p_proof_type,
    p_storage_path,
    auth.uid(),
    clock_timestamp()
  )
  ON CONFLICT (delivery_id, proof_type)
  DO UPDATE SET
    storage_path = EXCLUDED.storage_path,
    uploaded_by = EXCLUDED.uploaded_by,
    uploaded_at = EXCLUDED.uploaded_at,
    updated_at = clock_timestamp()
  RETURNING id
  INTO v_proof_id;

  INSERT INTO public.sales_order_events (
    sales_order_id,
    event_type,
    actor_id,
    payload
  )
  VALUES (
    p_sales_order_id,
    'delivery_proof_uploaded',
    auth.uid(),
    jsonb_build_object(
      'canonical_delivery_id', v_delivery.id,
      'proof_id', v_proof_id,
      'proof_type', p_proof_type,
      'storage_path', p_storage_path
    )
  );

  RETURN v_proof_id;
END;
$$;


-- ===========================================================================
-- 6. POD READ MODEL
--
-- Used by:
--   * rider dashboard before completion
--   * customer after Delivered
--   * admin
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_sales_order_canonical_delivery_proofs(
  p_sales_order_id uuid
)
RETURNS TABLE (
  proof_type text,
  storage_path text,
  uploaded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery public.canonical_sales_order_deliveries%ROWTYPE;
  v_customer_id uuid;
BEGIN
  SELECT d.*
  INTO v_delivery
  FROM public.canonical_sales_order_deliveries d
  WHERE d.sales_order_id = p_sales_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical delivery not found.';
  END IF;

  SELECT o.customer_id
  INTO v_customer_id
  FROM public.sales_orders o
  WHERE o.id = p_sales_order_id;

  IF public.is_admin() THEN
    NULL;

  ELSIF public.is_delivery_rider()
        AND v_delivery.assigned_rider_id = auth.uid() THEN
    NULL;

  ELSIF v_customer_id = auth.uid()
        AND v_delivery.status = 'delivered'
        AND v_delivery.delivered_at IS NOT NULL THEN
    NULL;

  ELSE
    RAISE EXCEPTION 'Delivery proof access denied.';
  END IF;

  RETURN QUERY
  SELECT
    p.proof_type,
    p.storage_path,
    p.uploaded_at
  FROM public.canonical_delivery_proofs p
  WHERE p.delivery_id = v_delivery.id
  ORDER BY
    CASE p.proof_type
      WHEN 'closeup' THEN 1
      WHEN 'placement' THEN 2
      ELSE 99
    END;
END;
$$;


-- ===========================================================================
-- 7. HARDEN MARK DELIVERED
--
-- Existing function from Phase 4C9 is replaced additively.
-- Rider cannot complete delivery until both proof types exist AND their
-- storage objects still exist.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.rider_complete_canonical_sales_order_delivery(
  p_sales_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.canonical_sales_order_deliveries%ROWTYPE;
BEGIN
  IF NOT public.is_delivery_rider() THEN
    RAISE EXCEPTION 'Delivery rider access required.';
  END IF;

  SELECT *
    INTO v_row
  FROM public.canonical_sales_order_deliveries
  WHERE sales_order_id = p_sales_order_id
    AND assigned_rider_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical delivery is not assigned to this rider.';
  END IF;

  IF v_row.status = 'delivered' THEN
    RETURN;
  END IF;

  IF v_row.status <> 'out_for_delivery'
     OR v_row.delivery_started_at IS NULL THEN
    RAISE EXCEPTION 'Delivery must be started before it can be completed.';
  END IF;

  -- Mandatory close-up proof.
  IF NOT EXISTS (
    SELECT 1
    FROM public.canonical_delivery_proofs p
    JOIN storage.objects so
      ON so.bucket_id = 'delivery-proof'
     AND so.name = p.storage_path
    WHERE p.delivery_id = v_row.id
      AND p.proof_type = 'closeup'
  ) THEN
    RAISE EXCEPTION
      'Close-up delivery proof photo is required before marking delivered.';
  END IF;

  -- Mandatory placement proof.
  IF NOT EXISTS (
    SELECT 1
    FROM public.canonical_delivery_proofs p
    JOIN storage.objects so
      ON so.bucket_id = 'delivery-proof'
     AND so.name = p.storage_path
    WHERE p.delivery_id = v_row.id
      AND p.proof_type = 'placement'
  ) THEN
    RAISE EXCEPTION
      'Placement delivery proof photo is required before marking delivered.';
  END IF;

  UPDATE public.canonical_sales_order_deliveries
     SET status = 'delivered',
         delivered_at = clock_timestamp(),
         delivered_by = auth.uid(),
         updated_at = clock_timestamp()
   WHERE id = v_row.id;

  INSERT INTO public.sales_order_events (
    sales_order_id,
    event_type,
    actor_id,
    payload
  )
  VALUES (
    p_sales_order_id,
    'delivered',
    auth.uid(),
    jsonb_build_object(
      'canonical_delivery_id', v_row.id,
      'rider_id', auth.uid(),
      'proof_required', true,
      'proof_types', jsonb_build_array('closeup', 'placement')
    )
  );
END;
$$;


-- ===========================================================================
-- 8. FUNCTION PRIVILEGES
-- ===========================================================================

REVOKE ALL
ON FUNCTION public.rider_register_canonical_delivery_proof(uuid, text, text)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.get_sales_order_canonical_delivery_proofs(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.rider_complete_canonical_sales_order_delivery(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.rider_register_canonical_delivery_proof(uuid, text, text)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.get_sales_order_canonical_delivery_proofs(uuid)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.rider_complete_canonical_sales_order_delivery(uuid)
TO authenticated;


COMMENT ON TABLE public.canonical_delivery_proofs IS
  'Canonical proof-of-delivery images. Requires closeup and placement photographs before a rider may complete delivery.';

COMMIT;
