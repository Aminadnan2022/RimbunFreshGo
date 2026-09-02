-- Final customer-delivery policy:
--   * Monday is closed.
--   * Community bulk delivery is RM2 for eligible Jalan Zamrud Utama zones,
--     Wednesday/Friday only, with a 3 PM Asia/Kuala_Lumpur same-day cutoff.
--   * External courier delivery is available Tuesday-Sunday. The customer pays
--     the separately confirmed current Lalamove/Grab rate.
BEGIN;

DO $$
DECLARE
  v_cutover timestamptz := clock_timestamp();
  v_previous_id uuid;
  v_new_id uuid;
  v_next_version integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('freshgo:delivery-policy:instant-courier'));

  SELECT id INTO v_previous_id
  FROM public.delivery_method_versions
  WHERE method_code = 'instant_customer_lalamove'
    AND status = 'published'
    AND active
    AND effective_from <= v_cutover
    AND (effective_to IS NULL OR effective_to > v_cutover)
  ORDER BY effective_from DESC
  LIMIT 1
  FOR UPDATE;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM public.delivery_method_versions
  WHERE method_code = 'instant_customer_lalamove';

  IF v_previous_id IS NOT NULL THEN
    PERFORM set_config('freshgo.configuration_retire', 'on', true);
    UPDATE public.delivery_method_versions
    SET status = 'retired', active = false, effective_to = v_cutover
    WHERE id = v_previous_id;
  END IF;

  INSERT INTO public.delivery_method_versions (
    method_code, version_number, status, active, effective_from, fee_amount,
    external_provider, customer_pays_external_provider, timezone
  ) VALUES (
    'instant_customer_lalamove', v_next_version, 'draft', true, v_cutover, 0,
    'Lalamove / Grab', true, 'Asia/Kuala_Lumpur'
  ) RETURNING id INTO v_new_id;

  -- PostgreSQL DOW: Sunday=0, Monday=1, Tuesday=2 ... Saturday=6.
  INSERT INTO public.delivery_method_version_days (delivery_method_version_id, weekday)
  SELECT v_new_id, weekday
  FROM unnest(ARRAY[0, 2, 3, 4, 5, 6]::smallint[]) AS allowed_day(weekday);

  -- Preserve the existing on-demand request window; only available days and
  -- provider description change in this policy migration.
  INSERT INTO public.delivery_method_version_windows (
    delivery_method_version_id, start_time, end_time
  ) VALUES (v_new_id, time '09:00', time '16:00');

  UPDATE public.delivery_method_versions
  SET status = 'published', published_at = v_cutover
  WHERE id = v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_customer_delivery_schedule_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_method text := NEW.delivery_snapshot ->> 'method_code';
  v_requested_date date;
  v_weekday smallint;
  v_malaysia_now timestamp := clock_timestamp() AT TIME ZONE 'Asia/Kuala_Lumpur';
BEGIN
  BEGIN
    v_requested_date := (NEW.delivery_snapshot ->> 'requested_date')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'A valid requested delivery date is required.';
  END;

  IF v_requested_date < v_malaysia_now::date THEN
    RAISE EXCEPTION 'Requested delivery date cannot be in the past.';
  END IF;

  v_weekday := extract(dow FROM v_requested_date)::smallint;
  IF v_weekday = 1 THEN
    RAISE EXCEPTION 'FreshGo delivery is closed on Monday.';
  END IF;

  IF v_method = 'normal_bulk' THEN
    IF v_weekday NOT IN (3, 5) THEN
      RAISE EXCEPTION 'RM2 community delivery is available on Wednesday and Friday only.';
    END IF;
    IF round(NEW.delivery_fee, 2) <> 2.00 THEN
      RAISE EXCEPTION 'Community delivery fee must be RM2 per order.';
    END IF;
    IF NULLIF(btrim(NEW.delivery_snapshot ->> 'zone_code'), '') IS NULL THEN
      RAISE EXCEPTION 'Community delivery requires an eligible Jalan Zamrud Utama zone.';
    END IF;
    IF v_requested_date = v_malaysia_now::date AND v_malaysia_now::time >= time '15:00' THEN
      RAISE EXCEPTION 'Same-day RM2 community delivery closes at 3:00 PM Malaysia time.';
    END IF;
  ELSIF v_method = 'instant_customer_lalamove' THEN
    IF round(NEW.delivery_fee, 2) <> 0.00 THEN
      RAISE EXCEPTION 'External courier fee must be charged separately at the current provider rate.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_customer_delivery_schedule_before_insert ON public.sales_orders;
CREATE TRIGGER enforce_customer_delivery_schedule_before_insert
BEFORE INSERT ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_delivery_schedule_policy();

COMMENT ON FUNCTION public.enforce_customer_delivery_schedule_policy() IS
  'Enforces Monday closure, RM2 Wednesday/Friday community eligibility and 3 PM Malaysia same-day cutoff.';

COMMIT;
