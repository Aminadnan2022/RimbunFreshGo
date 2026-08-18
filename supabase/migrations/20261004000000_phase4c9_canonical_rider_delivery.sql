-- Phase 4C9 — Canonical rider delivery workflow
--
-- Keeps legacy "Orders" rider workflow untouched.
-- Reuses delivery_assignments only as the roster of riders working a delivery date.
-- Each canonical sales order gets an explicit assigned rider.

CREATE TABLE public.canonical_sales_order_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  sales_order_id uuid NOT NULL
    REFERENCES public.sales_orders(id) ON DELETE RESTRICT,

  delivery_date date NOT NULL,

  assigned_rider_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'ready_for_rider'
    CHECK (status IN ('ready_for_rider', 'out_for_delivery', 'delivered')),

  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  ready_for_rider_at timestamptz NOT NULL DEFAULT now(),
  ready_for_rider_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  delivery_started_at timestamptz,
  delivery_started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  delivered_at timestamptz,
  delivered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT canonical_sales_order_deliveries_order_key
    UNIQUE (sales_order_id),

  CONSTRAINT canonical_sales_order_deliveries_state_check CHECK (
    (
      status = 'ready_for_rider'
      AND delivery_started_at IS NULL
      AND delivered_at IS NULL
    )
    OR
    (
      status = 'out_for_delivery'
      AND delivery_started_at IS NOT NULL
      AND delivered_at IS NULL
    )
    OR
    (
      status = 'delivered'
      AND delivery_started_at IS NOT NULL
      AND delivered_at IS NOT NULL
    )
  )
);

CREATE INDEX canonical_sales_order_deliveries_rider_date_idx
  ON public.canonical_sales_order_deliveries
  (assigned_rider_id, delivery_date, status);

ALTER TABLE public.canonical_sales_order_deliveries ENABLE ROW LEVEL SECURITY;

-- Admin may inspect every canonical delivery.
CREATE POLICY phase4c9_canonical_delivery_admin_select
ON public.canonical_sales_order_deliveries
FOR SELECT TO authenticated
USING (public.is_admin());

-- Rider may inspect only orders explicitly assigned to them.
CREATE POLICY phase4c9_canonical_delivery_rider_select
ON public.canonical_sales_order_deliveries
FOR SELECT TO authenticated
USING (
  public.is_delivery_rider()
  AND assigned_rider_id = auth.uid()
);

