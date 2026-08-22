-- Repair orders measured before automatic supplier finalisation was deployed.
-- Only records with every required actual measurement already present are
-- eligible; totals are recalculated exclusively from frozen checkout rates.

DO $$
DECLARE
  v_order_id uuid;
BEGIN
  PERFORM set_config('freshgo.canonical_operation', 'price_finalisation', true);

  UPDATE public.sales_order_lines l
     SET actual_weight_kg = measured.total_weight,
         final_line_total = greatest(round(l.unit_selling_price * measured.total_weight, 2) - l.discount_amount, 0),
         final_supplier_cost = CASE WHEN l.unit_cost_price IS NULL THEN NULL ELSE round(l.unit_cost_price * measured.total_weight, 2) END,
         finalised_at = now(),
         line_total = greatest(round(l.unit_selling_price * measured.total_weight, 2) - l.discount_amount, 0)
    FROM (
      SELECT u.sales_order_line_id, sum(u.actual_weight_kg) AS total_weight
        FROM public.sales_order_line_units u
       GROUP BY u.sales_order_line_id
      HAVING count(*) > 0 AND count(u.actual_weight_kg) = count(*)
    ) measured
   WHERE l.id = measured.sales_order_line_id
     AND l.ordering_mode = 'whole_fish_by_weight'
     AND l.final_line_total IS NULL;

  UPDATE public.sales_order_lines l
     SET final_line_total = greatest(round(l.unit_selling_price * l.actual_weight_kg, 2) - l.discount_amount, 0),
         final_supplier_cost = CASE WHEN l.unit_cost_price IS NULL THEN NULL ELSE round(l.unit_cost_price * l.actual_weight_kg, 2) END,
         finalised_at = now(),
         line_total = greatest(round(l.unit_selling_price * l.actual_weight_kg, 2) - l.discount_amount, 0)
   WHERE l.ordering_mode IN ('weight_only', 'slice')
     AND l.actual_weight_kg IS NOT NULL
     AND l.final_line_total IS NULL;

  UPDATE public.sales_order_line_components c
     SET actual_weight_kg = measured.total_weight,
         final_supplier_cost = round(c.unit_cost_price * measured.total_weight, 2),
         finalised_at = now()
    FROM (
      SELECT u.sales_order_line_component_id, sum(u.actual_weight_kg) AS total_weight
        FROM public.sales_order_line_component_units u
       GROUP BY u.sales_order_line_component_id
      HAVING count(*) > 0 AND count(u.actual_weight_kg) = count(*)
    ) measured
   WHERE c.id = measured.sales_order_line_component_id
     AND c.ordering_mode = 'whole_fish_by_weight'
     AND c.final_supplier_cost IS NULL;

  UPDATE public.sales_order_line_components c
     SET final_supplier_cost = round(c.unit_cost_price * c.actual_weight_kg, 2), finalised_at = now()
   WHERE c.ordering_mode IN ('weight_only', 'slice')
     AND c.actual_weight_kg IS NOT NULL
     AND c.final_supplier_cost IS NULL;

  UPDATE public.sales_order_lines l
     SET final_supplier_cost = component_cost.total_cost
    FROM (
      SELECT sales_order_line_id, sum(final_supplier_cost) AS total_cost
        FROM public.sales_order_line_components
       GROUP BY sales_order_line_id
      HAVING count(*) = count(final_supplier_cost)
    ) component_cost
   WHERE l.id = component_cost.sales_order_line_id
     AND l.item_kind = 'combo'
     AND l.final_supplier_cost IS NULL;

  FOR v_order_id IN
    WITH completed AS (
      SELECT o.id, sum(l.line_total) AS subtotal
        FROM public.sales_orders o
        JOIN public.sales_order_lines l ON l.sales_order_id = o.id
       WHERE o.price_status = 'estimated'
         AND o.requires_supplier_finalisation
       GROUP BY o.id
      HAVING count(*) = count(l.final_line_total)
         AND NOT EXISTS (
           SELECT 1 FROM public.sales_order_line_components c
           JOIN public.sales_order_lines component_line ON component_line.id = c.sales_order_line_id
           WHERE component_line.sales_order_id = o.id AND c.final_supplier_cost IS NULL
         )
    )
    UPDATE public.sales_orders o
       SET price_status = 'final', final_subtotal = completed.subtotal,
           final_total = completed.subtotal + o.delivery_fee - o.discount_amount,
           subtotal = completed.subtotal, total = completed.subtotal + o.delivery_fee - o.discount_amount,
           price_finalised_at = now()
      FROM completed
     WHERE o.id = completed.id
    RETURNING o.id
  LOOP
    INSERT INTO public.sales_order_events (sales_order_id, event_type, payload)
    SELECT id, 'price_finalised', jsonb_build_object('source', 'measurement_backfill', 'final_total', final_total)
      FROM public.sales_orders WHERE id = v_order_id;
    INSERT INTO public.notifications (recipient_user_id, recipient_role, sales_order_id, notification_type, title, message, payload)
    SELECT customer_id, 'customer', id, 'price_finalised', 'Final order price ready',
           'Your final order price is ready. Please complete payment.', jsonb_build_object('final_total', final_total)
      FROM public.sales_orders WHERE id = v_order_id AND customer_id IS NOT NULL;
  END LOOP;
END;
$$;
