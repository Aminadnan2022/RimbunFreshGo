-- Keep fixed-price combo procurement measurements independent from customer
-- price finalisation.  A weighted combo component can refine supplier cost,
-- but only a weighted standalone line can change the customer's payable total.

BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_sales_order_pricing(p_sales_order_id uuid)
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
  v_unit_count integer;
  v_unit_present integer;
BEGIN
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1
      FROM public.sales_order_lines l
      JOIN public.supplier_users su ON su.supplier_id = l.supplier_id
     WHERE l.sales_order_id = p_sales_order_id
       AND su.user_id = auth.uid()
       AND su.active
    UNION ALL
    SELECT 1
      FROM public.sales_order_line_components c
      JOIN public.sales_order_lines l ON l.id = c.sales_order_line_id
      JOIN public.supplier_users su ON su.supplier_id = c.supplier_id
     WHERE l.sales_order_id = p_sales_order_id
       AND su.user_id = auth.uid()
       AND su.active
  ) THEN
    RAISE EXCEPTION 'Not authorized for this order.';
  END IF;

  SELECT * INTO v_order
    FROM public.sales_orders
   WHERE id = p_sales_order_id AND status <> 'cancelled'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found or cancelled.'; END IF;
  IF v_order.price_status = 'final' THEN RETURN; END IF;

  PERFORM set_config('freshgo.canonical_operation', 'price_finalisation', true);

  -- Only customer-priced standalone lines participate in customer finality.
  FOR v_line IN
    SELECT *
      FROM public.sales_order_lines
     WHERE sales_order_id = p_sales_order_id
       AND item_kind = 'product'
       AND final_line_total IS NULL
     FOR UPDATE
  LOOP
    IF v_line.ordering_mode = 'whole_fish_by_weight' THEN
      SELECT count(*), count(actual_weight_kg), sum(actual_weight_kg)
        INTO v_unit_count, v_unit_present, v_actual_weight
        FROM public.sales_order_line_units
       WHERE sales_order_line_id = v_line.id;
      IF v_unit_count = 0 OR v_unit_present < v_unit_count THEN
        RAISE EXCEPTION 'Line %: missing actual weight for one or more physical units.', v_line.line_number;
      END IF;
    ELSE
      v_actual_weight := v_line.actual_weight_kg;
      IF v_actual_weight IS NULL THEN
        RAISE EXCEPTION 'Line %: missing actual weight.', v_line.line_number;
      END IF;
    END IF;

    v_final_line_total := greatest(
      round(v_line.unit_selling_price * v_actual_weight, 2) - v_line.discount_amount,
      0
    );
    v_final_supplier_cost := CASE
      WHEN v_line.unit_cost_price IS NULL THEN NULL
      ELSE round(v_line.unit_cost_price * v_actual_weight, 2)
    END;

    UPDATE public.sales_order_lines
       SET actual_weight_kg = v_actual_weight,
           final_line_total = v_final_line_total,
           final_supplier_cost = v_final_supplier_cost,
           finalised_at = now(),
           line_total = v_final_line_total
     WHERE id = v_line.id;
  END LOOP;

  -- Procurement-only combo measurements are opportunistic.  Calculate any
  -- component whose measurement is complete, and leave the rest open.
  FOR v_component IN
    SELECT c.*
      FROM public.sales_order_line_components c
      JOIN public.sales_order_lines l ON l.id = c.sales_order_line_id
     WHERE l.sales_order_id = p_sales_order_id
       AND c.final_supplier_cost IS NULL
       AND (
         (c.ordering_mode = 'whole_fish_by_weight' AND EXISTS (
           SELECT 1
             FROM public.sales_order_line_component_units u
            WHERE u.sales_order_line_component_id = c.id
           HAVING count(*) > 0 AND count(u.actual_weight_kg) = count(*)
         ))
         OR (c.ordering_mode <> 'whole_fish_by_weight' AND c.actual_weight_kg IS NOT NULL)
       )
     FOR UPDATE OF c
  LOOP
    IF v_component.ordering_mode = 'whole_fish_by_weight' THEN
      SELECT sum(actual_weight_kg)
        INTO v_actual_weight
        FROM public.sales_order_line_component_units
       WHERE sales_order_line_component_id = v_component.id;
    ELSE
      v_actual_weight := v_component.actual_weight_kg;
    END IF;

    UPDATE public.sales_order_line_components
       SET actual_weight_kg = v_actual_weight,
           final_supplier_cost = round(unit_cost_price * v_actual_weight, 2),
           finalised_at = now()
     WHERE id = v_component.id;
  END LOOP;

  -- Freeze the combo parent cost only after every component cost is known.
  UPDATE public.sales_order_lines l
     SET final_supplier_cost = component_costs.total_cost
    FROM (
      SELECT c.sales_order_line_id, sum(c.final_supplier_cost) AS total_cost
        FROM public.sales_order_line_components c
       GROUP BY c.sales_order_line_id
      HAVING count(*) = count(c.final_supplier_cost)
    ) component_costs
   WHERE l.id = component_costs.sales_order_line_id
     AND l.sales_order_id = p_sales_order_id
     AND l.item_kind = 'combo';

  SELECT COALESCE(sum(line_total), 0)
    INTO v_subtotal
    FROM public.sales_order_lines
   WHERE sales_order_id = p_sales_order_id;

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
  VALUES (
    p_sales_order_id,
    'price_finalised',
    auth.uid(),
    jsonb_build_object(
      'final_subtotal', v_subtotal,
      'final_total', v_subtotal + v_order.delivery_fee - v_order.discount_amount
    )
  );

  INSERT INTO public.notifications (
    recipient_user_id, recipient_role, sales_order_id, notification_type,
    title, message, payload
  )
  SELECT customer_id, 'customer', id, 'price_finalised',
         'Final order price ready',
         'Your final order price is ready. Please complete payment.',
         jsonb_build_object('final_total', final_total)
    FROM public.sales_orders
   WHERE id = p_sales_order_id AND customer_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.reprice_final_sales_order_after_weight_correction(p_sales_order_id uuid)
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
  v_unit_count integer;
  v_unit_present integer;
  v_subtotal numeric(12,2);
  v_previous_final_total numeric(12,2);
  v_final_total numeric(12,2);
