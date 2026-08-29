-- Notify the customer when their payment receipt is successfully submitted.
-- The previous implementation notified only admins, so the transactional-email
-- queue never received the customer-facing order_payment_submitted event.
BEGIN;

CREATE OR REPLACE FUNCTION public.submit_sales_order_payment_receipt(
  p_sales_order_id uuid,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_receipt_id uuid;
  v_customer_id uuid;
BEGIN
  SELECT customer_id
    INTO v_customer_id
  FROM public.sales_orders
  WHERE id = p_sales_order_id
    AND customer_id = auth.uid()
    AND status <> 'cancelled'
    AND price_status = 'final'
    AND payment_status IN ('pending', 'rejected');

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Payment receipt is not currently allowed.';
  END IF;

  IF p_storage_path NOT LIKE p_sales_order_id::text || '/%' THEN
    RAISE EXCEPTION 'Receipt path must belong to the order.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'sales-order-payment-receipts'
      AND name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'Receipt Storage object does not exist in the payment-receipts bucket.';
  END IF;

  PERFORM set_config('freshgo.canonical_operation', 'receipt_submission', true);

  INSERT INTO public.sales_order_payment_receipts (
    sales_order_id, storage_path, original_file_name, mime_type, file_size, uploaded_by
  )
  VALUES (
    p_sales_order_id, p_storage_path, p_original_file_name, p_mime_type, p_file_size, auth.uid()
  )
  RETURNING id INTO v_receipt_id;

  UPDATE public.sales_orders
     SET payment_status = 'receipt_submitted', receipt_submitted_at = now()
   WHERE id = p_sales_order_id;

  INSERT INTO public.sales_order_events (sales_order_id, event_type, actor_id, payload)
  VALUES (
    p_sales_order_id,
    'payment_receipt_submitted',
    auth.uid(),
    jsonb_build_object('receipt_id', v_receipt_id)
  );

  RETURN v_receipt_id;
END;
$$;

-- One canonical notification source: the receipt trigger. It already fans out
-- admin notifications; customer notification must also cover weighed orders.
CREATE OR REPLACE FUNCTION public.notification_after_receipt_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE o public.sales_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.sales_orders WHERE id = NEW.sales_order_id;

  BEGIN
    PERFORM public.emit_order_notification_to_admins(
      'payment_receipt_submitted', o.id, 'Payment receipt requires verification',
      'A customer payment receipt is ready for verification.',
      '/admin?tab=orders#payment-verification',
      jsonb_build_object('receipt_id', NEW.id, 'order_number', o.order_number),
      NEW.id::text
    );
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    IF o.customer_id IS NOT NULL THEN
      PERFORM public.emit_notification(
        o.customer_id, 'customer', 'order_payment_submitted', o.id,
        'sales_order', o.id::text, 'Order received',
        'Your order and payment receipt were received and are awaiting verification.',
        '/order/' || o.id::text,
        jsonb_build_object('order_number', o.order_number),
        'order_payment_submitted:' || o.id::text || ':' || o.customer_id::text
      );
    END IF;
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

COMMIT;
