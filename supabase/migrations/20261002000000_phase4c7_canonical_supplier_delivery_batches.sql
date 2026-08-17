-- Phase 4C.7
-- Canonical supplier -> FreshGo Hub transport batches.
--
-- This is deliberately separate from legacy delivery_batches /
-- delivery_batch_manifest, which are tied to public."Orders"(bigint).
--
-- Flow:
-- supplier fulfilment packed
--   -> admin creates supplier transport batch
--   -> admin adds packed supplier-scoped canonical orders
--   -> admin marks batch dispatched
--   -> admin confirms arrived at FreshGo Hub
--
-- One supplier transport batch may contain many canonical customer orders.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Batch header
-- ---------------------------------------------------------------------------

CREATE TABLE public.canonical_supplier_delivery_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  batch_code text NOT NULL UNIQUE
    CHECK (btrim(batch_code) <> ''),

  supplier_id bigint NOT NULL
    REFERENCES public.suppliers(id)
    ON DELETE RESTRICT,

  delivery_date date NOT NULL,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'dispatched', 'arrived_hub', 'cancelled')),

  hub_code text NOT NULL DEFAULT 'freshgo_rimbun_hub'
    CHECK (btrim(hub_code) <> ''),

  hub_name text NOT NULL DEFAULT 'FreshGo Hub (Residensi Rimbun)'
    CHECK (btrim(hub_name) <> ''),

  transport_provider text,
  tracking_url text,
  booking_reference text,
  notes text,

  dispatched_at timestamptz,
  dispatched_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  arrived_hub_at timestamptz,
  arrived_hub_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT canonical_supplier_delivery_batches_tracking_url_check
    CHECK (
      tracking_url IS NULL
      OR tracking_url LIKE 'https://%'
    ),

  CONSTRAINT canonical_supplier_delivery_batches_dispatch_check
    CHECK (
      (status = 'draft'
        AND dispatched_at IS NULL
        AND arrived_hub_at IS NULL)
      OR
      (status = 'dispatched'
        AND dispatched_at IS NOT NULL
        AND arrived_hub_at IS NULL)
      OR
      (status = 'arrived_hub'
        AND dispatched_at IS NOT NULL
        AND arrived_hub_at IS NOT NULL)
      OR
      status = 'cancelled'
    )
);

CREATE INDEX canonical_supplier_delivery_batches_supplier_date_idx
  ON public.canonical_supplier_delivery_batches (
    supplier_id,
    delivery_date DESC,
    created_at DESC
  );

CREATE INDEX canonical_supplier_delivery_batches_status_idx
  ON public.canonical_supplier_delivery_batches (
    status,
    delivery_date DESC
  );

-- ---------------------------------------------------------------------------
-- 2. Batch membership
-- ---------------------------------------------------------------------------

CREATE TABLE public.canonical_supplier_delivery_batch_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  batch_id uuid NOT NULL
    REFERENCES public.canonical_supplier_delivery_batches(id)
    ON DELETE RESTRICT,

  sales_order_id uuid NOT NULL
    REFERENCES public.sales_orders(id)
    ON DELETE RESTRICT,

  supplier_id bigint NOT NULL
    REFERENCES public.suppliers(id)
    ON DELETE RESTRICT,

  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  UNIQUE (batch_id, sales_order_id, supplier_id)
);

CREATE INDEX canonical_supplier_delivery_batch_orders_order_idx
  ON public.canonical_supplier_delivery_batch_orders (
    sales_order_id,
    supplier_id
  );

CREATE INDEX canonical_supplier_delivery_batch_orders_batch_idx
  ON public.canonical_supplier_delivery_batch_orders (
    batch_id
  );

