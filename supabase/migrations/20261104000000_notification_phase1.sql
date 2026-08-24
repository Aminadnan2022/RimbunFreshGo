-- FreshGo Notification Phase 1
-- Central, transaction-bound in-app notifications for canonical order workflows.
BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id text,
  ADD COLUMN IF NOT EXISTS action_url text,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

UPDATE public.notifications
SET dedupe_key = COALESCE(
  dedupe_key,
  'legacy:' || id::text
)
WHERE dedupe_key IS NULL;

ALTER TABLE public.notifications
  ALTER COLUMN dedupe_key SET NOT NULL;
ALTER TABLE public.notifications
  ALTER COLUMN dedupe_key SET DEFAULT ('legacy-write:' || gen_random_uuid()::text);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_unique
  ON public.notifications (dedupe_key);
CREATE INDEX IF NOT EXISTS notifications_unread_recipient_idx
  ON public.notifications (recipient_user_id, read_at, created_at DESC);

-- All Phase 1 rows are fan-out rows for a concrete user.  Role routing is
-- resolved here, rather than exposing a shared role notification to every user.
CREATE OR REPLACE FUNCTION public.emit_notification(
  p_recipient_user_id uuid,
  p_recipient_role text,
  p_event_type text,
  p_sales_order_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT 'sales_order',
  p_entity_id text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_action_url text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_dedupe_key text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_recipient_user_id IS NULL OR p_dedupe_key IS NULL THEN
    RAISE EXCEPTION 'Notification recipient and dedupe key are required.';
  END IF;
  INSERT INTO public.notifications (
    recipient_user_id, recipient_role, sales_order_id, notification_type,
    entity_type, entity_id, title, message, action_url, payload, dedupe_key
  ) VALUES (
    p_recipient_user_id, p_recipient_role, p_sales_order_id, p_event_type,
    p_entity_type, p_entity_id, p_title, p_message, p_action_url,
    COALESCE(p_payload, '{}'::jsonb), p_dedupe_key
  ) ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.emit_order_notification_to_admins(
  p_event_type text, p_sales_order_id uuid, p_title text, p_message text,
  p_action_url text, p_payload jsonb DEFAULT '{}'::jsonb, p_key_suffix text DEFAULT ''
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.user_roles WHERE role = 'admin' LOOP
    PERFORM public.emit_notification(r.id, 'admin', p_event_type, p_sales_order_id,
      'sales_order', p_sales_order_id::text, p_title, p_message, p_action_url,
      p_payload, p_event_type || ':' || p_sales_order_id::text || ':' || r.id::text || ':' || p_key_suffix);
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.emit_order_notification_to_suppliers(
  p_event_type text, p_sales_order_id uuid, p_title text, p_message text,
  p_action_url text, p_payload jsonb DEFAULT '{}'::jsonb, p_key_suffix text DEFAULT ''
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT su.user_id
    FROM public.supplier_users su
    JOIN public.sales_order_lines l ON l.supplier_id = su.supplier_id
    WHERE l.sales_order_id = p_sales_order_id AND su.active
  LOOP
    PERFORM public.emit_notification(r.user_id, 'supplier', p_event_type, p_sales_order_id,
      'sales_order', p_sales_order_id::text, p_title, p_message, p_action_url,
      p_payload, p_event_type || ':' || p_sales_order_id::text || ':' || r.user_id::text || ':' || p_key_suffix);
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.notification_after_order_line_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.sales_orders WHERE id = NEW.sales_order_id;
  IF o.requires_supplier_finalisation AND o.status <> 'cancelled' THEN
    PERFORM public.emit_order_notification_to_suppliers(
      'order_requires_weighing', o.id, 'New order requires weighing',
      'A customer order needs weighing and finalisation before payment.', '/supplier',
      jsonb_build_object('order_number', o.order_number), 'supplier-action');
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notification_after_receipt_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.sales_orders WHERE id = NEW.sales_order_id;
  PERFORM public.emit_order_notification_to_admins(
    'payment_receipt_submitted', o.id, 'Payment receipt requires verification',
    'A customer payment receipt is ready for verification.', '/admin',
    jsonb_build_object('receipt_id', NEW.id, 'order_number', o.order_number), NEW.id::text);
  IF NOT o.requires_supplier_finalisation AND o.customer_id IS NOT NULL THEN
    PERFORM public.emit_notification(o.customer_id, 'customer', 'order_payment_submitted', o.id,
      'sales_order', o.id::text, 'Order received',
      'Your order and payment receipt were received and are awaiting verification.',
      '/order/' || o.id::text, jsonb_build_object('order_number', o.order_number),
      'order_payment_submitted:' || o.id::text || ':' || o.customer_id::text);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notification_after_sales_order_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  IF OLD.price_status IS DISTINCT FROM 'final' AND NEW.price_status = 'final'
     AND NEW.requires_supplier_finalisation AND NEW.customer_id IS NOT NULL THEN
    PERFORM public.emit_notification(NEW.customer_id, 'customer', 'price_finalised', NEW.id,
      'sales_order', NEW.id::text, 'Final amount ready for payment',
      'Your final order amount is ready. Please complete payment.', '/order/' || NEW.id::text,
      jsonb_build_object('order_number', NEW.order_number, 'final_total', NEW.final_total),
      'price_finalised:' || NEW.id::text || ':' || NEW.customer_id::text);
  END IF;
  IF OLD.payment_status IS DISTINCT FROM 'paid' AND NEW.payment_status = 'paid' THEN
    IF NEW.customer_id IS NOT NULL THEN
      PERFORM public.emit_notification(NEW.customer_id, 'customer', 'payment_confirmed', NEW.id,
        'sales_order', NEW.id::text, 'Payment confirmed', 'Your payment has been confirmed.',
        '/order/' || NEW.id::text, jsonb_build_object('order_number', NEW.order_number),
        'payment_confirmed:' || NEW.id::text || ':' || NEW.customer_id::text);
    END IF;
    PERFORM public.emit_order_notification_to_suppliers('order_paid_ready_to_prepare', NEW.id,
      'Paid order ready to prepare', 'Payment is confirmed. Preparation and packing may begin.',
      '/supplier', jsonb_build_object('order_number', NEW.order_number), 'paid');
  END IF;
  IF OLD.payment_status IS DISTINCT FROM 'rejected' AND NEW.payment_status = 'rejected'
     AND NEW.customer_id IS NOT NULL THEN
    PERFORM public.emit_notification(NEW.customer_id, 'customer', 'payment_receipt_rejected', NEW.id,
      'sales_order', NEW.id::text, 'Payment receipt needs attention',
      'Your payment receipt was rejected. Please upload a replacement receipt.', '/order/' || NEW.id::text,
      jsonb_build_object('order_number', NEW.order_number),
      'payment_receipt_rejected:' || NEW.id::text || ':' || NEW.customer_id::text || ':' || NEW.receipt_submitted_at::text);
  END IF;
  IF OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' THEN
    IF NEW.customer_id IS NOT NULL THEN
      PERFORM public.emit_notification(NEW.customer_id, 'customer', 'order_cancelled', NEW.id,
        'sales_order', NEW.id::text, 'Order cancelled', 'Your order has been cancelled.', '/order/' || NEW.id::text,
        jsonb_build_object('order_number', NEW.order_number, 'reason', NEW.source_payload ->> 'cancellation_reason'),
        'order_cancelled:' || NEW.id::text || ':' || NEW.customer_id::text);
    END IF;
    PERFORM public.emit_order_notification_to_admins('order_cancelled', NEW.id, 'Order cancelled',
      'A customer order was cancelled and may need operational follow-up.', '/admin',
      jsonb_build_object('order_number', NEW.order_number), 'ops');
    PERFORM public.emit_order_notification_to_suppliers('order_cancelled', NEW.id, 'Order cancelled',
      'An assigned order was cancelled.', '/supplier', jsonb_build_object('order_number', NEW.order_number), 'ops');
    FOR r IN SELECT assigned_rider_id FROM public.canonical_sales_order_deliveries WHERE sales_order_id = NEW.id AND assigned_rider_id IS NOT NULL LOOP
      PERFORM public.emit_notification(r.assigned_rider_id, 'delivery_rider', 'order_cancelled', NEW.id,
        'sales_order', NEW.id::text, 'Order cancelled', 'An assigned delivery order was cancelled.', '/delivery',
        jsonb_build_object('order_number', NEW.order_number), 'order_cancelled:' || NEW.id::text || ':' || r.assigned_rider_id::text);
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notification_after_fulfilment_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o public.sales_orders%ROWTYPE;
BEGIN
  IF OLD.status IS DISTINCT FROM 'packed' AND NEW.status = 'packed'
    AND NOT EXISTS (SELECT 1 FROM public.sales_order_supplier_fulfilments f WHERE f.sales_order_id = NEW.sales_order_id AND f.status <> 'packed') THEN
    SELECT * INTO o FROM public.sales_orders WHERE id = NEW.sales_order_id;
    PERFORM public.emit_order_notification_to_admins('order_ready_for_dispatch', o.id,
      'Order ready for dispatch', 'Supplier preparation is complete. Add the order to a supplier-to-hub batch.',
      '/admin', jsonb_build_object('order_number', o.order_number), 'packed');
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notification_after_supplier_batch_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  IF OLD.status IS DISTINCT FROM 'dispatched' AND NEW.status = 'dispatched' THEN
    FOR r IN SELECT o.id, o.customer_id, o.order_number FROM public.canonical_supplier_delivery_batch_orders bo JOIN public.sales_orders o ON o.id = bo.sales_order_id WHERE bo.batch_id = NEW.id AND o.customer_id IS NOT NULL LOOP
      PERFORM public.emit_notification(r.customer_id, 'customer', 'supplier_batch_dispatched', r.id,
        'supplier_batch', NEW.id::text, 'Order on the way to FreshGo Hub',
        'Your order has left Pasar Tani Putrajaya and is on the way to FreshGo Hub.', '/order/' || r.id::text,
        jsonb_build_object('order_number', r.order_number, 'batch_id', NEW.id),
        'supplier_batch_dispatched:' || NEW.id::text || ':' || r.id::text || ':' || r.customer_id::text);
    END LOOP;
    PERFORM public.emit_order_notification_to_admins('supplier_batch_dispatched', NULL,
      'Supplier batch on the way', 'A supplier delivery batch is on the way to FreshGo Hub.', '/admin',
      jsonb_build_object('batch_id', NEW.id), NEW.id::text);
  END IF;
  IF OLD.status IS DISTINCT FROM 'arrived_hub' AND NEW.status = 'arrived_hub' THEN
    FOR r IN SELECT o.id, o.customer_id, o.order_number FROM public.canonical_supplier_delivery_batch_orders bo JOIN public.sales_orders o ON o.id = bo.sales_order_id WHERE bo.batch_id = NEW.id AND o.customer_id IS NOT NULL LOOP
      PERFORM public.emit_notification(r.customer_id, 'customer', 'supplier_batch_arrived_hub', r.id,
        'supplier_batch', NEW.id::text, 'Order arrived at FreshGo Hub',
        'Your order has arrived at FreshGo Hub and is being prepared for final delivery.', '/order/' || r.id::text,
        jsonb_build_object('order_number', r.order_number, 'batch_id', NEW.id),
        'supplier_batch_arrived_hub:' || NEW.id::text || ':' || r.id::text || ':' || r.customer_id::text);
    END LOOP;
    PERFORM public.emit_order_notification_to_admins('supplier_batch_arrived_hub', NULL,
      'Supplier batch arrived at hub', 'Orders in this batch are ready for last-mile assignment.', '/admin',
      jsonb_build_object('batch_id', NEW.id), NEW.id::text);
  END IF;
  RETURN NEW;
END; $$;

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

DROP TRIGGER IF EXISTS trg_notification_order_line_insert ON public.sales_order_lines;
CREATE TRIGGER trg_notification_order_line_insert AFTER INSERT ON public.sales_order_lines FOR EACH ROW EXECUTE FUNCTION public.notification_after_order_line_insert();
DROP TRIGGER IF EXISTS trg_notification_receipt_insert ON public.sales_order_payment_receipts;
CREATE TRIGGER trg_notification_receipt_insert AFTER INSERT ON public.sales_order_payment_receipts FOR EACH ROW EXECUTE FUNCTION public.notification_after_receipt_insert();
DROP TRIGGER IF EXISTS trg_notification_sales_order_update ON public.sales_orders;
CREATE TRIGGER trg_notification_sales_order_update AFTER UPDATE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.notification_after_sales_order_update();
DROP TRIGGER IF EXISTS trg_notification_fulfilment_update ON public.sales_order_supplier_fulfilments;
CREATE TRIGGER trg_notification_fulfilment_update AFTER UPDATE ON public.sales_order_supplier_fulfilments FOR EACH ROW EXECUTE FUNCTION public.notification_after_fulfilment_update();
DROP TRIGGER IF EXISTS trg_notification_supplier_batch_update ON public.canonical_supplier_delivery_batches;
CREATE TRIGGER trg_notification_supplier_batch_update AFTER UPDATE ON public.canonical_supplier_delivery_batches FOR EACH ROW EXECUTE FUNCTION public.notification_after_supplier_batch_update();
DROP TRIGGER IF EXISTS trg_notification_delivery_change ON public.canonical_sales_order_deliveries;
CREATE TRIGGER trg_notification_delivery_change AFTER INSERT OR UPDATE ON public.canonical_sales_order_deliveries FOR EACH ROW EXECUTE FUNCTION public.notification_after_delivery_change();

-- Readers see only their own fan-out rows.  The update guard limits direct
-- client mutation to marking that row read/unread.
DROP POLICY IF EXISTS phase4a_notifications_recipient_select ON public.notifications;
CREATE POLICY notifications_recipient_select ON public.notifications FOR SELECT TO authenticated USING (recipient_user_id = auth.uid());
CREATE POLICY notifications_recipient_mark_read ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid()) WITH CHECK (recipient_user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.notification_prevent_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.recipient_user_id = auth.uid()
     AND (to_jsonb(NEW) - 'read_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'read_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Notifications may only be marked read by their recipient.' USING ERRCODE = '42501';
END; $$;
DROP TRIGGER IF EXISTS trg_notification_prevent_mutation ON public.notifications;
CREATE TRIGGER trg_notification_prevent_mutation BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notification_prevent_mutation();

-- Earlier canonical RPC definitions still insert a small set of legacy rows.
-- Their authoritative table transition is already handled above, so discard
-- only those fallback rows to keep the visible inbox deduplicated while the
-- migration remains backward compatible with every existing RPC signature.
CREATE OR REPLACE FUNCTION public.notification_discard_legacy_fallback()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.dedupe_key LIKE 'legacy-write:%'
     AND NEW.notification_type IN ('price_finalised', 'payment_receipt_submitted', 'payment_receipt_rejected', 'payment_confirmed') THEN
    DELETE FROM public.notifications WHERE id = NEW.id;
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_notification_discard_legacy_fallback ON public.notifications;
CREATE TRIGGER trg_notification_discard_legacy_fallback
AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notification_discard_legacy_fallback();

REVOKE ALL ON FUNCTION public.emit_notification(uuid, text, text, uuid, text, text, text, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.emit_order_notification_to_admins(text, uuid, text, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.emit_order_notification_to_suppliers(text, uuid, text, text, text, jsonb, text) FROM PUBLIC;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;

COMMIT;
