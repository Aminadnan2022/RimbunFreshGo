-- Phase 4B.0 (part 3): combo component finalisation + supplier isolation.
--
-- Problem: the applied finalize_sales_order_pricing(uuid, jsonb, jsonb) lets
-- any supplier assigned to ANY line on an order submit weights for the WHOLE
-- order, including lines/components belonging to a different supplier. That
-- is unsafe once an order can contain multiple suppliers (normal FreshGo
-- multi-vendor cart, or a combo whose components come from different
-- suppliers). This migration splits the workflow:
--   1. narrow, supplier-scoped RECORDING RPCs (a supplier may only write
--      actual weight for a line/component/unit they are actually assigned to)
--   2. a single ADMIN-ONLY CALCULATION RPC that rolls up already-recorded
--      measurements into final totals, once, atomically, using frozen rates.
-- No supplier ever gains write access to another supplier's data, and no
-- customer money is ever derived from anything other than the frozen
-- unit_selling_price/combo selling price captured at checkout.

-- -----------------------------------------------------------------------------
-- 1. Supplier ownership helpers (line / combo component scoped)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_supplier_for_sales_order_line(p_sales_order_line_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_supplier() AND EXISTS (
    SELECT 1 FROM public.sales_order_lines l
    JOIN public.supplier_users su ON su.supplier_id = l.supplier_id
    WHERE l.id = p_sales_order_line_id AND su.user_id = auth.uid() AND su.active
  );
$$;

CREATE OR REPLACE FUNCTION public.is_supplier_for_sales_order_line_component(p_sales_order_line_component_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_supplier() AND EXISTS (
    SELECT 1 FROM public.sales_order_line_components c
    JOIN public.supplier_users su ON su.supplier_id = c.supplier_id
    WHERE c.id = p_sales_order_line_component_id AND su.user_id = auth.uid() AND su.active
  );
$$;

-- -----------------------------------------------------------------------------
-- 2. Supplier-scoped actual-weight recording (data entry only, no calculation)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_sales_order_line_actual_weight(
  p_sales_order_line_id uuid, p_actual_weight_kg numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_line public.sales_order_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_line FROM public.sales_order_lines WHERE id = p_sales_order_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order line not found.'; END IF;
  IF NOT (public.is_admin() OR public.is_supplier_for_sales_order_line(p_sales_order_line_id)) THEN
    RAISE EXCEPTION 'Not authorized for this order line.';
  END IF;
  IF v_line.ordering_mode NOT IN ('weight_only', 'slice') THEN
    RAISE EXCEPTION 'Actual weight entry only applies to weight_only/slice lines.';
  END IF;
  IF p_actual_weight_kg IS NULL OR p_actual_weight_kg < 0 THEN
    RAISE EXCEPTION 'Invalid actual weight.';
  END IF;
  IF v_line.final_line_total IS NOT NULL THEN
    RAISE EXCEPTION 'This line is already finalised.';
  END IF;
  PERFORM set_config('freshgo.canonical_operation', 'price_finalisation', true);
  UPDATE public.sales_order_lines SET actual_weight_kg = p_actual_weight_kg WHERE id = p_sales_order_line_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_sales_order_line_unit_actual_weight(
  p_sales_order_line_unit_id uuid, p_actual_weight_kg numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_unit public.sales_order_line_units%ROWTYPE; v_line public.sales_order_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_unit FROM public.sales_order_line_units WHERE id = p_sales_order_line_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order line unit not found.'; END IF;
  SELECT * INTO v_line FROM public.sales_order_lines WHERE id = v_unit.sales_order_line_id;
  IF NOT (public.is_admin() OR public.is_supplier_for_sales_order_line(v_line.id)) THEN
    RAISE EXCEPTION 'Not authorized for this order line.';
  END IF;
  IF p_actual_weight_kg IS NULL OR p_actual_weight_kg < 0 THEN
    RAISE EXCEPTION 'Invalid actual weight.';
  END IF;
  IF v_line.final_line_total IS NOT NULL THEN
    RAISE EXCEPTION 'This line is already finalised.';
  END IF;
  PERFORM set_config('freshgo.canonical_operation', 'price_finalisation', true);
  UPDATE public.sales_order_line_units SET actual_weight_kg = p_actual_weight_kg WHERE id = p_sales_order_line_unit_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_sales_order_line_component_actual_weight(
  p_sales_order_line_component_id uuid, p_actual_weight_kg numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_component public.sales_order_line_components%ROWTYPE;
BEGIN
  SELECT * INTO v_component FROM public.sales_order_line_components WHERE id = p_sales_order_line_component_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Combo component not found.'; END IF;
  IF NOT (public.is_admin() OR public.is_supplier_for_sales_order_line_component(p_sales_order_line_component_id)) THEN
    RAISE EXCEPTION 'Not authorized for this combo component.';
  END IF;
  IF v_component.ordering_mode NOT IN ('weight_only', 'slice') THEN
    RAISE EXCEPTION 'Actual weight entry only applies to weight_only/slice components.';
  END IF;
  IF p_actual_weight_kg IS NULL OR p_actual_weight_kg < 0 THEN
    RAISE EXCEPTION 'Invalid actual weight.';
  END IF;
  IF v_component.final_supplier_cost IS NOT NULL THEN
    RAISE EXCEPTION 'This component is already finalised.';
  END IF;
  PERFORM set_config('freshgo.canonical_operation', 'price_finalisation', true);
  UPDATE public.sales_order_line_components SET actual_weight_kg = p_actual_weight_kg WHERE id = p_sales_order_line_component_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_sales_order_line_component_unit_actual_weight(
  p_sales_order_line_component_unit_id uuid, p_actual_weight_kg numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_unit public.sales_order_line_component_units%ROWTYPE; v_component public.sales_order_line_components%ROWTYPE;
BEGIN
  SELECT * INTO v_unit FROM public.sales_order_line_component_units WHERE id = p_sales_order_line_component_unit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Combo component unit not found.'; END IF;
  SELECT * INTO v_component FROM public.sales_order_line_components WHERE id = v_unit.sales_order_line_component_id;
  IF NOT (public.is_admin() OR public.is_supplier_for_sales_order_line_component(v_component.id)) THEN
    RAISE EXCEPTION 'Not authorized for this combo component.';
  END IF;
  IF p_actual_weight_kg IS NULL OR p_actual_weight_kg < 0 THEN
    RAISE EXCEPTION 'Invalid actual weight.';
  END IF;
  IF v_component.final_supplier_cost IS NOT NULL THEN
    RAISE EXCEPTION 'This component is already finalised.';
  END IF;
  PERFORM set_config('freshgo.canonical_operation', 'price_finalisation', true);
  UPDATE public.sales_order_line_component_units SET actual_weight_kg = p_actual_weight_kg WHERE id = p_sales_order_line_component_unit_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Admin-only aggregate calculation. No weight input parameters: it only
--    rolls up whatever has already been recorded through the RPCs above, using
--    frozen unit_selling_price/unit_cost_price. Aborts atomically (no partial
--    finalisation) if any required measurement is still missing.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.finalize_sales_order_pricing(uuid, jsonb, jsonb);

CREATE FUNCTION public.finalize_sales_order_pricing(p_sales_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_line record;
  v_component record;
  v_actual_weight numeric(12,3);
  v_final_line_total numeric(12,2);
  v_final_supplier_cost numeric(12,2);
  v_subtotal numeric(12,2);
  v_combo_cost_sum numeric(12,2);
  v_unit_count integer;
  v_unit_present integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;

  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sales_order_id AND status <> 'cancelled';
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found or cancelled.'; END IF;
  IF v_order.price_status = 'final' THEN RAISE EXCEPTION 'Order pricing is already final.'; END IF;

  PERFORM set_config('freshgo.canonical_operation', 'price_finalisation', true);

  FOR v_line IN
    SELECT * FROM public.sales_order_lines
     WHERE sales_order_id = p_sales_order_id AND final_line_total IS NULL
  LOOP
    IF v_line.ordering_mode = 'whole_fish_by_weight' THEN
      SELECT count(*), count(actual_weight_kg), sum(actual_weight_kg)
        INTO v_unit_count, v_unit_present, v_actual_weight
        FROM public.sales_order_line_units WHERE sales_order_line_id = v_line.id;
      IF v_unit_count = 0 OR v_unit_present < v_unit_count THEN
        RAISE EXCEPTION 'Line %: missing actual weight for one or more physical units.', v_line.line_number;
      END IF;
    ELSE
      v_actual_weight := v_line.actual_weight_kg;
      IF v_actual_weight IS NULL THEN
        RAISE EXCEPTION 'Line %: missing actual weight.', v_line.line_number;
      END IF;
    END IF;

    v_final_line_total := greatest(round(v_line.unit_selling_price * v_actual_weight, 2) - v_line.discount_amount, 0);
    v_final_supplier_cost := CASE WHEN v_line.unit_cost_price IS NULL THEN NULL
      ELSE round(v_line.unit_cost_price * v_actual_weight, 2) END;

    UPDATE public.sales_order_lines
       SET actual_weight_kg = v_actual_weight,
           final_line_total = v_final_line_total,
           final_supplier_cost = v_final_supplier_cost,
           finalised_at = now(),
           line_total = v_final_line_total
     WHERE id = v_line.id;
  END LOOP;

  FOR v_component IN
    SELECT c.* FROM public.sales_order_line_components c
    JOIN public.sales_order_lines l ON l.id = c.sales_order_line_id
     WHERE l.sales_order_id = p_sales_order_id AND c.final_supplier_cost IS NULL
  LOOP
    IF v_component.ordering_mode = 'whole_fish_by_weight' THEN
      SELECT count(*), count(actual_weight_kg), sum(actual_weight_kg)
        INTO v_unit_count, v_unit_present, v_actual_weight
        FROM public.sales_order_line_component_units WHERE sales_order_line_component_id = v_component.id;
      IF v_unit_count = 0 OR v_unit_present < v_unit_count THEN
        RAISE EXCEPTION 'Component %: missing actual weight for one or more physical units.', v_component.component_number;
      END IF;
    ELSE
      v_actual_weight := v_component.actual_weight_kg;
      IF v_actual_weight IS NULL THEN
        RAISE EXCEPTION 'Component %: missing actual weight.', v_component.component_number;
      END IF;
    END IF;

    v_final_supplier_cost := round(v_component.unit_cost_price * v_actual_weight, 2);

    UPDATE public.sales_order_line_components
       SET actual_weight_kg = v_actual_weight,
           final_supplier_cost = v_final_supplier_cost,
           finalised_at = now()
     WHERE id = v_component.id;
  END LOOP;

  -- Roll up combo parent supplier cost now that every component is settled.
  -- Parent line_total (customer revenue) is never touched here.
  FOR v_line IN
    SELECT * FROM public.sales_order_lines
     WHERE sales_order_id = p_sales_order_id AND item_kind = 'combo' AND final_supplier_cost IS NULL
  LOOP
    SELECT sum(final_supplier_cost) INTO v_combo_cost_sum
      FROM public.sales_order_line_components WHERE sales_order_line_id = v_line.id;
    UPDATE public.sales_order_lines SET final_supplier_cost = v_combo_cost_sum WHERE id = v_line.id;
  END LOOP;

  SELECT COALESCE(sum(line_total), 0) INTO v_subtotal
    FROM public.sales_order_lines WHERE sales_order_id = p_sales_order_id;

  UPDATE public.sales_orders
     SET price_status = 'final',
         final_subtotal = v_subtotal,
         final_total = v_subtotal + delivery_fee - discount_amount,
         subtotal = v_subtotal,
         total = v_subtotal + delivery_fee - discount_amount,
         price_finalised_at = now(),
         price_finalised_by = auth.uid()
   WHERE id = p_sales_order_id;

  INSERT INTO public.sales_order_events (sales_order_id, event_type, actor_id, payload)
  VALUES (p_sales_order_id, 'price_finalised', auth.uid(),
    jsonb_build_object('final_subtotal', v_subtotal, 'final_total', v_subtotal + v_order.delivery_fee));
  INSERT INTO public.notifications (recipient_user_id, recipient_role, sales_order_id, notification_type, title, message, payload)
  SELECT customer_id, 'customer', id, 'price_finalised', 'Final order price ready',
         'Your final order price is ready. Please complete payment.', jsonb_build_object('final_total', final_total)
  FROM public.sales_orders WHERE id = p_sales_order_id AND customer_id IS NOT NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Grants: least privilege, PUBLIC never gets implicit execute rights.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.is_supplier_for_sales_order_line(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_supplier_for_sales_order_line_component(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_sales_order_line_actual_weight(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_sales_order_line_unit_actual_weight(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_sales_order_line_component_actual_weight(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_sales_order_line_component_unit_actual_weight(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_sales_order_pricing(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_supplier_for_sales_order_line(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supplier_for_sales_order_line_component(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_sales_order_line_actual_weight(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_sales_order_line_unit_actual_weight(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_sales_order_line_component_actual_weight(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_sales_order_line_component_unit_actual_weight(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_sales_order_pricing(uuid) TO authenticated;
