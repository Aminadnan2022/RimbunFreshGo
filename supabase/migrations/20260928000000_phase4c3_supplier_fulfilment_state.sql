-- Phase 4C.3
-- Canonical supplier-scoped fulfilment state.
--
-- One row per canonical sales order + supplier.
-- This avoids falsely marking the whole order packed when multiple suppliers
-- participate in the same order.
--
-- Lalamove / hub transport is intentionally NOT stored here. Normal-bulk
-- transport remains a later canonical delivery-batch concern.

BEGIN;

CREATE TABLE public.sales_order_supplier_fulfilments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  sales_order_id uuid NOT NULL
    REFERENCES public.sales_orders(id) ON DELETE RESTRICT,

  supplier_id bigint NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'packing', 'packed')),

  packing_started_at timestamptz,
  packing_started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  packing_completed_at timestamptz,
  packing_completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (sales_order_id, supplier_id),

  CHECK (
    status <> 'packing'
    OR packing_started_at IS NOT NULL
  ),

  CHECK (
    status <> 'packed'
    OR (
      packing_started_at IS NOT NULL
      AND packing_completed_at IS NOT NULL
    )
  )
);

CREATE INDEX sales_order_supplier_fulfilments_order_idx
  ON public.sales_order_supplier_fulfilments (sales_order_id);

CREATE INDEX sales_order_supplier_fulfilments_supplier_idx
  ON public.sales_order_supplier_fulfilments (supplier_id, status);

ALTER TABLE public.sales_order_supplier_fulfilments
ENABLE ROW LEVEL SECURITY;

-- Admin may read all fulfilment state.
CREATE POLICY phase4c3_supplier_fulfilments_admin_select
ON public.sales_order_supplier_fulfilments
FOR SELECT TO authenticated
USING (public.is_admin());

-- Supplier may read only their own supplier rows.
CREATE POLICY phase4c3_supplier_fulfilments_supplier_select
ON public.sales_order_supplier_fulfilments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
      FROM public.supplier_users su
     WHERE su.supplier_id = sales_order_supplier_fulfilments.supplier_id
       AND su.user_id = auth.uid()
       AND su.active
  )
);

GRANT SELECT
ON TABLE public.sales_order_supplier_fulfilments
TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Resolve every supplier currently represented in an order.
-- This helper supports direct product lines AND combo components.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.phase4c3_supplier_ids_for_sales_order(
  p_sales_order_id uuid
)
RETURNS TABLE (supplier_id bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT q.supplier_id
  FROM (
    SELECT l.supplier_id
      FROM public.sales_order_lines l
     WHERE l.sales_order_id = p_sales_order_id
       AND l.supplier_id IS NOT NULL

    UNION

    SELECT c.supplier_id
      FROM public.sales_order_line_components c
      JOIN public.sales_order_lines l
        ON l.id = c.sales_order_line_id
     WHERE l.sales_order_id = p_sales_order_id
       AND c.supplier_id IS NOT NULL
  ) q;
$$;

REVOKE EXECUTE
ON FUNCTION public.phase4c3_supplier_ids_for_sales_order(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.phase4c3_supplier_ids_for_sales_order(uuid)
TO authenticated;

-- ---------------------------------------------------------------------------
-- Start packing for every supplier represented by the current authenticated
-- supplier account in this order.
--
-- Backend payment enforcement is authoritative.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.supplier_start_canonical_packing(
  p_sales_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_supplier_id bigint;
  v_found boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.is_supplier() THEN
    RAISE EXCEPTION 'Supplier access required.';
  END IF;

  PERFORM public.phase4a_assert_supplier_paid(p_sales_order_id);

  FOR v_supplier_id IN
    SELECT DISTINCT su.supplier_id
      FROM public.supplier_users su
      JOIN public.phase4c3_supplier_ids_for_sales_order(p_sales_order_id) os
        ON os.supplier_id = su.supplier_id
     WHERE su.user_id = auth.uid()
       AND su.active
  LOOP
    v_found := true;

    INSERT INTO public.sales_order_supplier_fulfilments (
      sales_order_id,
      supplier_id,
      status,
      packing_started_at,
      packing_started_by,
      updated_at
    )
    VALUES (
      p_sales_order_id,
      v_supplier_id,
      'packing',
      now(),
      auth.uid(),
      now()
    )
    ON CONFLICT (sales_order_id, supplier_id)
    DO UPDATE SET
      status = CASE
        WHEN public.sales_order_supplier_fulfilments.status = 'packed'
          THEN 'packed'
        ELSE 'packing'
      END,
      packing_started_at =
        COALESCE(
          public.sales_order_supplier_fulfilments.packing_started_at,
          now()
        ),
      packing_started_by =
        COALESCE(
          public.sales_order_supplier_fulfilments.packing_started_by,
          auth.uid()
        ),
      updated_at = now();
  END LOOP;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Supplier is not assigned to this order.';
  END IF;

  INSERT INTO public.sales_order_events (
    sales_order_id,
    event_type,
    actor_id,
    payload
  )
  VALUES (
    p_sales_order_id,
    'supplier_packing_started',
    auth.uid(),
    '{}'::jsonb
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Complete packing for every supplier represented by this authenticated
-- supplier account in the order.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.supplier_complete_canonical_packing(
  p_sales_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_supplier_id bigint;
  v_found boolean := false;
  v_started_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.is_supplier() THEN
    RAISE EXCEPTION 'Supplier access required.';
  END IF;

  PERFORM public.phase4a_assert_supplier_paid(p_sales_order_id);

  FOR v_supplier_id IN
    SELECT DISTINCT su.supplier_id
      FROM public.supplier_users su
      JOIN public.phase4c3_supplier_ids_for_sales_order(p_sales_order_id) os
        ON os.supplier_id = su.supplier_id
     WHERE su.user_id = auth.uid()
       AND su.active
  LOOP
    v_found := true;

    SELECT packing_started_at
      INTO v_started_at
      FROM public.sales_order_supplier_fulfilments
     WHERE sales_order_id = p_sales_order_id
       AND supplier_id = v_supplier_id
     FOR UPDATE;

    IF v_started_at IS NULL THEN
      RAISE EXCEPTION 'Packing must be started before it can be completed.';
    END IF;

    UPDATE public.sales_order_supplier_fulfilments
       SET status = 'packed',
           packing_completed_at = COALESCE(packing_completed_at, now()),
           packing_completed_by = COALESCE(packing_completed_by, auth.uid()),
           updated_at = now()
     WHERE sales_order_id = p_sales_order_id
       AND supplier_id = v_supplier_id;
  END LOOP;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Supplier is not assigned to this order.';
  END IF;

  INSERT INTO public.sales_order_events (
    sales_order_id,
    event_type,
    actor_id,
    payload
  )
  VALUES (
    p_sales_order_id,
    'supplier_packing_completed',
    auth.uid(),
    '{}'::jsonb
  );
END;
$$;

REVOKE EXECUTE
ON FUNCTION public.supplier_start_canonical_packing(uuid)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.supplier_complete_canonical_packing(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.supplier_start_canonical_packing(uuid)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.supplier_complete_canonical_packing(uuid)
TO authenticated;

COMMIT;