-- One supplier/order pair must not be inside two active transport batches.
CREATE UNIQUE INDEX canonical_supplier_delivery_batch_orders_one_active_idx
  ON public.canonical_supplier_delivery_batch_orders (
    sales_order_id,
    supplier_id
  );

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.canonical_supplier_delivery_batches
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.canonical_supplier_delivery_batch_orders
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY phase4c7_canonical_supplier_batches_admin_select
ON public.canonical_supplier_delivery_batches
FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY phase4c7_canonical_supplier_batch_orders_admin_select
ON public.canonical_supplier_delivery_batch_orders
FOR SELECT TO authenticated
USING (public.is_admin());

-- Supplier may see only batches belonging to a supplier identity they own.
CREATE POLICY phase4c7_canonical_supplier_batches_supplier_select
ON public.canonical_supplier_delivery_batches
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.supplier_users su
    WHERE su.supplier_id = canonical_supplier_delivery_batches.supplier_id
      AND su.user_id = auth.uid()
      AND su.active
  )
);

CREATE POLICY phase4c7_canonical_supplier_batch_orders_supplier_select
ON public.canonical_supplier_delivery_batch_orders
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.supplier_users su
    WHERE su.supplier_id = canonical_supplier_delivery_batch_orders.supplier_id
      AND su.user_id = auth.uid()
      AND su.active
  )
);

GRANT SELECT ON TABLE
  public.canonical_supplier_delivery_batches,
  public.canonical_supplier_delivery_batch_orders
TO authenticated, service_role;

-- No direct authenticated DML. Mutations are RPC-only.

