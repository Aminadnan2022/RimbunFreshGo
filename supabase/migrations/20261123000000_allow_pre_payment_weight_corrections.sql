-- Permit supplier weight corrections only before a payment receipt is under
-- review or accepted.  Final checkout prices remain frozen; this migration
-- only recomputes totals from those immutable snapshots and actual weights.
BEGIN;

-- The append-only guard gains one deliberately narrow operation for correcting
-- a final-but-unpaid canonical order.  It does not permit price snapshot,
-- payment, catalog, or version changes.
CREATE OR REPLACE FUNCTION public.phase1_prevent_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation text := current_setting('freshgo.canonical_operation', true);
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Order snapshots are append-only. DELETE is never allowed.';
  END IF;

  IF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'order_creation'
     AND (to_jsonb(NEW) - ARRAY['requires_supplier_finalisation', 'price_status',
       'estimated_subtotal', 'estimated_total', 'final_subtotal', 'final_total',
       'price_finalised_at', 'subtotal', 'total'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['requires_supplier_finalisation', 'price_status',
       'estimated_subtotal', 'estimated_total', 'final_subtotal', 'final_total',
       'price_finalised_at', 'subtotal', 'total']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'price_finalisation'
     AND (to_jsonb(NEW) - ARRAY['price_status', 'final_subtotal', 'final_total',
       'subtotal', 'total', 'price_finalised_at', 'price_finalised_by'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['price_status', 'final_subtotal', 'final_total',
       'subtotal', 'total', 'price_finalised_at', 'price_finalised_by']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'price_correction'
     AND (to_jsonb(NEW) - ARRAY['final_subtotal', 'final_total', 'subtotal', 'total'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['final_subtotal', 'final_total', 'subtotal', 'total']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'receipt_submission'
     AND (to_jsonb(NEW) - ARRAY['payment_status', 'receipt_submitted_at'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['payment_status', 'receipt_submitted_at']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'payment_rejection'
     AND (to_jsonb(NEW) - ARRAY['payment_status'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['payment_status']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'payment_confirmation'
     AND (to_jsonb(NEW) - ARRAY['payment_status', 'paid_at', 'paid_by'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['payment_status', 'paid_at', 'paid_by']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_order_lines' AND v_operation = 'order_creation'
     AND (to_jsonb(NEW) - ARRAY['final_supplier_cost'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['final_supplier_cost']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_order_lines' AND v_operation IN ('price_finalisation', 'price_correction')
     AND (to_jsonb(NEW) - ARRAY['actual_weight_kg', 'final_line_total',
       'final_supplier_cost', 'finalised_at', 'line_total'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['actual_weight_kg', 'final_line_total',
       'final_supplier_cost', 'finalised_at', 'line_total']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_order_line_units' AND v_operation IN ('price_finalisation', 'price_correction')
     AND (to_jsonb(NEW) - ARRAY['actual_weight_kg'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['actual_weight_kg']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_order_line_components' AND v_operation IN ('price_finalisation', 'price_correction')
     AND (to_jsonb(NEW) - ARRAY['actual_weight_kg', 'final_supplier_cost', 'finalised_at'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['actual_weight_kg', 'final_supplier_cost', 'finalised_at']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_order_line_component_units' AND v_operation IN ('price_finalisation', 'price_correction')
     AND (to_jsonb(NEW) - ARRAY['actual_weight_kg'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['actual_weight_kg']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Unexpected or unauthorized canonical mutation.';
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

  FOR v_line IN
    SELECT * FROM public.sales_order_lines
    WHERE sales_order_id = p_sales_order_id
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
      IF v_actual_weight IS NULL THEN RAISE EXCEPTION 'Line %: missing actual weight.', v_line.line_number; END IF;
    END IF;

    UPDATE public.sales_order_lines
       SET actual_weight_kg = v_actual_weight,
           final_line_total = greatest(round(unit_selling_price * v_actual_weight, 2) - discount_amount, 0),
           final_supplier_cost = CASE WHEN unit_cost_price IS NULL THEN NULL ELSE round(unit_cost_price * v_actual_weight, 2) END,
           finalised_at = now(),
           line_total = greatest(round(unit_selling_price * v_actual_weight, 2) - discount_amount, 0)
     WHERE id = v_line.id;
  END LOOP;

  FOR v_component IN
    SELECT c.*
    FROM public.sales_order_line_components c
    JOIN public.sales_order_lines l ON l.id = c.sales_order_line_id
    WHERE l.sales_order_id = p_sales_order_id
      AND c.ordering_mode IN ('weight_only', 'slice', 'whole_fish_by_weight')
    FOR UPDATE OF c
  LOOP
    IF v_component.ordering_mode = 'whole_fish_by_weight' THEN
      SELECT count(*), count(actual_weight_kg), sum(actual_weight_kg)
        INTO v_unit_count, v_unit_present, v_actual_weight
      FROM public.sales_order_line_component_units
      WHERE sales_order_line_component_id = v_component.id;
      IF v_unit_count = 0 OR v_unit_present < v_unit_count THEN
        RAISE EXCEPTION 'Component %: missing actual weight for one or more physical units.', v_component.component_number;
      END IF;
    ELSE
      v_actual_weight := v_component.actual_weight_kg;
      IF v_actual_weight IS NULL THEN RAISE EXCEPTION 'Component %: missing actual weight.', v_component.component_number; END IF;
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
      SELECT c.sales_order_line_id, COALESCE(sum(c.final_supplier_cost), 0) AS total_cost
      FROM public.sales_order_line_components c
      GROUP BY c.sales_order_line_id
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

-- The pre-existing helper keeps initial finalisation unchanged, but delegates
-- to the correction path once the order has already reached final pricing.
CREATE OR REPLACE FUNCTION public.phase4c6_finalize_if_measurements_complete(p_sales_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_order public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sales_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_order.price_status = 'final' THEN
    PERFORM public.reprice_final_sales_order_after_weight_correction(p_sales_order_id);
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.sales_order_lines l
    WHERE l.sales_order_id = p_sales_order_id AND l.final_line_total IS NULL
      AND ((l.ordering_mode = 'whole_fish_by_weight' AND EXISTS (
        SELECT 1 FROM public.sales_order_line_units u WHERE u.sales_order_line_id = l.id AND u.actual_weight_kg IS NULL
      )) OR (l.ordering_mode <> 'whole_fish_by_weight' AND l.actual_weight_kg IS NULL))
  ) OR EXISTS (
    SELECT 1 FROM public.sales_order_line_components c
    JOIN public.sales_order_lines l ON l.id = c.sales_order_line_id
    WHERE l.sales_order_id = p_sales_order_id AND c.final_supplier_cost IS NULL
      AND ((c.ordering_mode = 'whole_fish_by_weight' AND EXISTS (
        SELECT 1 FROM public.sales_order_line_component_units u WHERE u.sales_order_line_component_id = c.id AND u.actual_weight_kg IS NULL
      )) OR (c.ordering_mode <> 'whole_fish_by_weight' AND c.actual_weight_kg IS NULL))
  ) THEN RETURN; END IF;
  PERFORM public.finalize_sales_order_pricing(p_sales_order_id);
END;
$$;

-- Every recording RPC locks the parent order before its line/component.  That
-- makes the payment-state decision and any subsequent repricing serial.
CREATE OR REPLACE FUNCTION public.record_sales_order_line_actual_weight(p_sales_order_line_id uuid, p_actual_weight_kg numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order public.sales_orders%ROWTYPE; v_line public.sales_order_lines%ROWTYPE;
BEGIN
  SELECT o.* INTO v_order FROM public.sales_orders o JOIN public.sales_order_lines l ON l.sales_order_id = o.id WHERE l.id = p_sales_order_line_id FOR UPDATE OF o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order line not found.'; END IF;
  SELECT * INTO v_line FROM public.sales_order_lines WHERE id = p_sales_order_line_id FOR UPDATE;
  IF NOT (public.is_admin() OR public.is_supplier_for_sales_order_line(v_line.id)) THEN RAISE EXCEPTION 'Not authorized for this order line.'; END IF;
  IF v_line.ordering_mode NOT IN ('weight_only', 'slice') THEN RAISE EXCEPTION 'Actual weight entry only applies to weight_only/slice lines.'; END IF;
  IF p_actual_weight_kg IS NULL OR p_actual_weight_kg < 0 THEN RAISE EXCEPTION 'Invalid actual weight.'; END IF;
  IF v_order.payment_status = 'receipt_submitted' THEN RAISE EXCEPTION 'Weight entry is locked while a payment receipt is under review.'; END IF;
  IF v_order.payment_status = 'paid' THEN RAISE EXCEPTION 'Weight entry is locked because the order has been paid.'; END IF;
  IF v_order.payment_status NOT IN ('pending', 'rejected') THEN RAISE EXCEPTION 'Weight entry is not currently allowed.'; END IF;
  IF v_line.actual_weight_kg IS NOT DISTINCT FROM p_actual_weight_kg THEN RETURN; END IF;
  PERFORM set_config('freshgo.canonical_operation', CASE WHEN v_order.price_status = 'final' THEN 'price_correction' ELSE 'price_finalisation' END, true);
  UPDATE public.sales_order_lines SET actual_weight_kg = p_actual_weight_kg WHERE id = v_line.id;
  PERFORM public.phase4c6_finalize_if_measurements_complete(v_order.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_sales_order_line_unit_actual_weight(p_sales_order_line_unit_id uuid, p_actual_weight_kg numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order public.sales_orders%ROWTYPE; v_line public.sales_order_lines%ROWTYPE; v_unit public.sales_order_line_units%ROWTYPE;
BEGIN
  SELECT o.* INTO v_order FROM public.sales_orders o JOIN public.sales_order_lines l ON l.sales_order_id = o.id JOIN public.sales_order_line_units u ON u.sales_order_line_id = l.id WHERE u.id = p_sales_order_line_unit_id FOR UPDATE OF o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order line unit not found.'; END IF;
  SELECT * INTO v_unit FROM public.sales_order_line_units WHERE id = p_sales_order_line_unit_id FOR UPDATE;
  SELECT * INTO v_line FROM public.sales_order_lines WHERE id = v_unit.sales_order_line_id FOR UPDATE;
  IF NOT (public.is_admin() OR public.is_supplier_for_sales_order_line(v_line.id)) THEN RAISE EXCEPTION 'Not authorized for this order line.'; END IF;
  IF v_line.ordering_mode <> 'whole_fish_by_weight' THEN RAISE EXCEPTION 'Actual unit weight is only allowed for whole_fish_by_weight lines.'; END IF;
  IF p_actual_weight_kg IS NULL OR p_actual_weight_kg < 0 THEN RAISE EXCEPTION 'Invalid actual weight.'; END IF;
  IF v_order.payment_status = 'receipt_submitted' THEN RAISE EXCEPTION 'Weight entry is locked while a payment receipt is under review.'; END IF;
  IF v_order.payment_status = 'paid' THEN RAISE EXCEPTION 'Weight entry is locked because the order has been paid.'; END IF;
  IF v_order.payment_status NOT IN ('pending', 'rejected') THEN RAISE EXCEPTION 'Weight entry is not currently allowed.'; END IF;
  IF v_unit.actual_weight_kg IS NOT DISTINCT FROM p_actual_weight_kg THEN RETURN; END IF;
  PERFORM set_config('freshgo.canonical_operation', CASE WHEN v_order.price_status = 'final' THEN 'price_correction' ELSE 'price_finalisation' END, true);
  UPDATE public.sales_order_line_units SET actual_weight_kg = p_actual_weight_kg WHERE id = v_unit.id;
  PERFORM public.phase4c6_finalize_if_measurements_complete(v_order.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_sales_order_line_component_actual_weight(p_sales_order_line_component_id uuid, p_actual_weight_kg numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order public.sales_orders%ROWTYPE; v_component public.sales_order_line_components%ROWTYPE;
BEGIN
  SELECT o.* INTO v_order FROM public.sales_orders o JOIN public.sales_order_lines l ON l.sales_order_id = o.id JOIN public.sales_order_line_components c ON c.sales_order_line_id = l.id WHERE c.id = p_sales_order_line_component_id FOR UPDATE OF o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Combo component not found.'; END IF;
  SELECT * INTO v_component FROM public.sales_order_line_components WHERE id = p_sales_order_line_component_id FOR UPDATE;
  IF NOT (public.is_admin() OR public.is_supplier_for_sales_order_line_component(v_component.id)) THEN RAISE EXCEPTION 'Not authorized for this combo component.'; END IF;
  IF v_component.ordering_mode NOT IN ('weight_only', 'slice') THEN RAISE EXCEPTION 'Actual weight entry only applies to weight_only/slice components.'; END IF;
  IF p_actual_weight_kg IS NULL OR p_actual_weight_kg < 0 THEN RAISE EXCEPTION 'Invalid actual weight.'; END IF;
  IF v_order.payment_status = 'receipt_submitted' THEN RAISE EXCEPTION 'Weight entry is locked while a payment receipt is under review.'; END IF;
  IF v_order.payment_status = 'paid' THEN RAISE EXCEPTION 'Weight entry is locked because the order has been paid.'; END IF;
  IF v_order.payment_status NOT IN ('pending', 'rejected') THEN RAISE EXCEPTION 'Weight entry is not currently allowed.'; END IF;
  IF v_component.actual_weight_kg IS NOT DISTINCT FROM p_actual_weight_kg THEN RETURN; END IF;
  PERFORM set_config('freshgo.canonical_operation', CASE WHEN v_order.price_status = 'final' THEN 'price_correction' ELSE 'price_finalisation' END, true);
  UPDATE public.sales_order_line_components SET actual_weight_kg = p_actual_weight_kg WHERE id = v_component.id;
  PERFORM public.phase4c6_finalize_if_measurements_complete(v_order.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_sales_order_line_component_unit_actual_weight(p_sales_order_line_component_unit_id uuid, p_actual_weight_kg numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_order public.sales_orders%ROWTYPE; v_component public.sales_order_line_components%ROWTYPE; v_unit public.sales_order_line_component_units%ROWTYPE;
BEGIN
  SELECT o.* INTO v_order FROM public.sales_orders o JOIN public.sales_order_lines l ON l.sales_order_id = o.id JOIN public.sales_order_line_components c ON c.sales_order_line_id = l.id JOIN public.sales_order_line_component_units u ON u.sales_order_line_component_id = c.id WHERE u.id = p_sales_order_line_component_unit_id FOR UPDATE OF o;
  IF NOT FOUND THEN RAISE EXCEPTION 'Combo component unit not found.'; END IF;
  SELECT * INTO v_unit FROM public.sales_order_line_component_units WHERE id = p_sales_order_line_component_unit_id FOR UPDATE;
  SELECT * INTO v_component FROM public.sales_order_line_components WHERE id = v_unit.sales_order_line_component_id FOR UPDATE;
  IF NOT (public.is_admin() OR public.is_supplier_for_sales_order_line_component(v_component.id)) THEN RAISE EXCEPTION 'Not authorized for this combo component.'; END IF;
  IF v_component.ordering_mode <> 'whole_fish_by_weight' THEN RAISE EXCEPTION 'Actual component unit weight is only allowed for whole_fish_by_weight components.'; END IF;
  IF p_actual_weight_kg IS NULL OR p_actual_weight_kg < 0 THEN RAISE EXCEPTION 'Invalid actual weight.'; END IF;
  IF v_order.payment_status = 'receipt_submitted' THEN RAISE EXCEPTION 'Weight entry is locked while a payment receipt is under review.'; END IF;
  IF v_order.payment_status = 'paid' THEN RAISE EXCEPTION 'Weight entry is locked because the order has been paid.'; END IF;
  IF v_order.payment_status NOT IN ('pending', 'rejected') THEN RAISE EXCEPTION 'Weight entry is not currently allowed.'; END IF;
  IF v_unit.actual_weight_kg IS NOT DISTINCT FROM p_actual_weight_kg THEN RETURN; END IF;
  PERFORM set_config('freshgo.canonical_operation', CASE WHEN v_order.price_status = 'final' THEN 'price_correction' ELSE 'price_finalisation' END, true);
  UPDATE public.sales_order_line_component_units SET actual_weight_kg = p_actual_weight_kg WHERE id = v_unit.id;
  PERFORM public.phase4c6_finalize_if_measurements_complete(v_order.id);
END;
$$;

-- Bind the amount shown to the customer to the exact final total they saw.
DROP FUNCTION IF EXISTS public.submit_sales_order_payment_receipt(uuid, text, text, text, integer);
CREATE FUNCTION public.submit_sales_order_payment_receipt(
  p_sales_order_id uuid, p_storage_path text, p_original_file_name text,
  p_mime_type text, p_file_size integer, p_expected_final_total numeric
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_receipt_id uuid; v_order public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.sales_orders
  WHERE id = p_sales_order_id AND customer_id = auth.uid() AND status <> 'cancelled'
    AND price_status = 'final' AND payment_status IN ('pending', 'rejected')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment receipt is not currently allowed.'; END IF;
  IF p_expected_final_total IS NULL OR round(p_expected_final_total, 2) <> round(v_order.final_total, 2) THEN
    RAISE EXCEPTION 'The final amount changed. Refresh the order and upload a receipt for the current amount.';
  END IF;
  IF p_storage_path NOT LIKE p_sales_order_id::text || '/%' THEN RAISE EXCEPTION 'Receipt path must belong to the order.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'sales-order-payment-receipts' AND name = p_storage_path) THEN
    RAISE EXCEPTION 'Receipt Storage object does not exist in the payment-receipts bucket.';
  END IF;
  PERFORM set_config('freshgo.canonical_operation', 'receipt_submission', true);
  INSERT INTO public.sales_order_payment_receipts (sales_order_id, storage_path, original_file_name, mime_type, file_size, uploaded_by)
  VALUES (p_sales_order_id, p_storage_path, p_original_file_name, p_mime_type, p_file_size, auth.uid()) RETURNING id INTO v_receipt_id;
  UPDATE public.sales_orders SET payment_status = 'receipt_submitted', receipt_submitted_at = now() WHERE id = p_sales_order_id;
  INSERT INTO public.sales_order_events (sales_order_id, event_type, actor_id, payload)
  VALUES (p_sales_order_id, 'payment_receipt_submitted', auth.uid(), jsonb_build_object('receipt_id', v_receipt_id));
  RETURN v_receipt_id;
END;
$$;

-- Customer delivery queues only receive a real amount-change event.  The
-- dedupe key is unique per successful correction; no-op saves never emit it.
CREATE OR REPLACE FUNCTION public.enqueue_web_push_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF COALESCE(NEW.dedupe_key, '') NOT LIKE 'legacy-write:%' AND NEW.recipient_user_id IS NOT NULL
     AND NEW.notification_type IN ('payment_receipt_submitted', 'order_requires_weighing', 'price_finalised', 'final_amount_updated', 'payment_confirmed', 'payment_receipt_rejected', 'order_paid_ready_to_prepare', 'order_ready_for_dispatch', 'delivery_assigned', 'out_for_delivery', 'order_cancelled') THEN
    INSERT INTO public.web_push_delivery_jobs (notification_id, subscription_id)
    SELECT NEW.id, s.id FROM public.push_subscriptions s WHERE s.user_id = NEW.recipient_user_id AND s.disabled_at IS NULL
    ON CONFLICT (notification_id, subscription_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_transactional_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF COALESCE(NEW.dedupe_key, '') NOT LIKE 'legacy-write:%'
     AND NEW.recipient_role = 'customer' AND NEW.recipient_user_id IS NOT NULL
     AND NEW.notification_type IN ('order_payment_submitted', 'price_finalised', 'final_amount_updated', 'payment_confirmed', 'payment_receipt_rejected', 'order_cancelled', 'out_for_delivery', 'order_delivered') THEN
    INSERT INTO public.transactional_email_jobs (notification_id, recipient_user_id)
    VALUES (NEW.id, NEW.recipient_user_id) ON CONFLICT (notification_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.get_transactional_email_projection(uuid);
CREATE FUNCTION public.get_transactional_email_projection(p_notification_id uuid)
RETURNS TABLE (
  notification_type text, order_number text, previous_final_total numeric, final_total numeric,
  currency_code text, payment_status text, delivery_date text, delivery_window text, delivery_area text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT n.notification_type, o.order_number,
    CASE WHEN n.notification_type = 'final_amount_updated' THEN (n.payload ->> 'previous_final_total')::numeric ELSE NULL END,
    CASE WHEN n.notification_type IN ('price_finalised', 'final_amount_updated', 'payment_confirmed') THEN o.final_total ELSE NULL END,
    CASE WHEN n.notification_type IN ('price_finalised', 'final_amount_updated', 'payment_confirmed') THEN o.currency_code ELSE NULL END,
    CASE WHEN n.notification_type IN ('order_payment_submitted', 'price_finalised', 'final_amount_updated', 'payment_confirmed', 'payment_receipt_rejected') THEN o.payment_status ELSE NULL END,
    CASE WHEN n.notification_type IN ('ready_for_delivery', 'out_for_delivery', 'order_delivered') THEN NULLIF(o.delivery_snapshot ->> 'requested_date', '') ELSE NULL END,
    CASE WHEN n.notification_type IN ('ready_for_delivery', 'out_for_delivery', 'order_delivered') THEN NULLIF(o.delivery_snapshot ->> 'requested_time', '') ELSE NULL END,
    CASE WHEN n.notification_type IN ('ready_for_delivery', 'out_for_delivery', 'order_delivered') THEN COALESCE(NULLIF(o.delivery_snapshot ->> 'delivery_point_name', ''), NULLIF(o.delivery_snapshot ->> 'zone_name', ''), NULLIF(o.delivery_snapshot ->> 'pickup_location', '')) ELSE NULL END
  FROM public.notifications n JOIN public.sales_orders o ON o.id = n.sales_order_id
  WHERE n.id = p_notification_id AND n.recipient_role = 'customer'
    AND n.recipient_user_id = o.customer_id
    AND n.notification_type IN ('order_payment_submitted', 'price_finalised', 'final_amount_updated', 'payment_confirmed', 'payment_receipt_rejected', 'ready_for_delivery', 'out_for_delivery', 'order_delivered', 'order_cancelled');
$$;

REVOKE ALL ON FUNCTION public.reprice_final_sales_order_after_weight_correction(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase4c6_finalize_if_measurements_complete(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_sales_order_payment_receipt(uuid, text, text, text, integer, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_transactional_email_projection(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sales_order_line_actual_weight(uuid, numeric), public.record_sales_order_line_unit_actual_weight(uuid, numeric), public.record_sales_order_line_component_actual_weight(uuid, numeric), public.record_sales_order_line_component_unit_actual_weight(uuid, numeric), public.submit_sales_order_payment_receipt(uuid, text, text, text, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transactional_email_projection(uuid) TO service_role;

COMMIT;
