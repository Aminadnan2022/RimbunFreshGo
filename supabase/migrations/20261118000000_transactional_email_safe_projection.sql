-- P0 customer email projection. Service-role only and deliberately narrower
-- than the underlying order and notification records.
CREATE OR REPLACE FUNCTION public.get_transactional_email_projection(p_notification_id uuid)
RETURNS TABLE (
  notification_type text,
  order_number text,
  final_total numeric,
  currency_code text,
  payment_status text,
  delivery_date text,
  delivery_window text,
  delivery_area text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    n.notification_type,
    o.order_number,
    CASE WHEN n.notification_type IN ('price_finalised', 'payment_confirmed') THEN o.final_total ELSE NULL END,
    CASE WHEN n.notification_type IN ('price_finalised', 'payment_confirmed') THEN o.currency_code ELSE NULL END,
    CASE WHEN n.notification_type IN ('order_payment_submitted', 'price_finalised', 'payment_confirmed', 'payment_receipt_rejected') THEN o.payment_status ELSE NULL END,
    CASE WHEN n.notification_type IN ('ready_for_delivery', 'out_for_delivery', 'order_delivered') THEN NULLIF(o.delivery_snapshot ->> 'requested_date', '') ELSE NULL END,
    CASE WHEN n.notification_type IN ('ready_for_delivery', 'out_for_delivery', 'order_delivered') THEN NULLIF(o.delivery_snapshot ->> 'requested_time', '') ELSE NULL END,
    CASE WHEN n.notification_type IN ('ready_for_delivery', 'out_for_delivery', 'order_delivered') THEN COALESCE(NULLIF(o.delivery_snapshot ->> 'delivery_point_name', ''), NULLIF(o.delivery_snapshot ->> 'zone_name', ''), NULLIF(o.delivery_snapshot ->> 'pickup_location', '')) ELSE NULL END
  FROM public.notifications n
  JOIN public.sales_orders o ON o.id = n.sales_order_id
  WHERE n.id = p_notification_id
    AND n.recipient_role = 'customer'
    AND n.recipient_user_id = o.customer_id
    AND n.notification_type IN (
      'order_payment_submitted', 'price_finalised', 'payment_confirmed', 'payment_receipt_rejected',
      'ready_for_delivery', 'out_for_delivery', 'order_delivered', 'order_cancelled'
    );
$$;

REVOKE ALL ON FUNCTION public.get_transactional_email_projection(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_transactional_email_projection(uuid) TO service_role;

COMMENT ON FUNCTION public.get_transactional_email_projection(uuid) IS
  'Service-role-only minimal projection for the eight customer transactional emails; excludes contact, address, notes, receipt, proof, supplier, and credential data.';
