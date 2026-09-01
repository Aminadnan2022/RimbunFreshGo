-- Provide a narrow service-role-only cleanup path for run-scoped canonical E2E
-- fixtures. The caller supplies the UUIDs created during its own test run.
BEGIN;

CREATE OR REPLACE FUNCTION public.e2e_cleanup_canonical_orders(
  p_order_ids uuid[],
  p_batch_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_order_count integer;
  v_batch_count integer;
  v_order_ids uuid[] := COALESCE(p_order_ids, ARRAY[]::uuid[]);
  v_batch_ids uuid[] := COALESCE(p_batch_ids, ARRAY[]::uuid[]);
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Canonical E2E cleanup requires service_role.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(cardinality(p_order_ids), 0) > 100
     OR COALESCE(cardinality(p_batch_ids), 0) > 100 THEN
    RAISE EXCEPTION 'Canonical E2E cleanup is limited to 100 orders and batches per call.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.checkout_payment_receipt_staging
  WHERE consumed_sales_order_id = ANY(v_order_ids);
  DELETE FROM public.web_push_delivery_attempts WHERE job_id IN (
    SELECT id FROM public.web_push_delivery_jobs
    WHERE notification_id IN (SELECT id FROM public.notifications WHERE sales_order_id = ANY(v_order_ids)));
  DELETE FROM public.web_push_delivery_jobs
  WHERE notification_id IN (SELECT id FROM public.notifications WHERE sales_order_id = ANY(v_order_ids));
  DELETE FROM public.transactional_email_attempts WHERE job_id IN (
    SELECT id FROM public.transactional_email_jobs
    WHERE notification_id IN (SELECT id FROM public.notifications WHERE sales_order_id = ANY(v_order_ids)));
  DELETE FROM public.transactional_email_jobs
  WHERE notification_id IN (SELECT id FROM public.notifications WHERE sales_order_id = ANY(v_order_ids));
  DELETE FROM public.notifications WHERE sales_order_id = ANY(v_order_ids);

  PERFORM set_config('lock_timeout', '5s', true);
  ALTER TABLE public.sales_order_payment_receipts DISABLE TRIGGER sales_order_payment_receipts_append_only;
  ALTER TABLE public.sales_order_preparation_answers DISABLE TRIGGER sales_order_preparation_answers_append_only;
  ALTER TABLE public.sales_order_line_component_units DISABLE TRIGGER sales_order_line_component_units_append_only;
  ALTER TABLE public.sales_order_line_components DISABLE TRIGGER sales_order_line_components_append_only;
  ALTER TABLE public.sales_order_line_units DISABLE TRIGGER sales_order_line_units_append_only;
  ALTER TABLE public.sales_order_lines DISABLE TRIGGER sales_order_lines_append_only;
  ALTER TABLE public.sales_order_adjustments DISABLE TRIGGER sales_order_adjustments_append_only;
  ALTER TABLE public.sales_order_events DISABLE TRIGGER sales_order_events_append_only;
  ALTER TABLE public.sales_orders DISABLE TRIGGER sales_orders_append_only;

  DELETE FROM public.canonical_delivery_proofs WHERE sales_order_id = ANY(v_order_ids);
  DELETE FROM public.canonical_sales_order_deliveries WHERE sales_order_id = ANY(v_order_ids);
  DELETE FROM public.canonical_supplier_delivery_batch_orders WHERE sales_order_id = ANY(v_order_ids);
  DELETE FROM public.canonical_supplier_delivery_batches WHERE id = ANY(v_batch_ids);
  GET DIAGNOSTICS v_batch_count = ROW_COUNT;
  DELETE FROM public.sales_order_supplier_fulfilments WHERE sales_order_id = ANY(v_order_ids);
  DELETE FROM public.payment_reminder_attempts WHERE sales_order_id = ANY(v_order_ids);
  DELETE FROM public.sales_order_payment_receipts WHERE sales_order_id = ANY(v_order_ids);
  DELETE FROM public.sales_order_preparation_answers WHERE sales_order_line_id IN (
    SELECT id FROM public.sales_order_lines WHERE sales_order_id = ANY(v_order_ids));
  DELETE FROM public.sales_order_line_component_units WHERE sales_order_line_component_id IN (
    SELECT c.id FROM public.sales_order_line_components AS c
    JOIN public.sales_order_lines AS l ON l.id = c.sales_order_line_id
    WHERE l.sales_order_id = ANY(v_order_ids));
  DELETE FROM public.sales_order_line_components WHERE sales_order_line_id IN (
    SELECT id FROM public.sales_order_lines WHERE sales_order_id = ANY(v_order_ids));
  DELETE FROM public.sales_order_line_units WHERE sales_order_line_id IN (
    SELECT id FROM public.sales_order_lines WHERE sales_order_id = ANY(v_order_ids));
  DELETE FROM public.sales_order_adjustments WHERE sales_order_id = ANY(v_order_ids);
  DELETE FROM public.sales_order_events WHERE sales_order_id = ANY(v_order_ids);
  DELETE FROM public.sales_order_checkout_idempotency WHERE sales_order_id = ANY(v_order_ids);
  DELETE FROM public.sales_order_lines WHERE sales_order_id = ANY(v_order_ids);
  DELETE FROM public.sales_orders WHERE id = ANY(v_order_ids);
  GET DIAGNOSTICS v_order_count = ROW_COUNT;

  ALTER TABLE public.sales_orders ENABLE TRIGGER sales_orders_append_only;
  ALTER TABLE public.sales_order_events ENABLE TRIGGER sales_order_events_append_only;
  ALTER TABLE public.sales_order_adjustments ENABLE TRIGGER sales_order_adjustments_append_only;
  ALTER TABLE public.sales_order_lines ENABLE TRIGGER sales_order_lines_append_only;
  ALTER TABLE public.sales_order_line_units ENABLE TRIGGER sales_order_line_units_append_only;
  ALTER TABLE public.sales_order_line_components ENABLE TRIGGER sales_order_line_components_append_only;
  ALTER TABLE public.sales_order_line_component_units ENABLE TRIGGER sales_order_line_component_units_append_only;
  ALTER TABLE public.sales_order_preparation_answers ENABLE TRIGGER sales_order_preparation_answers_append_only;
  ALTER TABLE public.sales_order_payment_receipts ENABLE TRIGGER sales_order_payment_receipts_append_only;

  RETURN jsonb_build_object('sales_orders', v_order_count, 'batches', v_batch_count);
END;
$$;

ALTER FUNCTION public.e2e_cleanup_canonical_orders(uuid[], uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.e2e_cleanup_canonical_orders(uuid[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_cleanup_canonical_orders(uuid[], uuid[]) TO service_role;

COMMIT;
