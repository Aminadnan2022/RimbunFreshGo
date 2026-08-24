-- Route Previous Data mutations through narrowly scoped admin RPCs.
-- authenticated keeps admin-filtered SELECT access, but receives no direct DML.

REVOKE INSERT, UPDATE, DELETE ON public.historical_business_daily FROM authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_historical_business_daily(
  p_business_date date,
  p_order_count integer,
  p_revenue_amount numeric,
  p_supplier_cost_amount numeric,
  p_delivery_income_amount numeric,
  p_gross_profit_amount numeric,
  p_notes text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.historical_business_daily (
    business_date, order_count, revenue_amount, supplier_cost_amount,
    delivery_income_amount, gross_profit_amount, notes, created_by
  ) VALUES (
    p_business_date, p_order_count, p_revenue_amount, p_supplier_cost_amount,
    p_delivery_income_amount, p_gross_profit_amount, NULLIF(btrim(p_notes), ''), auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_historical_business_daily(
  p_id bigint,
  p_business_date date,
  p_order_count integer,
  p_revenue_amount numeric,
  p_supplier_cost_amount numeric,
  p_delivery_income_amount numeric,
  p_gross_profit_amount numeric,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.historical_business_daily SET
    business_date = p_business_date,
    order_count = p_order_count,
    revenue_amount = p_revenue_amount,
    supplier_cost_amount = p_supplier_cost_amount,
    delivery_income_amount = p_delivery_income_amount,
    gross_profit_amount = p_gross_profit_amount,
    notes = NULLIF(btrim(p_notes), ''),
    updated_by = auth.uid()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Previous Data entry not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_historical_business_daily(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.historical_business_daily WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Previous Data entry not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_historical_business_daily(date, integer, numeric, numeric, numeric, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_historical_business_daily(bigint, date, integer, numeric, numeric, numeric, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_historical_business_daily(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_historical_business_daily(date, integer, numeric, numeric, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_historical_business_daily(bigint, date, integer, numeric, numeric, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_historical_business_daily(bigint) TO authenticated;