BEGIN
  SELECT * INTO v_order
    FROM public.sales_orders
   WHERE id = p_sales_order_id AND status <> 'cancelled'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found or cancelled.'; END IF;
  IF v_order.price_status <> 'final' THEN RETURN; END IF;
  IF v_order.payment_status = 'receipt_submitted' THEN
    RAISE EXCEPTION 'Weight entry is locked while a payment receipt is under review.';
  END IF;
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Weight entry is locked because the order has been paid.';
  END IF;
  IF v_order.payment_status NOT IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'Weight entry is not currently allowed.';
  END IF;

  v_previous_final_total := v_order.final_total;
  PERFORM set_config('freshgo.canonical_operation', 'price_correction', true);

  -- Reprice genuine customer-priced standalone weighted lines only.
  FOR v_line IN
    SELECT *
      FROM public.sales_order_lines
     WHERE sales_order_id = p_sales_order_id
       AND item_kind = 'product'
       AND ordering_mode IN ('weight_only', 'slice', 'whole_fish_by_weight')
     FOR UPDATE
  LOOP
    IF v_line.ordering_mode = 'whole_fish_by_weight' THEN
      SELECT count(*), count(actual_weight_kg), sum(actual_weight_kg)
        INTO v_unit_count, v_unit_present, v_actual_weight
        FROM public.sales_order_line_units
       WHERE sales_order_line_id = v_line.id;
      IF v_unit_count = 0 OR v_unit_present < v_unit_count THEN
        RAISE EXCEPTION 'Line %: missing actual weight for one or more physical units.', v_line.line_number;
      END IF;
    ELSE
      v_actual_weight := v_line.actual_weight_kg;
      IF v_actual_weight IS NULL THEN
        RAISE EXCEPTION 'Line %: missing actual weight.', v_line.line_number;
      END IF;
    END IF;

    UPDATE public.sales_order_lines
       SET actual_weight_kg = v_actual_weight,
           final_line_total = greatest(round(unit_selling_price * v_actual_weight, 2) - discount_amount, 0),
           final_supplier_cost = CASE
             WHEN unit_cost_price IS NULL THEN NULL
             ELSE round(unit_cost_price * v_actual_weight, 2)
           END,
           finalised_at = now(),
           line_total = greatest(round(unit_selling_price * v_actual_weight, 2) - discount_amount, 0)
     WHERE id = v_line.id;
  END LOOP;

  -- Recompute only complete procurement components. Missing sibling weights
  -- remain valid outstanding operational work and never block this RPC.
  FOR v_component IN
    SELECT c.*
      FROM public.sales_order_line_components c
      JOIN public.sales_order_lines l ON l.id = c.sales_order_line_id
     WHERE l.sales_order_id = p_sales_order_id
       AND c.ordering_mode IN ('weight_only', 'slice', 'whole_fish_by_weight')
       AND (
         (c.ordering_mode = 'whole_fish_by_weight' AND EXISTS (
           SELECT 1
             FROM public.sales_order_line_component_units u
            WHERE u.sales_order_line_component_id = c.id
           HAVING count(*) > 0 AND count(u.actual_weight_kg) = count(*)
         ))
         OR (c.ordering_mode <> 'whole_fish_by_weight' AND c.actual_weight_kg IS NOT NULL)
       )
     FOR UPDATE OF c
  LOOP
    IF v_component.ordering_mode = 'whole_fish_by_weight' THEN
      SELECT sum(actual_weight_kg)
        INTO v_actual_weight
        FROM public.sales_order_line_component_units
       WHERE sales_order_line_component_id = v_component.id;
    ELSE
      v_actual_weight := v_component.actual_weight_kg;
    END IF;

    UPDATE public.sales_order_line_components
       SET actual_weight_kg = v_actual_weight,
           final_supplier_cost = round(unit_cost_price * v_actual_weight, 2),
           finalised_at = now()
     WHERE id = v_component.id;
  END LOOP;

  UPDATE public.sales_order_lines l
     SET final_supplier_cost = component_costs.total_cost
    FROM (
      SELECT c.sales_order_line_id, sum(c.final_supplier_cost) AS total_cost
        FROM public.sales_order_line_components c
       GROUP BY c.sales_order_line_id
      HAVING count(*) = count(c.final_supplier_cost)
    ) component_costs
   WHERE l.id = component_costs.sales_order_line_id
     AND l.sales_order_id = p_sales_order_id
     AND l.item_kind = 'combo';

  SELECT COALESCE(sum(line_total), 0)
    INTO v_subtotal
    FROM public.sales_order_lines
   WHERE sales_order_id = p_sales_order_id;
  v_final_total := v_subtotal + v_order.delivery_fee - v_order.discount_amount;

  UPDATE public.sales_orders
     SET final_subtotal = v_subtotal,
         final_total = v_final_total,
         subtotal = v_subtotal,
         total = v_final_total
   WHERE id = p_sales_order_id;

  IF v_previous_final_total IS DISTINCT FROM v_final_total THEN
    INSERT INTO public.sales_order_events (sales_order_id, event_type, actor_id, payload)
    VALUES (
      p_sales_order_id, 'final_amount_updated', auth.uid(),
      jsonb_build_object(
        'order_number', v_order.order_number,
        'previous_final_total', v_previous_final_total,
        'final_total', v_final_total
      )
    );

    IF v_order.customer_id IS NOT NULL THEN
      PERFORM public.emit_notification(
        v_order.customer_id, 'customer', 'final_amount_updated', p_sales_order_id,
        'sales_order', p_sales_order_id::text, 'Final order amount updated',
        'Your weighed order amount was updated. Please review the new amount before paying.',
        '/order/' || p_sales_order_id::text,
        jsonb_build_object(
          'order_number', v_order.order_number,
          'previous_final_total', v_previous_final_total,
          'final_total', v_final_total
        ),
        'final_amount_updated:' || p_sales_order_id::text || ':' || gen_random_uuid()::text
      );
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.phase4c6_finalize_if_measurements_complete(p_sales_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_order public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order
    FROM public.sales_orders
   WHERE id = p_sales_order_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;

  IF v_order.price_status = 'final' THEN
    PERFORM public.reprice_final_sales_order_after_weight_correction(p_sales_order_id);
    RETURN;
  END IF;

  -- Only missing measurements on standalone lines with variable customer
  -- prices keep the order estimated. Combo component weights are cost-only.
  IF EXISTS (
    SELECT 1
      FROM public.sales_order_lines l
     WHERE l.sales_order_id = p_sales_order_id
       AND l.item_kind = 'product'
       AND l.final_line_total IS NULL
       AND (
         (l.ordering_mode = 'whole_fish_by_weight' AND (
           NOT EXISTS (
             SELECT 1 FROM public.sales_order_line_units u
              WHERE u.sales_order_line_id = l.id
           )
           OR EXISTS (
             SELECT 1 FROM public.sales_order_line_units u
              WHERE u.sales_order_line_id = l.id
                AND u.actual_weight_kg IS NULL
           )
         ))
         OR (l.ordering_mode <> 'whole_fish_by_weight' AND l.actual_weight_kg IS NULL)
       )
  ) THEN
    RETURN;
  END IF;

  PERFORM public.finalize_sales_order_pricing(p_sales_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.phase4c6_finalize_if_measurements_complete(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reprice_final_sales_order_after_weight_correction(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_sales_order_pricing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_sales_order_pricing(uuid) TO authenticated;

COMMIT;
