-- Gate 3 follow-up: preserve the already-released email foundation while
-- adding the missing customer-facing ready-for-delivery event.
BEGIN;

CREATE OR REPLACE FUNCTION public.notification_after_delivery_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.sales_orders WHERE id = NEW.sales_order_id;
  IF (TG_OP = 'INSERT' OR OLD.assigned_rider_id IS DISTINCT FROM NEW.assigned_rider_id) AND NEW.assigned_rider_id IS NOT NULL THEN
    PERFORM public.emit_notification(NEW.assigned_rider_id, 'delivery_rider', 'delivery_assigned', NEW.sales_order_id,
      'sales_order', NEW.sales_order_id::text, 'New delivery assigned', 'A FreshGo order has been assigned to you.', '/delivery',
      jsonb_build_object('order_number', o.order_number), 'delivery_assigned:' || NEW.sales_order_id::text || ':' || NEW.assigned_rider_id::text);
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status = 'ready_for_rider' AND o.customer_id IS NOT NULL THEN
    PERFORM public.emit_notification(o.customer_id, 'customer', 'ready_for_delivery', o.id, 'sales_order', o.id::text,
      'Order ready for delivery', 'Your order is prepared and will be handed to your rider soon.', '/order/' || o.id::text,
      jsonb_build_object('order_number', o.order_number), 'ready_for_delivery:' || o.id::text || ':' || o.customer_id::text);
  END IF;
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'out_for_delivery' AND NEW.status = 'out_for_delivery') AND o.customer_id IS NOT NULL THEN
    PERFORM public.emit_notification(o.customer_id, 'customer', 'out_for_delivery', o.id, 'sales_order', o.id::text,
      'Order out for delivery', 'Your order is out for delivery.', '/order/' || o.id::text,
      jsonb_build_object('order_number', o.order_number), 'out_for_delivery:' || o.id::text || ':' || o.customer_id::text);
  END IF;
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'delivered' AND NEW.status = 'delivered') THEN
    IF o.customer_id IS NOT NULL THEN
      PERFORM public.emit_notification(o.customer_id, 'customer', 'order_delivered', o.id, 'sales_order', o.id::text,
        'Order delivered', 'Your order has been delivered. Thank you for choosing FreshGo.', '/order/' || o.id::text,
        jsonb_build_object('order_number', o.order_number), 'order_delivered:' || o.id::text || ':' || o.customer_id::text);
    END IF;
    PERFORM public.emit_order_notification_to_admins('order_delivered', o.id, 'Order delivered',
      'A rider has completed delivery with proof of delivery.', '/admin', jsonb_build_object('order_number', o.order_number), 'delivered');
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enqueue_transactional_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF COALESCE(NEW.dedupe_key, '') NOT LIKE 'legacy-write:%'
     AND NEW.recipient_role = 'customer'
     AND NEW.recipient_user_id IS NOT NULL
     AND NEW.notification_type IN (
       'order_payment_submitted', 'price_finalised', 'payment_confirmed',
       'payment_receipt_rejected', 'ready_for_delivery', 'order_cancelled',
       'out_for_delivery', 'order_delivered'
     ) THEN
    INSERT INTO public.transactional_email_jobs (notification_id, recipient_user_id)
    VALUES (NEW.id, NEW.recipient_user_id)
    ON CONFLICT (notification_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
COMMIT;
