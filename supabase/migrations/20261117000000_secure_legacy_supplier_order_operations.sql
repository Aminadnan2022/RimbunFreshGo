-- Keep legacy supplier operations usable without exposing Orders financial data.
-- Canonical supplier ownership/RLS and admin/reporting reads remain unchanged.

CREATE OR REPLACE FUNCTION public.supplier_operational_order_item(p_item jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_combo_item jsonb;
  v_combo_items jsonb := '[]'::jsonb;
BEGIN
  v_item := COALESCE(p_item, '{}'::jsonb) - ARRAY[
    'price', 'costPrice', 'grossProfit', 'supplierName',
    'selling_price_per_unit', 'supplier_cost_per_unit',
    'selling_total', 'supplier_total', 'gross_profit',
    'profit_margin_percent', 'pricing_snapshot_timestamp'
  ];

  IF jsonb_typeof(v_item->'comboItems') = 'array' THEN
    FOR v_combo_item IN SELECT value FROM jsonb_array_elements(v_item->'comboItems')
    LOOP
      v_combo_items := v_combo_items || jsonb_build_array(
        public.supplier_operational_order_item(v_combo_item)
      );
    END LOOP;
    v_item := jsonb_set(v_item, '{comboItems}', v_combo_items, true);
  END IF;

  RETURN v_item;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.supplier_operational_order_item(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.supplier_list_legacy_orders()
RETURNS TABLE (
  id bigint,
  full_name text,
  phone_number text,
  apartment text,
  house_unit text,
  pickup_location text,
  order_notes text,
  order_items jsonb,
  order_summary jsonb,
  supplier_weights jsonb,
  payment_status text,
  paid_at timestamptz,
  packing_started_at timestamptz,
  packing_completed_at timestamptz,
  supplier_dispatch_started_at timestamptz,
  supplier_dispatch_completed_at timestamptz,
  ready_for_rider_at timestamptz,
  lalamove_tracking_url text,
  booking_reference text,
  lalamove_booked_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    o.id,
    o.full_name,
    o.phone_number,
    o.apartment,
    o.house_unit,
    o.pickup_location,
    o.order_notes,
    COALESCE((
      SELECT jsonb_agg(public.supplier_operational_order_item(item) ORDER BY ordinality)
      FROM jsonb_array_elements(COALESCE(o.order_items, '[]'::jsonb))
        WITH ORDINALITY AS items(item, ordinality)
    ), '[]'::jsonb),
    o.order_summary,
    o.supplier_weights,
    o.payment_status,
    o.paid_at,
    o.packing_started_at,
    o.packing_completed_at,
    o.supplier_dispatch_started_at,
    o.supplier_dispatch_completed_at,
    o.ready_for_rider_at,
    o.lalamove_tracking_url,
    o.booking_reference,
    o.lalamove_booked_at,
    o.created_at
  FROM public."Orders" o
  WHERE auth.uid() IS NOT NULL
    AND public.is_supplier()
  ORDER BY o.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.supplier_list_legacy_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_list_legacy_orders() TO authenticated;

CREATE OR REPLACE FUNCTION public.supplier_record_legacy_order_weight(
  p_order_id bigint,
  p_item_index integer,
  p_actual_weight_kg numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public."Orders"%ROWTYPE;
  v_item jsonb;
  v_weights jsonb;
  v_all_weights_submitted boolean := true;
  v_item_position integer;
  v_line jsonb;
  v_quantity numeric;
  v_total numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_supplier() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_item_index < 0 OR p_actual_weight_kg IS NULL OR p_actual_weight_kg <= 0 THEN
    RAISE EXCEPTION 'Invalid supplier weight';
  END IF;

  SELECT o.* INTO v_order
  FROM public."Orders" o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF COALESCE(v_order.payment_status, '') = 'Paid' THEN
    RAISE EXCEPTION 'Order is already finalised';
  END IF;

  v_item := v_order.order_items->p_item_index;
  IF v_item IS NULL OR COALESCE(v_item->>'pricingType', '') NOT IN ('per_kg', 'slice') THEN
    RAISE EXCEPTION 'Order item does not accept a supplier weight';
  END IF;

  v_weights := jsonb_set(
    COALESCE(v_order.supplier_weights, '{}'::jsonb),
    ARRAY[p_item_index::text],
    to_jsonb(p_actual_weight_kg),
    true
  );

  FOR v_line, v_item_position IN
    SELECT item, ordinality - 1
    FROM jsonb_array_elements(COALESCE(v_order.order_items, '[]'::jsonb))
      WITH ORDINALITY AS items(item, ordinality)
  LOOP
    IF COALESCE(v_line->>'pricingType', '') IN ('per_kg', 'slice') THEN
      v_quantity := NULLIF(v_weights->>v_item_position::text, '')::numeric;
      IF v_quantity IS NULL OR v_quantity <= 0 THEN
        v_all_weights_submitted := false;
        v_quantity := 0;
      END IF;
    ELSE
      v_quantity := COALESCE((v_line->>'quantity')::numeric, 0);
    END IF;
    v_total := v_total + COALESCE((v_line->>'price')::numeric, 0) * v_quantity;
  END LOOP;

  v_total := round(v_total + COALESCE(v_order.delivery_fee, 0), 2);

  UPDATE public."Orders" o
  SET supplier_weights = v_weights,
      total = v_total,
      payment_status = CASE
        WHEN v_all_weights_submitted THEN 'Ready To Pay'
        ELSE o.payment_status
      END,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE o.id = p_order_id;

  RETURN jsonb_build_object(
    'supplier_weights', v_weights,
    'all_weights_submitted', v_all_weights_submitted,
    'payment_status', CASE
      WHEN v_all_weights_submitted THEN 'Ready To Pay'
      ELSE v_order.payment_status
    END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.supplier_record_legacy_order_weight(bigint, integer, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_record_legacy_order_weight(bigint, integer, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.supplier_mark_legacy_order_ready(p_order_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public."Orders"%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_supplier() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT o.* INTO v_order
  FROM public."Orders" o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF COALESCE(v_order.payment_status, '') = 'Paid' THEN
    RAISE EXCEPTION 'Order is already finalised';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_order.order_items, '[]'::jsonb)) item
    WHERE COALESCE(item->>'pricingType', '') IN ('per_kg', 'slice')
  ) THEN
    RAISE EXCEPTION 'Order still requires supplier weights';
  END IF;

  UPDATE public."Orders" o
  SET payment_status = 'Ready To Pay',
      updated_at = now(),
      updated_by = auth.uid()
  WHERE o.id = p_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.supplier_mark_legacy_order_ready(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_mark_legacy_order_ready(bigint) TO authenticated;

-- Suppliers must use the operational RPCs above. Customer/admin policies and
-- existing SECURITY DEFINER workflow RPCs remain in place.
DROP POLICY IF EXISTS "supplier_select_orders" ON public."Orders";
DROP POLICY IF EXISTS "supplier_update_orders" ON public."Orders";
