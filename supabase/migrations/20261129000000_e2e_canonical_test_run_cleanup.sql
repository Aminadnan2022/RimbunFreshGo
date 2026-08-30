-- Canonical run-scoped cleanup for destructive E2E fixtures. No table DELETE
-- privilege is widened: the sole entry point is service_role.
BEGIN;

CREATE OR REPLACE FUNCTION public.e2e_cleanup_canonical_test_run(p_run_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_run_id text := btrim(COALESCE(p_run_id, ''));
  v_stage text;
  v_notes text;
  v_key_prefix text;
  v_count integer;
  v_summary jsonb := '{}'::jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'E2E cleanup requires service_role.' USING ERRCODE = '42501';
  END IF;
  IF v_run_id !~ '^E2E-[0-9]{8}-[A-Z0-9]{6}-CONC(10|25|50)$' THEN
    RAISE EXCEPTION 'Invalid E2E concurrency run id.' USING ERRCODE = '22023';
  END IF;

  v_stage := substring(v_run_id FROM 'CONC(10|25|50)$');
  v_notes := format('concurrency stage %s %s', v_stage, v_run_id);
  v_key_prefix := format('conc%s:%s:', v_stage, v_run_id);

  DROP TABLE IF EXISTS pg_temp.e2e_cleanup_orders;
  CREATE TEMP TABLE e2e_cleanup_orders (id uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO pg_temp.e2e_cleanup_orders (id)
  SELECT o.id
  FROM public.sales_orders AS o
  JOIN auth.users AS u ON u.id = o.customer_id
  WHERE o.customer_snapshot ->> 'notes' = v_notes
    AND u.raw_user_meta_data ->> 'test_run_id' LIKE v_run_id || '-%'
    AND position(lower(v_run_id) IN lower(COALESCE(u.email, ''))) > 0
    AND EXISTS (
      SELECT 1 FROM public.sales_order_checkout_idempotency AS i
      WHERE i.sales_order_id = o.id
        AND i.customer_id = o.customer_id
        AND left(i.idempotency_key, char_length(v_key_prefix)) = v_key_prefix
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := jsonb_build_object('run_id', v_run_id, 'target_orders', v_count);

  DROP TABLE IF EXISTS pg_temp.e2e_cleanup_notifications;
  CREATE TEMP TABLE e2e_cleanup_notifications (id uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO pg_temp.e2e_cleanup_notifications (id)
  SELECT n.id FROM public.notifications AS n
  JOIN pg_temp.e2e_cleanup_orders AS o ON o.id = n.sales_order_id;

  DROP TABLE IF EXISTS pg_temp.e2e_cleanup_batches;
  CREATE TEMP TABLE e2e_cleanup_batches (id uuid PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO pg_temp.e2e_cleanup_batches (id)
  SELECT b.id FROM public.canonical_supplier_delivery_batches AS b
  WHERE (b.notes = v_notes OR b.batch_code = format('CONC%s:%s', v_stage, v_run_id))
    AND NOT EXISTS (
      SELECT 1 FROM public.canonical_supplier_delivery_batch_orders AS bo
      WHERE bo.batch_id = b.id
        AND NOT EXISTS (SELECT 1 FROM pg_temp.e2e_cleanup_orders AS o WHERE o.id = bo.sales_order_id)
    );

  DELETE FROM public.checkout_payment_receipt_staging AS s
  WHERE s.consumed_sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders)
     OR (left(s.idempotency_key, char_length(v_key_prefix)) = v_key_prefix
       AND EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = s.customer_id
         AND u.raw_user_meta_data ->> 'test_run_id' LIKE v_run_id || '-%'
         AND position(lower(v_run_id) IN lower(COALESCE(u.email, ''))) > 0));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('checkout_payment_receipt_staging', v_count);

  DELETE FROM public.web_push_delivery_attempts AS a WHERE a.job_id IN (
    SELECT j.id FROM public.web_push_delivery_jobs AS j
    WHERE j.notification_id IN (SELECT id FROM pg_temp.e2e_cleanup_notifications));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('web_push_delivery_attempts', v_count);
  DELETE FROM public.web_push_delivery_jobs WHERE notification_id IN (SELECT id FROM pg_temp.e2e_cleanup_notifications);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('web_push_delivery_jobs', v_count);

  DELETE FROM public.transactional_email_attempts AS a WHERE a.job_id IN (
    SELECT j.id FROM public.transactional_email_jobs AS j
    WHERE j.notification_id IN (SELECT id FROM pg_temp.e2e_cleanup_notifications));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('transactional_email_attempts', v_count);
  DELETE FROM public.transactional_email_jobs WHERE notification_id IN (SELECT id FROM pg_temp.e2e_cleanup_notifications);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('transactional_email_jobs', v_count);
  DELETE FROM public.notifications WHERE id IN (SELECT id FROM pg_temp.e2e_cleanup_notifications);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('notifications', v_count);

  -- Exact append-only triggers are disabled only inside this transaction.
  -- ALTER holds exclusive locks, so concurrent writes cannot observe it; any
  -- exception rolls the catalog changes and data deletion back together.
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

  DELETE FROM public.canonical_delivery_proofs WHERE sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('canonical_delivery_proofs', v_count);
  DELETE FROM public.canonical_sales_order_deliveries WHERE sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('canonical_sales_order_deliveries', v_count);
  DELETE FROM public.canonical_supplier_delivery_batch_orders WHERE sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('canonical_supplier_delivery_batch_orders', v_count);
  DELETE FROM public.canonical_supplier_delivery_batches WHERE id IN (SELECT id FROM pg_temp.e2e_cleanup_batches);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('canonical_supplier_delivery_batches', v_count);
  DELETE FROM public.sales_order_supplier_fulfilments WHERE sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('sales_order_supplier_fulfilments', v_count);
  DELETE FROM public.payment_reminder_attempts WHERE sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('payment_reminder_attempts', v_count);
  DELETE FROM public.sales_order_payment_receipts WHERE sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('sales_order_payment_receipts', v_count);

  DELETE FROM public.sales_order_preparation_answers AS a WHERE a.sales_order_line_id IN (
    SELECT l.id FROM public.sales_order_lines AS l WHERE l.sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('sales_order_preparation_answers', v_count);
  DELETE FROM public.sales_order_line_component_units AS u WHERE u.sales_order_line_component_id IN (
    SELECT c.id FROM public.sales_order_line_components AS c JOIN public.sales_order_lines AS l ON l.id = c.sales_order_line_id
    WHERE l.sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('sales_order_line_component_units', v_count);
  DELETE FROM public.sales_order_line_components AS c WHERE c.sales_order_line_id IN (
    SELECT l.id FROM public.sales_order_lines AS l WHERE l.sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('sales_order_line_components', v_count);
  DELETE FROM public.sales_order_line_units AS u WHERE u.sales_order_line_id IN (
    SELECT l.id FROM public.sales_order_lines AS l WHERE l.sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('sales_order_line_units', v_count);

  DELETE FROM public.sales_order_adjustments WHERE sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('sales_order_adjustments', v_count);
  DELETE FROM public.sales_order_events WHERE sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('sales_order_events', v_count);
  DELETE FROM public.sales_order_checkout_idempotency WHERE sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('sales_order_checkout_idempotency', v_count);
  DELETE FROM public.sales_order_lines WHERE sales_order_id IN (SELECT id FROM pg_temp.e2e_cleanup_orders);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('sales_order_lines', v_count);
  DELETE FROM public.sales_orders WHERE id IN (SELECT id FROM pg_temp.e2e_cleanup_orders);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_summary := v_summary || jsonb_build_object('sales_orders', v_count);

  ALTER TABLE public.sales_orders ENABLE TRIGGER sales_orders_append_only;
  ALTER TABLE public.sales_order_events ENABLE TRIGGER sales_order_events_append_only;
  ALTER TABLE public.sales_order_adjustments ENABLE TRIGGER sales_order_adjustments_append_only;
  ALTER TABLE public.sales_order_lines ENABLE TRIGGER sales_order_lines_append_only;
  ALTER TABLE public.sales_order_line_units ENABLE TRIGGER sales_order_line_units_append_only;
  ALTER TABLE public.sales_order_line_components ENABLE TRIGGER sales_order_line_components_append_only;
  ALTER TABLE public.sales_order_line_component_units ENABLE TRIGGER sales_order_line_component_units_append_only;
  ALTER TABLE public.sales_order_preparation_answers ENABLE TRIGGER sales_order_preparation_answers_append_only;
  ALTER TABLE public.sales_order_payment_receipts ENABLE TRIGGER sales_order_payment_receipts_append_only;
  RETURN v_summary;
END;
$$;

ALTER FUNCTION public.e2e_cleanup_canonical_test_run(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.e2e_cleanup_canonical_test_run(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_cleanup_canonical_test_run(text) TO service_role;

COMMIT;
