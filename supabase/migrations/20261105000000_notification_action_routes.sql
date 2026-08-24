-- Route every Phase 1 notification to the appropriate operational action.
BEGIN;

-- The existing recipient-only guard deliberately blocks all direct mutation.
-- A migration is the controlled exception for backfilling action routes.
ALTER TABLE public.notifications DISABLE TRIGGER trg_notification_prevent_mutation;

UPDATE public.notifications
SET action_url = CASE notification_type
  WHEN 'payment_receipt_submitted' THEN '/admin?tab=orders#payment-verification'
  WHEN 'order_requires_weighing' THEN '/supplier'
  WHEN 'order_paid_ready_to_prepare' THEN '/supplier'
  WHEN 'order_ready_for_dispatch' THEN '/admin?tab=batches'
  WHEN 'supplier_batch_dispatched' THEN CASE WHEN recipient_role = 'customer' THEN '/order/' || sales_order_id::text ELSE '/admin?tab=batches' END
  WHEN 'supplier_batch_arrived_hub' THEN CASE WHEN recipient_role = 'customer' THEN '/order/' || sales_order_id::text ELSE '/admin?tab=batches' END
  WHEN 'delivery_assigned' THEN '/delivery'
  WHEN 'order_cancelled' THEN CASE WHEN recipient_role = 'customer' THEN '/order/' || sales_order_id::text WHEN recipient_role = 'supplier' THEN '/supplier' WHEN recipient_role = 'delivery_rider' THEN '/delivery' ELSE '/admin?tab=orders' END
  ELSE CASE WHEN sales_order_id IS NOT NULL THEN '/order/' || sales_order_id::text ELSE action_url END
END
WHERE notification_type IN (
  'payment_receipt_submitted', 'order_requires_weighing', 'order_paid_ready_to_prepare',
  'order_ready_for_dispatch', 'supplier_batch_dispatched', 'supplier_batch_arrived_hub',
  'delivery_assigned', 'order_cancelled', 'order_payment_submitted', 'price_finalised',
  'payment_confirmed', 'payment_receipt_rejected', 'out_for_delivery', 'order_delivered'
);

ALTER TABLE public.notifications ENABLE TRIGGER trg_notification_prevent_mutation;

CREATE OR REPLACE FUNCTION public.notification_after_receipt_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.sales_orders WHERE id = NEW.sales_order_id;
  PERFORM public.emit_order_notification_to_admins(
    'payment_receipt_submitted', o.id, 'Payment receipt requires verification',
    'A customer payment receipt is ready for verification.', '/admin?tab=orders#payment-verification',
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

COMMIT;