GRANT SELECT ON public.canonical_sales_order_deliveries TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin assigns a canonical sales order to one rider.
--
-- Requirements:
--   * order exists, active and paid
--   * every supplier fulfilment is packed
--   * every required supplier has arrived at the FreshGo hub
--   * rider is rostered in delivery_assignments for the order delivery date
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_assign_canonical_sales_order_rider(
  p_sales_order_id uuid,
  p_rider_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery_date date;
  v_delivery_id uuid;
  v_existing public.canonical_sales_order_deliveries%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT NULLIF(o.delivery_snapshot ->> 'requested_date', '')::date
    INTO v_delivery_date
  FROM public.sales_orders o
  WHERE o.id = p_sales_order_id
    AND o.status <> 'cancelled'
    AND o.payment_status = 'paid';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paid active canonical order not found.';
  END IF;

  IF v_delivery_date IS NULL THEN
    RAISE EXCEPTION 'Canonical order has no requested delivery date.';
  END IF;

  -- At least one supplier fulfilment must exist.
  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_order_supplier_fulfilments f
    WHERE f.sales_order_id = p_sales_order_id
  ) THEN
    RAISE EXCEPTION 'Supplier fulfilment has not been created for this order.';
  END IF;

  -- Every supplier must have completed packing.
  IF EXISTS (
    SELECT 1
    FROM public.sales_order_supplier_fulfilments f
    WHERE f.sales_order_id = p_sales_order_id
      AND (
        f.status <> 'packed'
        OR f.packing_completed_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'All suppliers must complete packing first.';
  END IF;

  -- Every required supplier must have an arrived-hub canonical batch.
  IF EXISTS (
    SELECT 1
    FROM public.sales_order_supplier_fulfilments f
    WHERE f.sales_order_id = p_sales_order_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.canonical_supplier_delivery_batch_orders bo
        JOIN public.canonical_supplier_delivery_batches b
          ON b.id = bo.batch_id
        WHERE bo.sales_order_id = p_sales_order_id
          AND bo.supplier_id = f.supplier_id
          AND b.status = 'arrived_hub'
          AND b.arrived_hub_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'All supplier shipments must arrive at the FreshGo hub first.';
  END IF;

  -- Rider must actually be rostered for this date.
  IF NOT EXISTS (
    SELECT 1
    FROM public.delivery_assignments da
    WHERE da.delivery_date = v_delivery_date
      AND da.rider_id = p_rider_id
  ) THEN
    RAISE EXCEPTION 'Selected rider is not assigned to this delivery date.';
  END IF;

  -- Must really be a delivery_rider account.
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.id = p_rider_id
      AND ur.role = 'delivery_rider'
  ) THEN
    RAISE EXCEPTION 'Selected user is not a delivery rider.';
  END IF;

  SELECT *
    INTO v_existing
  FROM public.canonical_sales_order_deliveries
  WHERE sales_order_id = p_sales_order_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'delivered' THEN
      RAISE EXCEPTION 'Delivered orders cannot be reassigned.';
    END IF;

    IF v_existing.status = 'out_for_delivery' THEN
      RAISE EXCEPTION 'Out-for-delivery orders cannot be reassigned.';
    END IF;

    UPDATE public.canonical_sales_order_deliveries
       SET assigned_rider_id = p_rider_id,
           delivery_date = v_delivery_date,
           assigned_at = now(),
           assigned_by = auth.uid(),
           updated_at = now()
     WHERE id = v_existing.id
     RETURNING id INTO v_delivery_id;
  ELSE
    INSERT INTO public.canonical_sales_order_deliveries (
      sales_order_id,
      delivery_date,
      assigned_rider_id,
      status,
      assigned_at,
      assigned_by,
      ready_for_rider_at,
      ready_for_rider_by
    )
    VALUES (
      p_sales_order_id,
      v_delivery_date,
      p_rider_id,
      'ready_for_rider',
      now(),
      auth.uid(),
      now(),
      auth.uid()
    )
    RETURNING id INTO v_delivery_id;
  END IF;

  INSERT INTO public.sales_order_events (
    sales_order_id,
    event_type,
    actor_id,
    payload
  )
  VALUES (
    p_sales_order_id,
    'ready_for_rider',
    auth.uid(),
    jsonb_build_object(
      'canonical_delivery_id', v_delivery_id,
      'rider_id', p_rider_id,
      'delivery_date', v_delivery_date
    )
  );

  RETURN v_delivery_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Rider starts delivery.
-- Only the explicitly assigned rider may operate the order.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rider_start_canonical_sales_order_delivery(
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
    RAISE EXCEPTION 'Order is already delivered.';
  END IF;

  IF v_row.status = 'out_for_delivery' THEN
    RETURN;
  END IF;

  UPDATE public.canonical_sales_order_deliveries
     SET status = 'out_for_delivery',
         delivery_started_at = now(),
         delivery_started_by = auth.uid(),
         updated_at = now()
   WHERE id = v_row.id;

  INSERT INTO public.sales_order_events (
    sales_order_id,
    event_type,
    actor_id,
    payload
  )
  VALUES (
    p_sales_order_id,
    'out_for_delivery',
    auth.uid(),
    jsonb_build_object(
      'canonical_delivery_id', v_row.id,
      'rider_id', auth.uid()
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Rider marks delivery completed.
-- ---------------------------------------------------------------------------

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

  UPDATE public.canonical_sales_order_deliveries
     SET status = 'delivered',
         delivered_at = now(),
         delivered_by = auth.uid(),
         updated_at = now()
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
      'rider_id', auth.uid()
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Rider dashboard read model.
-- Returns only canonical orders explicitly assigned to the current rider.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_canonical_rider_orders()
RETURNS TABLE (
  sales_order_id uuid,
  order_number text,
  delivery_date date,
  delivery_status text,
  ready_for_rider_at timestamptz,
  delivery_started_at timestamptz,
  delivered_at timestamptz,
  customer_name text,
  customer_phone text,
  apartment text,
  house_unit text,
  pickup_location text,
  delivery_point_name text,
  customer_notes text,
  payment_status text,
  items jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    d.sales_order_id,
    o.order_number,
    d.delivery_date,
    d.status,
    d.ready_for_rider_at,
    d.delivery_started_at,
    d.delivered_at,
    COALESCE(o.customer_snapshot ->> 'name', ''),
    COALESCE(o.customer_snapshot ->> 'phone', ''),
    COALESCE(o.delivery_snapshot ->> 'apartment', ''),
    COALESCE(o.delivery_snapshot ->> 'house_unit', ''),
    COALESCE(o.delivery_snapshot ->> 'pickup_location', ''),
    COALESCE(o.delivery_snapshot ->> 'delivery_point_name', ''),
    COALESCE(o.customer_snapshot ->> 'notes', ''),
    o.payment_status,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'name', COALESCE(l.product_snapshot ->> 'name', 'Order item'),
            'quantity', l.quantity,
            'selling_unit', l.selling_unit
          )
          ORDER BY l.line_number
        )
        FROM public.sales_order_lines l
        WHERE l.sales_order_id = o.id
      ),
      '[]'::jsonb
    )
  FROM public.canonical_sales_order_deliveries d
  JOIN public.sales_orders o
    ON o.id = d.sales_order_id
  WHERE public.is_delivery_rider()
    AND d.assigned_rider_id = auth.uid()
    AND d.status <> 'delivered'
  ORDER BY
    d.delivery_date,
    d.ready_for_rider_at,
    o.order_number;
$$;

-- ---------------------------------------------------------------------------
-- Customer-safe canonical rider tracking.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_sales_order_canonical_rider_tracking(
  p_sales_order_id uuid
)
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
    SELECT 1
    FROM public.sales_orders o
    WHERE o.id = p_sales_order_id
      AND (
        o.customer_id = auth.uid()
        OR public.is_admin()
      )
  ) THEN
    RAISE EXCEPTION 'Order access denied.';
  END IF;

  RETURN QUERY
  SELECT
    d.ready_for_rider_at,
    d.delivery_started_at,
    d.delivered_at,
    d.status,
    COALESCE(
      NULLIF(u.raw_user_meta_data ->> 'full_name', ''),
      NULLIF(u.raw_user_meta_data ->> 'name', ''),
      u.email
    )
  FROM public.canonical_sales_order_deliveries d
  LEFT JOIN auth.users u
    ON u.id = d.assigned_rider_id
  WHERE d.sales_order_id = p_sales_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_canonical_sales_order_rider(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rider_start_canonical_sales_order_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rider_complete_canonical_sales_order_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_canonical_rider_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sales_order_canonical_rider_tracking(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_assign_canonical_sales_order_rider(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rider_start_canonical_sales_order_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rider_complete_canonical_sales_order_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_canonical_rider_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_order_canonical_rider_tracking(uuid) TO authenticated;

COMMENT ON TABLE public.canonical_sales_order_deliveries IS
  'Canonical per-sales-order last-mile delivery assignment and rider lifecycle. Legacy Orders rider workflow remains separate.';
