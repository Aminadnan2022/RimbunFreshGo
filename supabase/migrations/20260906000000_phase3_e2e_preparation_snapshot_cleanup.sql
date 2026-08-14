-- Phase 3 E2E-only cleanup support.
-- Keeps preparation snapshots immutable in normal application usage.
-- Cleanup is narrowly scoped to test users created by the E2E harness.

CREATE OR REPLACE FUNCTION public.phase3_prevent_preparation_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('freshgo.e2e_cleanup', true) = 'on'
     AND current_user = 'postgres' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION 'Order preparation snapshots are immutable.';
END;
$$;

CREATE OR REPLACE FUNCTION public.e2e_cleanup_phase3_test_run(
  p_run_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_ids uuid[];
  v_snapshot_count integer := 0;
  v_order_count integer := 0;
BEGIN
  IF p_run_id IS NULL OR btrim(p_run_id) = '' THEN
    RAISE EXCEPTION 'run id is required';
  END IF;

  SELECT array_agg(u.id)
  INTO v_user_ids
  FROM auth.users u
  WHERE u.raw_user_meta_data->>'test_run_id' = p_run_id
    AND lower(coalesce(u.email, '')) LIKE '%@example.com';

  IF v_user_ids IS NULL OR cardinality(v_user_ids) = 0 THEN
    RETURN jsonb_build_object(
      'snapshots_deleted', 0,
      'orders_deleted', 0
    );
  END IF;

  PERFORM set_config('freshgo.e2e_cleanup', 'on', true);

  DELETE FROM public.order_preparation_snapshots
  WHERE customer_id = ANY(v_user_ids);

  GET DIAGNOSTICS v_snapshot_count = ROW_COUNT;

  DELETE FROM public."Orders"
  WHERE user_id = ANY(v_user_ids);

  GET DIAGNOSTICS v_order_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'snapshots_deleted', v_snapshot_count,
    'orders_deleted', v_order_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_cleanup_phase3_test_run(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.e2e_cleanup_phase3_test_run(text) FROM anon;
REVOKE ALL ON FUNCTION public.e2e_cleanup_phase3_test_run(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_cleanup_phase3_test_run(text) TO service_role;
