-- Batch-level notifications do not have one sales_order_id.  Use the supplied
-- stable batch suffix as their identity instead of concatenating NULL.
BEGIN;

CREATE OR REPLACE FUNCTION public.emit_order_notification_to_admins(
  p_event_type text, p_sales_order_id uuid, p_title text, p_message text,
  p_action_url text, p_payload jsonb DEFAULT '{}'::jsonb, p_key_suffix text DEFAULT ''
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
DECLARE v_entity_id text := COALESCE(p_sales_order_id::text, NULLIF(p_key_suffix, ''), 'global');
BEGIN
  FOR r IN SELECT id FROM public.user_roles WHERE role = 'admin' LOOP
    PERFORM public.emit_notification(r.id, 'admin', p_event_type, p_sales_order_id,
      CASE WHEN p_sales_order_id IS NULL THEN 'supplier_batch' ELSE 'sales_order' END,
      v_entity_id, p_title, p_message, p_action_url, p_payload,
      p_event_type || ':' || v_entity_id || ':' || r.id::text || ':' || p_key_suffix);
  END LOOP;
END; $$;

COMMIT;
