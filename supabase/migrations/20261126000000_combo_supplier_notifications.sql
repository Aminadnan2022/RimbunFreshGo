-- Include combo-component ownership in canonical supplier notifications.
-- Local migration only: do not apply remotely until reviewed and approved.
BEGIN;

CREATE OR REPLACE FUNCTION public.emit_order_notification_to_suppliers(
  p_event_type text,
  p_sales_order_id uuid,
  p_title text,
  p_message text,
  p_action_url text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_key_suffix text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT su.user_id
    FROM public.supplier_users su
    JOIN (
      SELECT l.supplier_id
      FROM public.sales_order_lines l
      WHERE l.sales_order_id = p_sales_order_id

      UNION

      SELECT c.supplier_id
      FROM public.sales_order_lines l
      JOIN public.sales_order_line_components c
        ON c.sales_order_line_id = l.id
      WHERE l.sales_order_id = p_sales_order_id
    ) owned_supplier ON owned_supplier.supplier_id = su.supplier_id
    WHERE su.active
  LOOP
    PERFORM public.emit_notification(
      r.user_id,
      'supplier',
      p_event_type,
      p_sales_order_id,
      'sales_order',
      p_sales_order_id::text,
      p_title,
      p_message,
      p_action_url,
      p_payload,
      p_event_type || ':' || p_sales_order_id::text || ':' || r.user_id::text || ':' || p_key_suffix
    );
  END LOOP;
END;
$$;

-- Canonical order placement starts the header with this flag false and flips it
-- only after every direct line and combo component has been snapshotted. The
-- order-level flag is the customer-price finalisation authority: combo component
-- ordering modes and procurement weights must never be used to infer this event.
-- Emit at the completed transition so every owning supplier is available for the
-- established order-wide supplier fan-out.
CREATE OR REPLACE FUNCTION public.notification_after_supplier_finalisation_required()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.emit_order_notification_to_suppliers(
    'order_requires_weighing',
    NEW.id,
    'New order requires weighing',
    'A customer order needs weighing and finalisation before payment.',
    '/supplier',
    jsonb_build_object('order_number', NEW.order_number),
    'supplier-action'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_supplier_finalisation_required
  ON public.sales_orders;
CREATE TRIGGER trg_notification_supplier_finalisation_required
AFTER UPDATE OF requires_supplier_finalisation ON public.sales_orders
FOR EACH ROW
WHEN (
  OLD.requires_supplier_finalisation IS DISTINCT FROM true
  AND NEW.requires_supplier_finalisation = true
  AND NEW.status <> 'cancelled'
)
EXECUTE FUNCTION public.notification_after_supplier_finalisation_required();

REVOKE ALL ON FUNCTION public.emit_order_notification_to_suppliers(
  text, uuid, text, text, text, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_after_supplier_finalisation_required()
  FROM PUBLIC;

COMMIT;