-- ---------------------------------------------------------------------------
-- 4. Batch-code generator
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.phase4c7_generate_supplier_batch_code(
  p_delivery_date date
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prefix text;
  v_next integer;
BEGIN
  v_prefix := 'RFG-SH-' || to_char(p_delivery_date, 'YYYYMMDD') || '-';

  SELECT COALESCE(
    MAX(
      NULLIF(
        regexp_replace(batch_code, '^.*-', ''),
        ''
      )::integer
    ),
    0
  ) + 1
  INTO v_next
  FROM public.canonical_supplier_delivery_batches
  WHERE batch_code LIKE v_prefix || '%';

  RETURN v_prefix || lpad(v_next::text, 3, '0');
END;
$$;

REVOKE EXECUTE
ON FUNCTION public.phase4c7_generate_supplier_batch_code(date)
FROM PUBLIC, authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. Create draft batch
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_create_canonical_supplier_delivery_batch(
  p_supplier_id bigint,
  p_delivery_date date,
  p_transport_provider text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_code text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Supplier is required.';
  END IF;

  IF p_delivery_date IS NULL THEN
    RAISE EXCEPTION 'Delivery date is required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers
    WHERE id = p_supplier_id
  ) THEN
    RAISE EXCEPTION 'Supplier not found.';
  END IF;

  v_code := public.phase4c7_generate_supplier_batch_code(p_delivery_date);

  INSERT INTO public.canonical_supplier_delivery_batches (
    batch_code,
    supplier_id,
    delivery_date,
    transport_provider,
    notes,
    created_by
  )
  VALUES (
    v_code,
    p_supplier_id,
    p_delivery_date,
    NULLIF(btrim(COALESCE(p_transport_provider, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Add packed order to draft batch
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_add_sales_order_to_supplier_delivery_batch(
  p_batch_id uuid,
  p_sales_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch public.canonical_supplier_delivery_batches%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT *
  INTO v_batch
  FROM public.canonical_supplier_delivery_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier delivery batch not found.';
  END IF;

  IF v_batch.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft supplier delivery batches may be changed.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_orders o
    WHERE o.id = p_sales_order_id
      AND o.payment_status = 'paid'
      AND o.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Order must be paid and active before supplier dispatch.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_order_supplier_fulfilments f
    WHERE f.sales_order_id = p_sales_order_id
      AND f.supplier_id = v_batch.supplier_id
      AND f.status = 'packed'
      AND f.packing_completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Supplier packing must be completed before adding this order to a delivery batch.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.canonical_supplier_delivery_batch_orders bo
    WHERE bo.sales_order_id = p_sales_order_id
      AND bo.supplier_id = v_batch.supplier_id
  ) THEN
    RAISE EXCEPTION 'This supplier/order is already assigned to a canonical delivery batch.';
  END IF;

  INSERT INTO public.canonical_supplier_delivery_batch_orders (
    batch_id,
    sales_order_id,
    supplier_id,
    added_by
  )
  VALUES (
    p_batch_id,
    p_sales_order_id,
    v_batch.supplier_id,
    auth.uid()
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Remove order from draft batch
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_remove_sales_order_from_supplier_delivery_batch(
  p_batch_id uuid,
  p_sales_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT status
  INTO v_status
  FROM public.canonical_supplier_delivery_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier delivery batch not found.';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft supplier delivery batches may be changed.';
  END IF;

  DELETE FROM public.canonical_supplier_delivery_batch_orders
  WHERE batch_id = p_batch_id
    AND sales_order_id = p_sales_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Dispatch batch
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_dispatch_canonical_supplier_delivery_batch(
  p_batch_id uuid,
  p_transport_provider text DEFAULT NULL,
  p_tracking_url text DEFAULT NULL,
  p_booking_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch public.canonical_supplier_delivery_batches%ROWTYPE;
  v_order record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT *
  INTO v_batch
  FROM public.canonical_supplier_delivery_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier delivery batch not found.';
  END IF;

  IF v_batch.status = 'dispatched' OR v_batch.status = 'arrived_hub' THEN
    RETURN;
  END IF;

  IF v_batch.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft supplier delivery batches may be dispatched.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.canonical_supplier_delivery_batch_orders bo
    WHERE bo.batch_id = p_batch_id
  ) THEN
    RAISE EXCEPTION 'Supplier delivery batch contains no orders.';
  END IF;

  IF NULLIF(btrim(COALESCE(p_tracking_url, '')), '') IS NOT NULL
     AND p_tracking_url NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Tracking URL must start with https://';
  END IF;

  -- Revalidate every order immediately before dispatch.
  FOR v_order IN
    SELECT bo.sales_order_id, bo.supplier_id
    FROM public.canonical_supplier_delivery_batch_orders bo
    WHERE bo.batch_id = p_batch_id
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.sales_orders o
      WHERE o.id = v_order.sales_order_id
        AND o.payment_status = 'paid'
        AND o.status <> 'cancelled'
    ) THEN
      RAISE EXCEPTION 'All orders must remain paid and active before dispatch.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.sales_order_supplier_fulfilments f
      WHERE f.sales_order_id = v_order.sales_order_id
        AND f.supplier_id = v_order.supplier_id
        AND f.status = 'packed'
        AND f.packing_completed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'All supplier fulfilments must remain packed before dispatch.';
    END IF;
  END LOOP;

  UPDATE public.canonical_supplier_delivery_batches
  SET
    status = 'dispatched',
    transport_provider = COALESCE(
      NULLIF(btrim(COALESCE(p_transport_provider, '')), ''),
      transport_provider
    ),
    tracking_url = NULLIF(btrim(COALESCE(p_tracking_url, '')), ''),
    booking_reference = NULLIF(btrim(COALESCE(p_booking_reference, '')), ''),
    dispatched_at = now(),
    dispatched_by = auth.uid(),
    updated_at = now()
  WHERE id = p_batch_id;

  INSERT INTO public.sales_order_events (
    sales_order_id,
    event_type,
    actor_id,
    payload
  )
  SELECT
    bo.sales_order_id,
    'supplier_dispatch_started',
    auth.uid(),
    jsonb_build_object(
      'canonical_supplier_delivery_batch_id', p_batch_id,
      'supplier_id', bo.supplier_id
    )
  FROM public.canonical_supplier_delivery_batch_orders bo
  WHERE bo.batch_id = p_batch_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Confirm batch arrival at FreshGo Hub
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_confirm_canonical_supplier_batch_hub_arrival(
  p_batch_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT status
  INTO v_status
  FROM public.canonical_supplier_delivery_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier delivery batch not found.';
  END IF;

  IF v_status = 'arrived_hub' THEN
    RETURN;
  END IF;

  IF v_status <> 'dispatched' THEN
    RAISE EXCEPTION 'Supplier delivery batch must be dispatched before hub arrival.';
  END IF;

  UPDATE public.canonical_supplier_delivery_batches
  SET
    status = 'arrived_hub',
    arrived_hub_at = now(),
    arrived_hub_by = auth.uid(),
    updated_at = now()
  WHERE id = p_batch_id;

  INSERT INTO public.sales_order_events (
    sales_order_id,
    event_type,
    actor_id,
    payload
  )
  SELECT
    bo.sales_order_id,
    'supplier_dispatch_arrived_hub',
    auth.uid(),
    jsonb_build_object(
      'canonical_supplier_delivery_batch_id', p_batch_id,
      'supplier_id', bo.supplier_id
    )
  FROM public.canonical_supplier_delivery_batch_orders bo
  WHERE bo.batch_id = p_batch_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Customer-safe canonical logistics resolver
--
-- Aggregate across all supplier batches belonging to the customer's order.
--
-- dispatch_started_at:
--   earliest actual supplier batch dispatch
--
-- dispatch_completed_at:
--   only returned when ALL supplier batches associated with the order
--   have arrived at the hub.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_sales_order_canonical_delivery_tracking(
  p_sales_order_id uuid
)
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

  RETURN QUERY
  SELECT
    MIN(b.dispatched_at) FILTER (
      WHERE b.status IN ('dispatched', 'arrived_hub')
    ),

    CASE
      WHEN COUNT(*) > 0
       AND COUNT(*) FILTER (WHERE b.status = 'arrived_hub') = COUNT(*)
      THEN MAX(b.arrived_hub_at)
      ELSE NULL
    END,

    (
      SELECT b2.tracking_url
      FROM public.canonical_supplier_delivery_batch_orders bo2
      JOIN public.canonical_supplier_delivery_batches b2
        ON b2.id = bo2.batch_id
      WHERE bo2.sales_order_id = p_sales_order_id
        AND b2.tracking_url IS NOT NULL
      ORDER BY b2.dispatched_at DESC NULLS LAST
      LIMIT 1
    ),

    COUNT(*)::integer,

    COUNT(*) FILTER (
      WHERE b.status IN ('dispatched', 'arrived_hub')
    )::integer,

    COUNT(*) FILTER (
      WHERE b.status = 'arrived_hub'
    )::integer

  FROM public.canonical_supplier_delivery_batch_orders bo
  JOIN public.canonical_supplier_delivery_batches b
    ON b.id = bo.batch_id
  WHERE bo.sales_order_id = p_sales_order_id
    AND b.status <> 'cancelled';
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Privileges
-- ---------------------------------------------------------------------------

REVOKE EXECUTE
ON FUNCTION public.admin_create_canonical_supplier_delivery_batch(bigint, date, text, text)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.admin_add_sales_order_to_supplier_delivery_batch(uuid, uuid)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.admin_remove_sales_order_from_supplier_delivery_batch(uuid, uuid)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.admin_dispatch_canonical_supplier_delivery_batch(uuid, text, text, text)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.admin_confirm_canonical_supplier_batch_hub_arrival(uuid)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.get_sales_order_canonical_delivery_tracking(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.admin_create_canonical_supplier_delivery_batch(bigint, date, text, text)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.admin_add_sales_order_to_supplier_delivery_batch(uuid, uuid)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.admin_remove_sales_order_from_supplier_delivery_batch(uuid, uuid)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.admin_dispatch_canonical_supplier_delivery_batch(uuid, text, text, text)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.admin_confirm_canonical_supplier_batch_hub_arrival(uuid)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.get_sales_order_canonical_delivery_tracking(uuid)
TO authenticated;

COMMIT;
