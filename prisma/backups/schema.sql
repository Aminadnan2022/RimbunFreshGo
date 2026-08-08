


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."delivery_method" AS ENUM (
    'Lobby Collection',
    'Security Collection',
    'Customer Come Down',
    'Doorstep Delivery'
);


ALTER TYPE "public"."delivery_method" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_line_cost"("item" "jsonb") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT round(COALESCE((item->>'costPrice')::numeric,0) * public._line_qty(item), 2);
$$;


ALTER FUNCTION "public"."_line_cost"("item" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_line_margin"("item" "jsonb") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE WHEN public._line_selling(item) > 0
    THEN round((public._line_selling(item) - public._line_cost(item)) / public._line_selling(item) * 100, 2)
    ELSE 0 END;
$$;


ALTER FUNCTION "public"."_line_margin"("item" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_line_profit"("item" "jsonb") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT round(public._line_selling(item) - public._line_cost(item), 2);
$$;


ALTER FUNCTION "public"."_line_profit"("item" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_line_qty"("item" "jsonb") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN (item->>'pricingType') IN ('per_kg','slice')
      THEN COALESCE((item->>'actualWeight')::numeric, (item->>'estimatedWeight')::numeric, 0)
    ELSE COALESCE((item->>'quantity')::numeric, 0)
  END;
$$;


ALTER FUNCTION "public"."_line_qty"("item" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_line_selling"("item" "jsonb") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT round(COALESCE((item->>'price')::numeric,0) * public._line_qty(item), 2);
$$;


ALTER FUNCTION "public"."_line_selling"("item" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pricing_set_selling"("p_product_id" "text", "p_selling_price" numeric, "p_effective_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_eff  timestamptz := COALESCE(p_effective_at, now());
  v_same boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_product_id IS NULL OR btrim(p_product_id) = '' THEN
    RAISE EXCEPTION 'Invalid product id.';
  END IF;
  IF p_selling_price IS NULL OR p_selling_price < 0 THEN
    RAISE EXCEPTION 'Invalid selling price.';
  END IF;

  -- Deterministic per-product lock; released at transaction end.
  PERFORM pg_advisory_xact_lock(hashtext('sell_price_v2_2_2:' || p_product_id));

  -- Idempotent NO-OP: an ACTIVE row already holds this numeric price.
  SELECT EXISTS (
    SELECT 1 FROM public.selling_price_history
     WHERE product_id    = p_product_id
       AND is_active     = true
       AND selling_price = p_selling_price
  ) INTO v_same;
  IF v_same THEN
    -- Only mirror sync; history row stays as-is (no close, no insert).
    UPDATE public."Product" SET price = p_selling_price WHERE id = p_product_id;
    RETURN;
  END IF;

  -- Real price change: close the current active row, insert exactly ONE new.
  UPDATE public.selling_price_history
     SET effective_to = v_eff,
         is_active    = false,
         updated_by   = auth.uid(),
         updated_at   = now()
   WHERE product_id   = p_product_id
     AND is_active    = true;

  INSERT INTO public.selling_price_history
    (product_id, selling_price, effective_from, effective_to, is_active,
     created_by, updated_by)
  VALUES
    (p_product_id, p_selling_price, v_eff, NULL, true, auth.uid(), auth.uid());

  UPDATE public."Product" SET price = p_selling_price WHERE id = p_product_id;

  -- Note: open-order repricing is owned by the public wrapper set_product_*()
  -- (one call site), which skips Paid/completed/delivered orders.
END;
$$;


ALTER FUNCTION "public"."_pricing_set_selling"("p_product_id" "text", "p_selling_price" numeric, "p_effective_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_pricing_set_supplier"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text", "p_supplier_id" bigint, "p_effective_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_supplier_id bigint := p_supplier_id;
  v_supplier    text   := COALESCE(btrim(p_supplier_name), '');
  v_eff         timestamptz := COALESCE(p_effective_at, now());
  v_canon_new   text;
  v_same        boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_product_id IS NULL OR btrim(p_product_id) = '' THEN
    RAISE EXCEPTION 'Invalid product id.';
  END IF;
  IF p_cost_price IS NULL OR p_cost_price < 0 THEN
    RAISE EXCEPTION 'Invalid cost price.';
  END IF;

  -- Serialise per-product; distinct prefix ⇒ no collision with selling lock.
  PERFORM pg_advisory_xact_lock(hashtext('supplier:v2_2_2:' || p_product_id));

  -- Resolve supplier: explicit id wins, else find-or-create by canonical name.
  IF v_supplier_id IS NULL AND v_supplier <> '' THEN
    SELECT s.id INTO v_supplier_id
      FROM public.suppliers s
     WHERE lower(s.name) = lower(v_supplier)
     ORDER BY s.id LIMIT 1;
    IF v_supplier_id IS NULL THEN
      INSERT INTO public.suppliers (name) VALUES (v_supplier)
        RETURNING id INTO v_supplier_id;
    END IF;
  END IF;

  v_canon_new := lower(coalesce(
    (SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id),
    v_supplier, ''));

  -- IDEMPOTENT NOOP: unchanged = identical supplier identity AND identical cost.
  SELECT EXISTS (
    SELECT 1
      FROM public.supplier_price_history h
     WHERE h.product_id  = p_product_id
       AND h.is_active   = true
       AND h.cost_price  = p_cost_price
       AND lower(coalesce(
             (SELECT s2.name FROM public.suppliers s2 WHERE s2.id = h.supplier_id),
             coalesce(h.supplier_name,''), '')) = v_canon_new
  ) INTO v_same;
  IF v_same THEN
    UPDATE public."Product" SET cost_price = p_cost_price,
           cost_supplier_name = coalesce((SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id), v_supplier)
     WHERE id = p_product_id;
    RETURN;
  END IF;

  -- Real change: close active row, append exactly ONE new one.
  UPDATE public.supplier_price_history
     SET effective_to = v_eff,
         is_active    = false,
         updated_by   = auth.uid(),
         updated_at   = now()
   WHERE product_id   = p_product_id
     AND is_active    = true;

  INSERT INTO public.supplier_price_history
    (product_id, supplier_id, supplier_name, cost_price,
     effective_from, effective_to, is_active, created_by, updated_by)
  VALUES
    (p_product_id, v_supplier_id,
     coalesce((SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id), v_supplier),
     p_cost_price, v_eff, NULL, true, auth.uid(), auth.uid());

  UPDATE public."Product" SET cost_price = p_cost_price,
         cost_supplier_name = coalesce((SELECT s.name FROM public.suppliers s WHERE s.id = v_supplier_id), v_supplier)
   WHERE id = p_product_id;

  -- Wrapper reprice (V2.1) handles open-order re-stamp; Paid orders locked.
END;
$$;


ALTER FUNCTION "public"."_pricing_set_supplier"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text", "p_supplier_id" bigint, "p_effective_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_confirm_hub_arrival"("p_batch_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  tracking text;
  arrived  timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT lalamove_tracking_url, hub_arrived_at INTO tracking, arrived
  FROM public.delivery_batches WHERE id = p_batch_id;
  IF tracking IS NULL THEN RAISE EXCEPTION 'Batch not found or no tracking URL.'; END IF;
  IF arrived IS NOT NULL THEN RETURN; END IF;
  IF tracking IS NULL OR trim(tracking) = '' THEN
    RAISE EXCEPTION 'Cannot confirm arrival without a Lalamove tracking URL.';
  END IF;
  UPDATE public.delivery_batches
     SET status = 'arrived_at_hub', hub_arrived_at = now(), updated_at = now()
   WHERE id = p_batch_id;
END;
$$;


ALTER FUNCTION "public"."admin_confirm_hub_arrival"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_confirm_order_arrival"("p_order_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  tracking text;
  arrived  timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT lalamove_tracking_url, supplier_dispatch_completed_at INTO tracking, arrived
  FROM public."Orders" WHERE id = p_order_id;
  IF tracking IS NULL THEN RAISE EXCEPTION 'Order not found or no tracking URL.'; END IF;
  IF arrived IS NOT NULL THEN RETURN; END IF;
  IF trim(tracking) = '' THEN
    RAISE EXCEPTION 'Cannot confirm arrival without a Lalamove tracking URL.';
  END IF;
  UPDATE public."Orders"
     SET supplier_dispatch_completed_at = now(), updated_at = now()
   WHERE id = p_order_id;
END;
$$;


ALTER FUNCTION "public"."admin_confirm_order_arrival"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_mark_order_ready_for_rider"("p_order_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  arrived timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT supplier_dispatch_completed_at INTO arrived
  FROM public."Orders" WHERE id = p_order_id;
  IF arrived IS NULL THEN
    RAISE EXCEPTION 'Order must have arrived at the hub first.';
  END IF;

  UPDATE public."Orders"
     SET ready_for_rider_at = now(), updated_at = now()
   WHERE id = p_order_id;
END;
$$;


ALTER FUNCTION "public"."admin_mark_order_ready_for_rider"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_mark_ready_for_rider"("p_batch_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  cur_status text;
  arrived    timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT status, hub_arrived_at INTO cur_status, arrived
  FROM public.delivery_batches WHERE id = p_batch_id;
  IF cur_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF arrived IS NULL OR cur_status <> 'arrived_at_hub' THEN
    RAISE EXCEPTION 'Batch must have arrived at the hub first.';
  END IF;
  UPDATE public.delivery_batches
     SET ready_for_rider_at = now(), updated_at = now()
   WHERE id = p_batch_id;
END;
$$;


ALTER FUNCTION "public"."admin_mark_ready_for_rider"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_product_first_price_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Seed the first selling price if none exists yet
  IF NOT EXISTS (
      SELECT 1 FROM public.selling_price_history
       WHERE product_id = NEW.id
  ) THEN
    INSERT INTO public.selling_price_history
      (product_id, selling_price, effective_from, is_active, created_by)
    VALUES
      (NEW.id, NEW.price, now(), true, auth.uid());
  END IF;

  -- Seed the first supplier cost only when a cost is provided
  IF NEW.cost_price > 0
     AND NOT EXISTS (
        SELECT 1 FROM public.supplier_price_history
         WHERE product_id = NEW.id
     ) THEN
    INSERT INTO public.supplier_price_history
      (product_id, supplier_name, cost_price, effective_from, is_active, created_by)
    VALUES
      (NEW.id, NEW.cost_supplier_name, NEW.cost_price, now(), true, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_product_first_price_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."freeze_order_pricing"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  it              jsonb;
  item_pos        integer;
  new_item        jsonb;
  items_new       jsonb := '[]'::jsonb;
  weights         jsonb := COALESCE(NEW.supplier_weights, '{}'::jsonb);
  line_qty        numeric;
  line_price      numeric;
  line_cost       numeric;
  selling_total   numeric;
  supplier_total  numeric;
  line_profit     numeric;
  margin_pct      numeric;
  order_revenue   numeric := 0;
  order_cost      numeric := 0;
BEGIN
  -- LOCKED once Paid (snapshot already exists): never touch money again.
  IF COALESCE(NEW.payment_status,'') = 'Paid' AND NEW.pricing_snapshot_timestamp IS NOT NULL THEN
    RETURN NEW;
  END IF;

  FOR it, item_pos IN
    SELECT el, pos - 1
    FROM jsonb_array_elements(COALESCE(NEW.order_items,'[]'::jsonb))
         WITH ORDINALITY AS t(el, pos)
  LOOP
    line_price := COALESCE((it->>'price')::numeric, 0);
    line_cost  := COALESCE((it->>'costPrice')::numeric, 0);

    IF (it->>'pricingType') IN ('per_kg','slice') THEN
      -- weight / whole-fish / slice: use ACTUAL kg from the supplier weight map,
      -- then the item's own weight, then the checkout estimate. Slice count is
      -- deliberately never used for money.
      line_qty := COALESCE((weights ->> item_pos::text)::numeric,
                           (it->>'actual_weight')::numeric,
                           (it->>'actualWeight')::numeric,
                           (it->>'estimatedWeight')::numeric, 0);
    ELSE
      line_qty := COALESCE((it->>'quantity')::numeric, 0);
    END IF;

    selling_total  := round(line_price * line_qty, 2);
    supplier_total := round(line_cost  * line_qty, 2);
    line_profit    := round(selling_total - supplier_total, 2);
    margin_pct     := CASE WHEN selling_total > 0
                       THEN round(line_profit / selling_total * 100, 2) ELSE 0 END;

    new_item := it || jsonb_build_object(
      'selling_price_per_unit',      line_price,
      'supplier_cost_per_unit',      line_cost,
      'actual_weight',               line_qty,
      'selling_total',               selling_total,
      'supplier_total',              supplier_total,
      'gross_profit',                line_profit,
      'profit_margin_percent',       margin_pct,
      'pricing_snapshot_timestamp',  now()
    );

    items_new     := items_new || jsonb_build_array(new_item);
    order_revenue := order_revenue + selling_total;
    order_cost    := order_cost + supplier_total;
  END LOOP;

  NEW.order_items           := items_new;
  NEW.revenue               := round(order_revenue, 2);
  NEW.supplier_cost         := round(order_cost, 2);
  NEW.gross_profit          := round(order_revenue - order_cost, 2);
  NEW.profit_margin_percent := CASE WHEN order_revenue > 0
                                 THEN round((order_revenue - order_cost) / order_revenue * 100, 2)
                                 ELSE 0 END;
  NEW.pricing_snapshot_timestamp := now();
  NEW.frozen_total          := COALESCE(NEW.total, order_revenue);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."freeze_order_pricing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
SELECT EXISTS (
SELECT 1 FROM public.user_roles
WHERE id = auth.uid() AND role = 'admin'
);
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_delivery_rider"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE id = auth.uid()
          AND role = 'delivery_rider'
    );
$$;


ALTER FUNCTION "public"."is_delivery_rider"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_supplier"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
SELECT EXISTS (
SELECT 1 FROM public.user_roles
WHERE id = auth.uid() AND role = 'supplier'
);
$$;


ALTER FUNCTION "public"."is_supplier"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manifest_set_loaded"("p_batch_id" "uuid", "p_order_id" bigint, "p_loaded" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.delivery_batch_manifest (batch_id, order_id, loaded, loaded_at)
  VALUES (p_batch_id, p_order_id, p_loaded, CASE WHEN p_loaded THEN now() ELSE NULL END)
  ON CONFLICT (batch_id, order_id)
  DO UPDATE SET
    loaded      = EXCLUDED.loaded,
    loaded_at   = CASE WHEN EXCLUDED.loaded THEN now() ELSE NULL END,
    updated_at  = now();
END;
$$;


ALTER FUNCTION "public"."manifest_set_loaded"("p_batch_id" "uuid", "p_order_id" bigint, "p_loaded" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manifest_set_packed"("p_batch_id" "uuid", "p_order_id" bigint, "p_packed" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_supplier()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.delivery_batch_manifest (batch_id, order_id, packed, packed_at)
  VALUES (p_batch_id, p_order_id, p_packed, CASE WHEN p_packed THEN now() ELSE NULL END)
  ON CONFLICT (batch_id, order_id)
  DO UPDATE SET
    packed      = EXCLUDED.packed,
    packed_at   = CASE WHEN EXCLUDED.packed THEN now() ELSE NULL END,
    updated_at  = now();
END;
$$;


ALTER FUNCTION "public"."manifest_set_packed"("p_batch_id" "uuid", "p_order_id" bigint, "p_packed" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_combo"("p_id" "text", "p_to_index" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_ids  text[];
  v_new  text[];
  v_cur  integer;
  v_to   integer;
  i      integer;
BEGIN
  IF p_id IS NULL OR p_to_index IS NULL THEN RETURN; END IF;

  SELECT array_agg(id ORDER BY is_pinned DESC, display_order ASC, id ASC)
    INTO v_ids FROM combos;
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN RETURN; END IF;

  v_cur := NULL;
  FOR i IN 1 .. cardinality(v_ids) LOOP
    IF v_ids[i] = p_id THEN v_cur := i - 1; EXIT; END IF;
  END LOOP;
  IF v_cur IS NULL THEN RETURN; END IF;

  v_to := LEAST(GREATEST(p_to_index, 0), cardinality(v_ids) - 1);
  IF v_to = v_cur THEN RETURN; END IF;

  v_new := '{}';
  FOR i IN 1 .. cardinality(v_ids) LOOP
    IF v_ids[i] <> p_id THEN v_new := array_append(v_new, v_ids[i]); END IF;
  END LOOP;
  v_new := v_new[1:v_to] || ARRAY[p_id] || v_new[v_to + 1:];

  FOR i IN 1 .. cardinality(v_new) LOOP
    IF v_new[i] IS DISTINCT FROM v_ids[i] THEN
      UPDATE combos SET display_order = i - 1 WHERE id = v_new[i];
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."move_combo"("p_id" "text", "p_to_index" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_product"("p_id" "text", "p_to_index" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_ids  text[];
  v_new  text[];
  v_cur  integer;
  v_to   integer;
  i      integer;
BEGIN
  IF p_id IS NULL OR p_to_index IS NULL THEN RETURN; END IF;

  SELECT array_agg(id ORDER BY is_pinned DESC, display_order ASC, id ASC)
    INTO v_ids FROM "Product";
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN RETURN; END IF;

  v_cur := NULL;
  FOR i IN 1 .. cardinality(v_ids) LOOP
    IF v_ids[i] = p_id THEN v_cur := i - 1; EXIT; END IF;
  END LOOP;
  IF v_cur IS NULL THEN RETURN; END IF;

  v_to := LEAST(GREATEST(p_to_index, 0), cardinality(v_ids) - 1);
  IF v_to = v_cur THEN RETURN; END IF;

  v_new := '{}';
  FOR i IN 1 .. cardinality(v_ids) LOOP
    IF v_ids[i] <> p_id THEN v_new := array_append(v_new, v_ids[i]); END IF;
  END LOOP;
  v_new := v_new[1:v_to] || ARRAY[p_id] || v_new[v_to + 1:];

  -- Rewrite only the rows whose position actually changed (minimal updates).
  -- display_order is kept dense because every delete path calls
  -- normalize_product_order(), so skipping unchanged positions is safe.
  FOR i IN 1 .. cardinality(v_new) LOOP
    IF v_new[i] IS DISTINCT FROM v_ids[i] THEN
      UPDATE "Product" SET display_order = i - 1 WHERE id = v_new[i];
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."move_product"("p_id" "text", "p_to_index" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_combo_order"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE combos c
  SET display_order = r.rn
  FROM (
    SELECT
id,
row_number() OVER (
ORDER BY
is_pinned DESC,
display_order ASC,
id ASC
)-1 rn
FROM combos
  ) r
  WHERE c.id = r.id AND c.display_order IS DISTINCT FROM r.rn;
END;
$$;


ALTER FUNCTION "public"."normalize_combo_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_product_order"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE "Product" p
  SET display_order = r.rn
  FROM (
    SELECT
id,
row_number() OVER (
ORDER BY
is_pinned DESC,
display_order ASC,
id ASC
)-1 rn
FROM "Product"
  ) r
  WHERE p.id = r.id AND p.display_order IS DISTINCT FROM r.rn;
END;
$$;


ALTER FUNCTION "public"."normalize_product_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_monthly_report_mv"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Non-concurrent: safe inside a function/transaction. For zero-downtime
  -- refreshes from a cron job use `REFRESH MATERIALIZED VIEW CONCURRENTLY`
  -- directly (outside a transaction block); it requires the unique index.
  REFRESH MATERIALIZED VIEW public.mv_sales_summary_monthly;
END;
$$;


ALTER FUNCTION "public"."refresh_monthly_report_mv"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_combos"("p_ids" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  i integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;
  FOR i IN 0 .. cardinality(p_ids) - 1 LOOP
    UPDATE combos SET display_order = i WHERE id = p_ids[i + 1];
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."reorder_combos"("p_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_products"("p_ids" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  i integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;
  FOR i IN 0 .. cardinality(p_ids) - 1 LOOP
    UPDATE "Product" SET display_order = i WHERE id = p_ids[i + 1];
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."reorder_products"("p_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reprice_open_orders_for_product"("p_product_id" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  n          integer := 0;
  v_id       bigint;
  v_items    jsonb;
  v_new      jsonb;
  v_price    numeric;
  v_cost     numeric;
  v_supplier text;
  v_el       jsonb;
  v_pos      integer;
  v_item     jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_supplier()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(
           (SELECT selling_price FROM public.selling_price_history
             WHERE product_id = p_product_id AND is_active
             ORDER BY effective_from DESC LIMIT 1),
           (SELECT price FROM public."Product" WHERE id = p_product_id),
           0) INTO v_price;
  SELECT COALESCE(
           (SELECT cost_price FROM public.supplier_price_history
             WHERE product_id = p_product_id AND is_active
             ORDER BY effective_from DESC LIMIT 1),
           (SELECT cost_price FROM public."Product" WHERE id = p_product_id),
           0) INTO v_cost;
  SELECT COALESCE(
           (SELECT supplier_name FROM public.supplier_price_history
             WHERE product_id = p_product_id AND is_active
             ORDER BY effective_from DESC LIMIT 1),
           (SELECT cost_supplier_name FROM public."Product" WHERE id = p_product_id),
           '') INTO v_supplier;

  FOR v_id, v_items IN
    SELECT o.id, o.order_items
    FROM public."Orders" o
    WHERE COALESCE(o.payment_status,'') <> 'Paid'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(o.order_items,'[]'::jsonb)) it
        WHERE it->>'productId' = p_product_id
      )
  LOOP
    v_new := '[]'::jsonb;
    FOR v_el, v_pos IN
      SELECT el, pos
      FROM jsonb_array_elements(COALESCE(v_items,'[]'::jsonb))
           WITH ORDINALITY AS t(el, pos)
    LOOP
      IF (v_el->>'productId') = p_product_id THEN
        v_item := v_el || jsonb_build_object(
          'price',        v_price,
          'costPrice',    v_cost,
          'supplierName', v_supplier
        );
      ELSE
        v_item := v_el;
      END IF;
      v_new := v_new || jsonb_build_array(v_item);
    END LOOP;

    UPDATE public."Orders" SET order_items = v_new WHERE id = v_id; -- freeze trigger recomputes
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;


ALTER FUNCTION "public"."reprice_open_orders_for_product"("p_product_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rider_complete_batch_if_done"("p_batch_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT (public.is_delivery_rider() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.delivery_batches b
     SET status = 'completed',
         completed_at = now(),
         updated_at   = now()
   WHERE b.id = p_batch_id
     AND b.status IN ('out_for_delivery', 'arrived_at_hub')
     AND (SELECT count(*) FROM "Orders" o WHERE o.delivery_batch_id = p_batch_id) > 0
     AND NOT EXISTS (
       SELECT 1 FROM "Orders" o
       WHERE o.delivery_batch_id = p_batch_id
         AND (o.delivery_status IS DISTINCT FROM 'delivered')
     );
END;
$$;


ALTER FUNCTION "public"."rider_complete_batch_if_done"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rider_receive_order_at_hub"("p_order_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$BEGIN

UPDATE public."Orders"
SET
    supplier_dispatch_completed_at = now(),
    ready_for_rider_at = now(),
    delivery_status = 'pending'
WHERE id = p_order_id;

END;$$;


ALTER FUNCTION "public"."rider_receive_order_at_hub"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rider_start_batch_delivery"("p_batch_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  cur_status  text;
  ready_at    timestamptz;
BEGIN
  IF NOT (public.is_delivery_rider() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT status, ready_for_rider_at INTO cur_status, ready_at
  FROM public.delivery_batches WHERE id = p_batch_id;
  IF cur_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF cur_status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'Batch is already finished';
  END IF;
  IF cur_status <> 'arrived_at_hub' AND ready_at IS NULL THEN
    RAISE EXCEPTION 'Batch is not ready for delivery yet';
  END IF;

  UPDATE public.delivery_batches
     SET status = 'out_for_delivery',
         delivery_started_at = COALESCE(delivery_started_at, now()),
         updated_at = now()
   WHERE id = p_batch_id;
END;
$$;


ALTER FUNCTION "public"."rider_start_batch_delivery"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rider_start_order_delivery"("p_order_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN

UPDATE public."Orders"
SET
    delivery_status='out_for_delivery'
WHERE
    id=p_order_id
AND ready_for_rider_at IS NOT NULL;

END;
$$;


ALTER FUNCTION "public"."rider_start_order_delivery"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rider_update_delivery_status"("p_order_id" bigint, "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN

IF p_status NOT IN (
'pending',
'out_for_delivery',
'delivered'
)
THEN
RAISE EXCEPTION 'Invalid status';
END IF;

UPDATE public."Orders"
SET

delivery_status=p_status,

delivered_at=
CASE
WHEN p_status='delivered'
THEN now()
ELSE delivered_at
END

WHERE id=p_order_id;

END;
$$;


ALTER FUNCTION "public"."rider_update_delivery_status"("p_order_id" bigint, "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_product_selling_price"("p_product_id" "text", "p_selling_price" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM public._pricing_set_selling(p_product_id, p_selling_price, now());
  PERFORM public.reprice_open_orders_for_product(p_product_id);
END;
$$;


ALTER FUNCTION "public"."set_product_selling_price"("p_product_id" "text", "p_selling_price" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_product_selling_price_at"("p_product_id" "text", "p_selling_price" numeric, "p_effective_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM public._pricing_set_selling(p_product_id, p_selling_price, p_effective_at);
  PERFORM public.reprice_open_orders_for_product(p_product_id);
END;
$$;


ALTER FUNCTION "public"."set_product_selling_price_at"("p_product_id" "text", "p_selling_price" numeric, "p_effective_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_product_supplier_price"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM public._pricing_set_supplier(p_product_id, p_cost_price, p_supplier_name, NULL, now());
  PERFORM public.reprice_open_orders_for_product(p_product_id);
END;
$$;


ALTER FUNCTION "public"."set_product_supplier_price"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_product_supplier_price_at"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text", "p_supplier_id" bigint, "p_effective_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM public._pricing_set_supplier(p_product_id, p_cost_price, p_supplier_name, p_supplier_id, p_effective_at);
  PERFORM public.reprice_open_orders_for_product(p_product_id);
END;
$$;


ALTER FUNCTION "public"."set_product_supplier_price_at"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text", "p_supplier_id" bigint, "p_effective_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."supplier_book_lalamove"("p_batch_id" "uuid", "p_tracking_url" "text", "p_booking_reference" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  cur_status    text;
  packed_at     timestamptz;
BEGIN
  IF NOT (public.is_supplier() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_tracking_url IS NULL OR trim(p_tracking_url) = '' THEN
    RAISE EXCEPTION 'Tracking URL is required.';
  END IF;
  IF p_tracking_url NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Tracking URL must start with https://';
  END IF;

  SELECT status, packing_completed_at INTO cur_status, packed_at
  FROM public.delivery_batches WHERE id = p_batch_id;
  IF cur_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF packed_at IS NULL THEN
    RAISE EXCEPTION 'Packing must be completed before booking Lalamove.';
  END IF;

  UPDATE public.delivery_batches
     SET lalamove_tracking_url = trim(p_tracking_url),
         booking_reference    = nullif(p_booking_reference, ''),
         lalamove_booked_at   = now(),
         status               = 'in_transit_to_hub',
         updated_at           = now()
   WHERE id = p_batch_id;
END;
$$;


ALTER FUNCTION "public"."supplier_book_lalamove"("p_batch_id" "uuid", "p_tracking_url" "text", "p_booking_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."supplier_book_lalamove_order"("p_order_id" bigint, "p_tracking_url" "text", "p_booking_reference" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  packed_at timestamptz;
BEGIN
  IF NOT (public.is_supplier() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_tracking_url IS NULL OR trim(p_tracking_url) = '' THEN
    RAISE EXCEPTION 'Tracking URL is required.';
  END IF;
  IF p_tracking_url NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Tracking URL must start with https://';
  END IF;

  SELECT packing_completed_at INTO packed_at
  FROM public."Orders" WHERE id = p_order_id;
  IF packed_at IS NULL THEN
    RAISE EXCEPTION 'Packing must be completed before booking Lalamove.';
  END IF;

  UPDATE public."Orders"
     SET lalamove_tracking_url = trim(p_tracking_url),
         booking_reference    = nullif(p_booking_reference, ''),
         lalamove_booked_at   = now(),
         supplier_dispatch_started_at = now(),
         updated_at           = now()
   WHERE id = p_order_id;
END;
$$;


ALTER FUNCTION "public"."supplier_book_lalamove_order"("p_order_id" bigint, "p_tracking_url" "text", "p_booking_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."supplier_complete_packing"("p_batch_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  cur_status text;
  started    timestamptz;
  completed  timestamptz;
BEGIN
  IF NOT (public.is_supplier() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT status, packing_started_at, packing_completed_at
    INTO cur_status, started, completed
  FROM public.delivery_batches WHERE id = p_batch_id;
  IF cur_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF completed IS NOT NULL THEN RETURN; END IF;
  IF started IS NULL OR cur_status NOT IN ('packing', 'awaiting_lalamove') THEN
    RAISE EXCEPTION 'Packing must be started first.';
  END IF;
  UPDATE public.delivery_batches
     SET status = 'awaiting_lalamove', packing_completed_at = now(), updated_at = now()
   WHERE id = p_batch_id;
END;
$$;


ALTER FUNCTION "public"."supplier_complete_packing"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."supplier_complete_packing_order"("p_order_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  started   timestamptz;
  completed timestamptz;
BEGIN
  IF NOT (public.is_supplier() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT packing_started_at, packing_completed_at INTO started, completed
  FROM public."Orders" WHERE id = p_order_id;
  IF started IS NULL THEN RAISE EXCEPTION 'Order not found or packing not started.'; END IF;
  IF completed IS NOT NULL THEN RETURN; END IF;
  UPDATE public."Orders"
     SET packing_completed_at = now(), updated_at = now()
   WHERE id = p_order_id;
END;
$$;


ALTER FUNCTION "public"."supplier_complete_packing_order"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."supplier_start_packing"("p_batch_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  cur_status text;
  started    timestamptz;
BEGIN
  IF NOT (public.is_supplier() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT status, packing_started_at INTO cur_status, started
  FROM public.delivery_batches WHERE id = p_batch_id;
  IF cur_status IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF started IS NOT NULL THEN RETURN; END IF; -- already started
  IF cur_status NOT IN ('pending','packing') THEN
    RAISE EXCEPTION 'Cannot start packing now.';
  END IF;
  UPDATE public.delivery_batches
     SET status = 'packing', packing_started_at = now(), updated_at = now()
   WHERE id = p_batch_id;
END;
$$;


ALTER FUNCTION "public"."supplier_start_packing"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."supplier_start_packing_order"("p_order_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  started timestamptz;
  paid    text;
BEGIN
  IF NOT (public.is_supplier() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT packing_started_at, payment_status INTO started, paid
  FROM public."Orders" WHERE id = p_order_id;
  IF paid IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF started IS NOT NULL THEN RETURN; END IF;
  IF paid <> 'Paid' THEN
    RAISE EXCEPTION 'Order must be Paid before packing.';
  END IF;
  UPDATE public."Orders"
     SET packing_started_at = now(), updated_at = now()
   WHERE id = p_order_id;
END;
$$;


ALTER FUNCTION "public"."supplier_start_packing_order"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = coalesce(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tracking_rider_name"("p_delivery_date" "date") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  rider_name text;
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM "Orders"
      WHERE user_id = auth.uid()
        AND delivery_date = p_delivery_date
    )
    OR public.is_admin()
    OR public.is_delivery_rider()
  ) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    NULLIF(au.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(au.raw_user_meta_data ->> 'name', ''),
    au.email
  )
  INTO rider_name
  FROM public.delivery_assignments da
  JOIN auth.users au ON au.id = da.rider_id
  WHERE da.delivery_date = p_delivery_date
  ORDER BY da.id
  LIMIT 1;

  RETURN rider_name;
END;
$$;


ALTER FUNCTION "public"."tracking_rider_name"("p_delivery_date" "date") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."Orders" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "phone_number" "text" DEFAULT ''::"text" NOT NULL,
    "email_address" "text" DEFAULT ''::"text" NOT NULL,
    "street_address" "text" DEFAULT ''::"text" NOT NULL,
    "postcode" "text" DEFAULT ''::"text" NOT NULL,
    "city" "text" DEFAULT ''::"text" NOT NULL,
    "state" "text" DEFAULT 'Selangor'::"text" NOT NULL,
    "order_notes" "text",
    "item_options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "order_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "delivery_slot" "text" DEFAULT ''::"text" NOT NULL,
    "order_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "subtotal" numeric(10,2) DEFAULT 0 NOT NULL,
    "delivery_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) DEFAULT 0 NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "supplier_weights" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone,
    "updated_by" "uuid",
    "payment_status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "paid_by" "uuid",
    "apartment" "text" DEFAULT ''::"text" NOT NULL,
    "house_unit" "text" DEFAULT ''::"text" NOT NULL,
    "pickup_location" "text" DEFAULT ''::"text" NOT NULL,
    "delivery_point_name" "text",
    "delivery_method" "text",
    "delivery_batch_id" "uuid",
    "packing_started_at" timestamp with time zone,
    "packing_completed_at" timestamp with time zone,
    "supplier_dispatch_started_at" timestamp with time zone,
    "supplier_dispatch_completed_at" timestamp with time zone,
    "ready_for_rider_at" timestamp with time zone,
    "lalamove_tracking_url" "text",
    "booking_reference" "text",
    "lalamove_booked_at" timestamp with time zone,
    "delivery_status" "text",
    "delivered_at" timestamp with time zone,
    "gross_profit" numeric(10,2) DEFAULT 0 NOT NULL,
    "revenue" numeric(12,2) DEFAULT 0 NOT NULL,
    "supplier_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "profit_margin_percent" numeric(8,2) DEFAULT 0 NOT NULL,
    "pricing_snapshot_timestamp" timestamp with time zone,
    "frozen_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'MYR'::"text" NOT NULL
);


ALTER TABLE "public"."Orders" OWNER TO "postgres";


COMMENT ON TABLE "public"."Orders" IS 'This will store customers orders';



COMMENT ON COLUMN "public"."Orders"."revenue" IS 'Gross revenue of line items (excl. delivery fee). Frozen at checkout / weight-confirm.';



COMMENT ON COLUMN "public"."Orders"."supplier_cost" IS 'Total supplier cost of line items. Frozen — never recomputed from Product.';



COMMENT ON COLUMN "public"."Orders"."profit_margin_percent" IS 'Gross margin %% (gross_profit / revenue). Frozen.';



COMMENT ON COLUMN "public"."Orders"."pricing_snapshot_timestamp" IS 'When the current frozen financial snapshot was captured.';



ALTER TABLE "public"."Orders" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Orders_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Product" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "name_ms" "text" NOT NULL,
    "category" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "unit" "text" NOT NULL,
    "price_note" "text",
    "weight" "text",
    "quantity" integer DEFAULT 0 NOT NULL,
    "description" "text" NOT NULL,
    "long_description" "text" NOT NULL,
    "image" "text" NOT NULL,
    "images" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "freshness" "text" DEFAULT 'available'::"text" NOT NULL,
    "preparation_options" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "vendor_id" "text" NOT NULL,
    "vendor_name" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_popular" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ordering_mode" "text" DEFAULT 'fixed_quantity'::"text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "slice_unit" "text" DEFAULT 'slice'::"text" NOT NULL,
    "min_slice" integer DEFAULT 1 NOT NULL,
    "max_slice" integer DEFAULT 20 NOT NULL,
    "default_slice" integer DEFAULT 2 NOT NULL,
    "slice_increment" integer DEFAULT 1 NOT NULL,
    "slice_instruction" "text" DEFAULT ''::"text" NOT NULL,
    "cost_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "cost_supplier_name" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "Product_category_check" CHECK (("category" = ANY (ARRAY['chicken'::"text", 'fish'::"text", 'prawns'::"text", 'squid'::"text", 'combo'::"text"]))),
    CONSTRAINT "Product_freshness_check" CHECK (("freshness" = ANY (ARRAY['available'::"text", 'limited'::"text", 'sold-out'::"text"]))),
    CONSTRAINT "chk_product_slice_limits" CHECK ((("min_slice" >= 1) AND ("max_slice" >= "min_slice") AND ("slice_increment" >= 1)))
);


ALTER TABLE "public"."Product" OWNER TO "postgres";


COMMENT ON COLUMN "public"."Product"."cost_price" IS 'DEPRECATED v1 compatibility mirror. Source of truth is supplier_price_history active row. Never used for reports.';



COMMENT ON COLUMN "public"."Product"."cost_supplier_name" IS 'DEPRECATED v1 compatibility mirror. New code uses suppliers / supplier_id.';



CREATE TABLE IF NOT EXISTS "public"."combo_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "combo_id" "text" NOT NULL,
    "product_id" "text" NOT NULL,
    "quantity_value" numeric(10,2) DEFAULT 1.00 NOT NULL,
    "selling_unit" "text" DEFAULT 'piece'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "custom_label" "text",
    "preparation" "text",
    "unit" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "combo_items_selling_unit_check" CHECK (("selling_unit" = ANY (ARRAY['piece'::"text", 'kg'::"text", 'pack'::"text"])))
);


ALTER TABLE "public"."combo_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."combos" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "name_ms" "text" DEFAULT ''::"text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "badge" "text" DEFAULT 'Best Value'::"text" NOT NULL,
    "category_label" "text" DEFAULT 'Signature Bundle'::"text" NOT NULL,
    "tagline" "text" DEFAULT ''::"text" NOT NULL,
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "original_value" numeric(10,2) DEFAULT 0 NOT NULL,
    "image" "text" DEFAULT ''::"text" NOT NULL,
    "images" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "servings" integer DEFAULT 4 NOT NULL,
    "highlights" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "featured" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."combos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "email_address" "text",
    "address" "text",
    "postcode" "text",
    "city" "text",
    "state" "text",
    "apartment" "text",
    "house_unit" "text",
    "pickup_location" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_batch_manifest" (
    "id" bigint NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "order_id" bigint NOT NULL,
    "packed" boolean DEFAULT false NOT NULL,
    "loaded" boolean DEFAULT false NOT NULL,
    "packed_at" timestamp with time zone,
    "loaded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."delivery_batch_manifest" OWNER TO "postgres";


ALTER TABLE "public"."delivery_batch_manifest" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."delivery_batch_manifest_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."delivery_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_code" "text" NOT NULL,
    "delivery_date" "date" NOT NULL,
    "supplier_name" "text",
    "supplier_notes" "text",
    "hub_name" "text" DEFAULT 'Residensi Rimbun'::"text" NOT NULL,
    "lalamove_tracking_url" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "packing_started_at" timestamp with time zone,
    "packing_completed_at" timestamp with time zone,
    "lalamove_booked_at" timestamp with time zone,
    "hub_arrived_at" timestamp with time zone,
    "ready_for_rider_at" timestamp with time zone,
    "booking_reference" "text",
    "delivery_started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    CONSTRAINT "delivery_batches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'packing'::"text", 'awaiting_lalamove'::"text", 'in_transit_to_hub'::"text", 'arrived_at_hub'::"text", 'out_for_delivery'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."delivery_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_points" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "delivery_fee" numeric(10,2) DEFAULT 2 NOT NULL,
    "delivery_method" "public"."delivery_method" DEFAULT 'Customer Come Down'::"public"."delivery_method" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "area" "text",
    "pickup_notes" "text",
    "latitude" numeric(10,8),
    "longitude" numeric(11,8)
);


ALTER TABLE "public"."delivery_points" OWNER TO "postgres";


ALTER TABLE "public"."delivery_points" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."delivery_points_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."historical_business_daily" (
    "id" bigint NOT NULL,
    "business_date" "date" NOT NULL,
    "order_count" integer DEFAULT 0 NOT NULL,
    "revenue_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "supplier_cost_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "delivery_income_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "gross_profit_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'historical_import'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "historical_business_daily_delivery_income_amount_check" CHECK (("delivery_income_amount" >= (0)::numeric)),
    CONSTRAINT "historical_business_daily_order_count_check" CHECK (("order_count" >= 0)),
    CONSTRAINT "historical_business_daily_revenue_amount_check" CHECK (("revenue_amount" >= (0)::numeric)),
    CONSTRAINT "historical_business_daily_supplier_cost_amount_check" CHECK (("supplier_cost_amount" >= (0)::numeric))
);


ALTER TABLE "public"."historical_business_daily" OWNER TO "postgres";


ALTER TABLE "public"."historical_business_daily" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."historical_business_daily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."vw_order_item_flat" AS
 SELECT "o"."id" AS "order_id",
    "o"."created_at" AS "order_created_at",
    ("o"."created_at")::"date" AS "order_date",
    "o"."delivery_slot",
    COALESCE("o"."payment_status", ''::"text") AS "payment_status",
    ("o"."order_summary" ->> 'status'::"text") AS "order_status",
    "t"."pos" AS "item_index",
    ("t"."it" ->> 'productId'::"text") AS "product_id",
    COALESCE(("t"."it" ->> 'name'::"text"), ''::"text") AS "product_name",
    COALESCE("p"."category", ("t"."it" ->> 'category'::"text"), 'Others'::"text") AS "category",
    COALESCE(("t"."it" ->> 'supplierName'::"text"), "p"."vendor_name", 'Unknown'::"text") AS "supplier_name",
    ("t"."it" ->> 'pricingType'::"text") AS "pricing_type",
    COALESCE((("t"."it" ->> 'selling_price_per_unit'::"text"))::numeric, (("t"."it" ->> 'price'::"text"))::numeric, (0)::numeric) AS "selling_price_per_unit",
    COALESCE((("t"."it" ->> 'supplier_cost_per_unit'::"text"))::numeric, (("t"."it" ->> 'costPrice'::"text"))::numeric, (0)::numeric) AS "supplier_cost_per_unit",
    COALESCE((("t"."it" ->> 'actual_weight'::"text"))::numeric,
        CASE
            WHEN (("t"."it" ->> 'pricingType'::"text") = ANY (ARRAY['per_kg'::"text", 'slice'::"text"])) THEN (("t"."it" ->> 'actualWeight'::"text"))::numeric
            ELSE NULL::numeric
        END, (0)::numeric) AS "actual_weight",
        CASE
            WHEN (("t"."it" ->> 'pricingType'::"text") = ANY (ARRAY['per_kg'::"text", 'slice'::"text"])) THEN COALESCE((("t"."it" ->> 'actual_weight'::"text"))::numeric, (("t"."it" ->> 'actualWeight'::"text"))::numeric, (("t"."it" ->> 'estimatedWeight'::"text"))::numeric, (0)::numeric)
            ELSE COALESCE((("t"."it" ->> 'quantity'::"text"))::numeric, (0)::numeric)
        END AS "qty_sold",
    COALESCE((("t"."it" ->> 'selling_total'::"text"))::numeric, "public"."_line_selling"("t"."it")) AS "selling_total",
    COALESCE((("t"."it" ->> 'supplier_total'::"text"))::numeric, "public"."_line_cost"("t"."it")) AS "supplier_total",
    COALESCE((("t"."it" ->> 'gross_profit'::"text"))::numeric, "public"."_line_profit"("t"."it")) AS "gross_profit",
    COALESCE((("t"."it" ->> 'profit_margin_percent'::"text"))::numeric, "public"."_line_margin"("t"."it")) AS "profit_margin_percent"
   FROM (("public"."Orders" "o"
     CROSS JOIN LATERAL "jsonb_array_elements"(COALESCE("o"."order_items", '[]'::"jsonb")) WITH ORDINALITY "t"("it", "pos"))
     LEFT JOIN "public"."Product" "p" ON (("p"."id" = ("t"."it" ->> 'productId'::"text"))));


ALTER VIEW "public"."vw_order_item_flat" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_sales_summary_monthly" AS
 SELECT "to_char"(("order_date")::timestamp with time zone, 'YYYY-MM'::"text") AS "report_month",
    "count"(DISTINCT "order_id") AS "order_count",
    "round"("sum"("qty_sold"), 2) AS "quantity_sold",
    "round"("sum"("selling_total"), 2) AS "revenue",
    "round"("sum"("supplier_total"), 2) AS "supplier_cost",
    "round"("sum"("gross_profit"), 2) AS "profit",
    "round"(
        CASE
            WHEN ("sum"("selling_total") > (0)::numeric) THEN (("sum"("gross_profit") / "sum"("selling_total")) * (100)::numeric)
            ELSE (0)::numeric
        END, 2) AS "margin_percent",
    "round"(("sum"("selling_total") / NULLIF("sum"("qty_sold"), (0)::numeric)), 2) AS "avg_selling_price",
    "round"(("sum"("supplier_total") / NULLIF("sum"("qty_sold"), (0)::numeric)), 2) AS "avg_supplier_cost",
    "round"(("sum"("gross_profit") / NULLIF("sum"("qty_sold"), (0)::numeric)), 2) AS "avg_profit"
   FROM "public"."vw_order_item_flat"
  GROUP BY ("to_char"(("order_date")::timestamp with time zone, 'YYYY-MM'::"text"));


ALTER VIEW "public"."vw_sales_summary_monthly" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."mv_sales_summary_monthly" AS
 SELECT "report_month",
    "order_count",
    "quantity_sold",
    "revenue",
    "supplier_cost",
    "profit",
    "margin_percent",
    "avg_selling_price",
    "avg_supplier_cost",
    "avg_profit"
   FROM "public"."vw_sales_summary_monthly"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."mv_sales_summary_monthly" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."selling_price_history" (
    "id" bigint NOT NULL,
    "product_id" "text" NOT NULL,
    "selling_price" numeric(10,2) NOT NULL,
    "effective_from" timestamp with time zone DEFAULT CURRENT_DATE NOT NULL,
    "effective_to" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "chk_selling_price_positive" CHECK (("selling_price" >= (0)::numeric)),
    CONSTRAINT "chk_selling_price_range" CHECK ((("effective_to" IS NULL) OR ("effective_from" <= "effective_to")))
);


ALTER TABLE "public"."selling_price_history" OWNER TO "postgres";


ALTER TABLE "public"."selling_price_history" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."selling_price_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."site_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."site_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_price_history" (
    "id" bigint NOT NULL,
    "product_id" "text" NOT NULL,
    "supplier_id" bigint,
    "supplier_name" "text",
    "cost_price" numeric(10,2) NOT NULL,
    "effective_from" timestamp with time zone DEFAULT CURRENT_DATE NOT NULL,
    "effective_to" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "chk_supplier_price_positive" CHECK (("cost_price" >= (0)::numeric)),
    CONSTRAINT "chk_supplier_price_range" CHECK ((("effective_to" IS NULL) OR ("effective_from" <= "effective_to")))
);


ALTER TABLE "public"."supplier_price_history" OWNER TO "postgres";


COMMENT ON COLUMN "public"."supplier_price_history"."supplier_name" IS 'Deprecated v1-compat alias of supplier_id. Do NOT use for new logic.';



ALTER TABLE "public"."supplier_price_history" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."supplier_price_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."supplier_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "vendor_id" "text" DEFAULT ''::"text" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."supplier_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "contact_person" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" DEFAULT 'MYR'::"text" NOT NULL,
    "payment_terms" "text",
    "tax_id" "text",
    "account_ref" "text"
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


ALTER TABLE "public"."suppliers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."suppliers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_category_profit" AS
 SELECT "category",
    "count"(DISTINCT "order_id") AS "order_count",
    "round"("sum"("qty_sold"), 2) AS "quantity_sold",
    "round"("sum"("selling_total"), 2) AS "revenue",
    "round"("sum"("supplier_total"), 2) AS "supplier_cost",
    "round"("sum"("gross_profit"), 2) AS "profit",
    "round"(
        CASE
            WHEN ("sum"("selling_total") > (0)::numeric) THEN (("sum"("gross_profit") / "sum"("selling_total")) * (100)::numeric)
            ELSE (0)::numeric
        END, 2) AS "margin_percent"
   FROM "public"."vw_order_item_flat"
  GROUP BY "category";


ALTER VIEW "public"."vw_category_profit" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_product_profit" AS
 SELECT "product_id",
    "max"("product_name") AS "product_name",
    "max"("category") AS "category",
    "count"(DISTINCT "order_id") AS "order_count",
    "round"("sum"("qty_sold"), 2) AS "quantity_sold",
    "round"("avg"(
        CASE
            WHEN ("pricing_type" = ANY (ARRAY['per_kg'::"text", 'slice'::"text"])) THEN "actual_weight"
            ELSE NULL::numeric
        END), 3) AS "avg_weight",
    "round"("avg"("selling_price_per_unit"), 2) AS "avg_selling_price",
    "round"("avg"("supplier_cost_per_unit"), 2) AS "avg_supplier_cost",
    "round"(("sum"("gross_profit") / NULLIF("sum"("qty_sold"), (0)::numeric)), 2) AS "avg_profit",
    "round"("sum"("selling_total"), 2) AS "revenue",
    "round"("sum"("supplier_total"), 2) AS "supplier_cost",
    "round"("sum"("gross_profit"), 2) AS "profit",
    "round"(
        CASE
            WHEN ("sum"("selling_total") > (0)::numeric) THEN (("sum"("gross_profit") / "sum"("selling_total")) * (100)::numeric)
            ELSE (0)::numeric
        END, 2) AS "margin_percent"
   FROM "public"."vw_order_item_flat"
  GROUP BY "product_id";


ALTER VIEW "public"."vw_product_profit" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_dashboard_kpis" AS
 SELECT ( SELECT "round"("sum"("vw_order_item_flat"."selling_total"), 2) AS "round"
           FROM "public"."vw_order_item_flat"
          WHERE ("vw_order_item_flat"."order_date" = CURRENT_DATE)) AS "today_revenue",
    ( SELECT "round"("sum"("vw_order_item_flat"."supplier_total"), 2) AS "round"
           FROM "public"."vw_order_item_flat"
          WHERE ("vw_order_item_flat"."order_date" = CURRENT_DATE)) AS "today_supplier_cost",
    ( SELECT "round"("sum"("vw_order_item_flat"."gross_profit"), 2) AS "round"
           FROM "public"."vw_order_item_flat"
          WHERE ("vw_order_item_flat"."order_date" = CURRENT_DATE)) AS "today_profit",
    ( SELECT "round"(
                CASE
                    WHEN ("sum"("vw_order_item_flat"."selling_total") > (0)::numeric) THEN (("sum"("vw_order_item_flat"."gross_profit") / "sum"("vw_order_item_flat"."selling_total")) * (100)::numeric)
                    ELSE (0)::numeric
                END, 2) AS "round"
           FROM "public"."vw_order_item_flat"
          WHERE ("vw_order_item_flat"."order_date" = CURRENT_DATE)) AS "today_margin_percent",
    ( SELECT "round"("sum"("vw_order_item_flat"."selling_total"), 2) AS "round"
           FROM "public"."vw_order_item_flat"
          WHERE ("to_char"(("vw_order_item_flat"."order_date")::timestamp with time zone, 'YYYY-MM'::"text") = "to_char"((CURRENT_DATE)::timestamp with time zone, 'YYYY-MM'::"text"))) AS "monthly_revenue",
    ( SELECT "round"("sum"("vw_order_item_flat"."gross_profit"), 2) AS "round"
           FROM "public"."vw_order_item_flat"
          WHERE ("to_char"(("vw_order_item_flat"."order_date")::timestamp with time zone, 'YYYY-MM'::"text") = "to_char"((CURRENT_DATE)::timestamp with time zone, 'YYYY-MM'::"text"))) AS "monthly_profit",
    ( SELECT "round"("avg"("Orders"."total"), 2) AS "round"
           FROM "public"."Orders"
          WHERE ("Orders"."created_at" >= (CURRENT_DATE - '30 days'::interval))) AS "avg_order_value_30d",
    ( SELECT "vw_product_profit"."product_name"
           FROM "public"."vw_product_profit"
          ORDER BY "vw_product_profit"."revenue" DESC
         LIMIT 1) AS "top_selling_product",
    ( SELECT "vw_product_profit"."product_name"
           FROM "public"."vw_product_profit"
          ORDER BY "vw_product_profit"."profit" DESC
         LIMIT 1) AS "most_profitable_product",
    ( SELECT "vw_category_profit"."category"
           FROM "public"."vw_category_profit"
          ORDER BY "vw_category_profit"."profit" DESC
         LIMIT 1) AS "most_profitable_category";


ALTER VIEW "public"."vw_dashboard_kpis" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_order_profit" AS
 SELECT "f"."order_id",
    ("max"("o"."created_at"))::"date" AS "order_date",
    "max"(("o"."order_summary" ->> 'status'::"text")) AS "order_status",
    "max"(COALESCE("o"."payment_status", ''::"text")) AS "payment_status",
    "max"("o"."full_name") AS "customer_name",
    "count"(*) AS "item_count",
    "round"("sum"("f"."selling_total"), 2) AS "revenue",
    "round"("sum"("f"."supplier_total"), 2) AS "supplier_cost",
    "round"("sum"("f"."gross_profit"), 2) AS "gross_profit",
    "round"(
        CASE
            WHEN ("sum"("f"."selling_total") > (0)::numeric) THEN (("sum"("f"."gross_profit") / "sum"("f"."selling_total")) * (100)::numeric)
            ELSE (0)::numeric
        END, 2) AS "margin_percent",
    "max"("o"."delivery_fee") AS "delivery_fee",
    "max"("o"."total") AS "total"
   FROM ("public"."vw_order_item_flat" "f"
     JOIN "public"."Orders" "o" ON (("o"."id" = "f"."order_id")))
  GROUP BY "f"."order_id";


ALTER VIEW "public"."vw_order_profit" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_sales_summary_daily" AS
 SELECT "order_date" AS "report_date",
    "count"(DISTINCT "order_id") AS "order_count",
    "round"("sum"("qty_sold"), 2) AS "quantity_sold",
    "round"("sum"("selling_total"), 2) AS "revenue",
    "round"("sum"("supplier_total"), 2) AS "supplier_cost",
    "round"("sum"("gross_profit"), 2) AS "profit",
    "round"(
        CASE
            WHEN ("sum"("selling_total") > (0)::numeric) THEN (("sum"("gross_profit") / "sum"("selling_total")) * (100)::numeric)
            ELSE (0)::numeric
        END, 2) AS "margin_percent",
    "round"(("sum"("selling_total") / NULLIF("sum"("qty_sold"), (0)::numeric)), 2) AS "avg_selling_price",
    "round"(("sum"("supplier_total") / NULLIF("sum"("qty_sold"), (0)::numeric)), 2) AS "avg_supplier_cost",
    "round"(("sum"("gross_profit") / NULLIF("sum"("qty_sold"), (0)::numeric)), 2) AS "avg_profit"
   FROM "public"."vw_order_item_flat"
  GROUP BY "order_date";


ALTER VIEW "public"."vw_sales_summary_daily" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_supplier_profit" AS
 SELECT "supplier_name",
    "count"(DISTINCT "order_id") AS "order_count",
    "count"(DISTINCT "product_id") AS "products_sold",
    "round"("sum"("selling_total"), 2) AS "revenue",
    "round"("sum"("supplier_total"), 2) AS "supplier_cost",
    "round"("sum"("gross_profit"), 2) AS "profit",
    "round"(
        CASE
            WHEN ("sum"("selling_total") > (0)::numeric) THEN (("sum"("gross_profit") / "sum"("selling_total")) * (100)::numeric)
            ELSE (0)::numeric
        END, 2) AS "avg_margin_percent"
   FROM "public"."vw_order_item_flat"
  GROUP BY "supplier_name";


ALTER VIEW "public"."vw_supplier_profit" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_top_products" AS
 SELECT "product_id",
    "product_name",
    "category",
    "order_count",
    "quantity_sold",
    "revenue",
    "supplier_cost",
    "profit",
    "margin_percent"
   FROM "public"."vw_product_profit"
  ORDER BY "revenue" DESC
 LIMIT 10;


ALTER VIEW "public"."vw_top_products" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_top_profit_products" AS
 SELECT "product_id",
    "product_name",
    "category",
    "order_count",
    "quantity_sold",
    "revenue",
    "supplier_cost",
    "profit",
    "margin_percent"
   FROM "public"."vw_product_profit"
  ORDER BY "profit" DESC
 LIMIT 10;


ALTER VIEW "public"."vw_top_profit_products" OWNER TO "postgres";


ALTER TABLE ONLY "public"."Orders"
    ADD CONSTRAINT "Orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."combo_items"
    ADD CONSTRAINT "combo_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."combos"
    ADD CONSTRAINT "combos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."combos"
    ADD CONSTRAINT "combos_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."customer_profiles"
    ADD CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_batch_manifest"
    ADD CONSTRAINT "delivery_batch_manifest_batch_id_order_id_key" UNIQUE ("batch_id", "order_id");



ALTER TABLE ONLY "public"."delivery_batch_manifest"
    ADD CONSTRAINT "delivery_batch_manifest_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_batches"
    ADD CONSTRAINT "delivery_batches_batch_code_key" UNIQUE ("batch_code");



ALTER TABLE ONLY "public"."delivery_batches"
    ADD CONSTRAINT "delivery_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_points"
    ADD CONSTRAINT "delivery_points_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."delivery_points"
    ADD CONSTRAINT "delivery_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historical_business_daily"
    ADD CONSTRAINT "historical_business_daily_business_date_key" UNIQUE ("business_date");



ALTER TABLE ONLY "public"."historical_business_daily"
    ADD CONSTRAINT "historical_business_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."selling_price_history"
    ADD CONSTRAINT "selling_price_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."supplier_price_history"
    ADD CONSTRAINT "supplier_price_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_profiles"
    ADD CONSTRAINT "supplier_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_profiles"
    ADD CONSTRAINT "supplier_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "combos_single_featured" ON "public"."combos" USING "btree" ("featured") WHERE "featured";



CREATE INDEX "idx_combo_items_combo_id" ON "public"."combo_items" USING "btree" ("combo_id");



CREATE INDEX "idx_combo_items_product_id" ON "public"."combo_items" USING "btree" ("product_id");



CREATE INDEX "idx_combos_active" ON "public"."combos" USING "btree" ("active");



CREATE INDEX "idx_combos_display_order" ON "public"."combos" USING "btree" ("display_order");



CREATE INDEX "idx_combos_featured" ON "public"."combos" USING "btree" ("featured");



CREATE INDEX "idx_combos_featured_active" ON "public"."combos" USING "btree" ("featured", "active", "updated_at" DESC);



CREATE INDEX "idx_combos_is_pinned" ON "public"."combos" USING "btree" ("is_pinned" DESC, "display_order");



CREATE INDEX "idx_combos_slug" ON "public"."combos" USING "btree" ("slug");



CREATE INDEX "idx_delivery_batches_date" ON "public"."delivery_batches" USING "btree" ("delivery_date" DESC);



CREATE INDEX "idx_manifest_batch" ON "public"."delivery_batch_manifest" USING "btree" ("batch_id");



CREATE INDEX "idx_orders_created_at" ON "public"."Orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orders_currency" ON "public"."Orders" USING "btree" ("currency");



CREATE INDEX "idx_orders_delivery_batch_id" ON "public"."Orders" USING "btree" ("delivery_batch_id");



CREATE INDEX "idx_orders_delivery_slot_created" ON "public"."Orders" USING "btree" ("delivery_slot", "created_at" DESC);



CREATE INDEX "idx_orders_payment_status_created" ON "public"."Orders" USING "btree" ("payment_status", "created_at" DESC);



CREATE INDEX "idx_orders_status" ON "public"."Orders" USING "btree" ((("order_summary" ->> 'status'::"text")));



CREATE INDEX "idx_product_category" ON "public"."Product" USING "btree" ("category");



CREATE INDEX "idx_product_display_order" ON "public"."Product" USING "btree" ("display_order");



CREATE INDEX "idx_product_is_pinned" ON "public"."Product" USING "btree" ("is_pinned" DESC, "display_order");



CREATE INDEX "idx_product_vendor_id" ON "public"."Product" USING "btree" ("vendor_id");



CREATE INDEX "idx_selling_price_history_eff" ON "public"."selling_price_history" USING "btree" ("effective_from");



CREATE INDEX "idx_supplier_price_history_eff" ON "public"."supplier_price_history" USING "btree" ("effective_from");



CREATE INDEX "idx_suppliers_currency" ON "public"."suppliers" USING "btree" ("currency");



CREATE UNIQUE INDEX "mv_sales_summary_monthly_pk" ON "public"."mv_sales_summary_monthly" USING "btree" ("report_month");



CREATE UNIQUE INDEX "selling_price_history_active_uniq" ON "public"."selling_price_history" USING "btree" ("product_id") WHERE ("is_active" = true);



CREATE INDEX "selling_price_history_created_idx" ON "public"."selling_price_history" USING "btree" ("created_at" DESC);



CREATE INDEX "selling_price_history_eff_idx" ON "public"."selling_price_history" USING "btree" ("effective_from");



CREATE INDEX "selling_price_history_product_idx" ON "public"."selling_price_history" USING "btree" ("product_id", "effective_from" DESC);



CREATE INDEX "selling_price_history_valid_idx" ON "public"."selling_price_history" USING "btree" ("product_id", "effective_from" DESC, "effective_to");



CREATE UNIQUE INDEX "supplier_price_history_active_uniq" ON "public"."supplier_price_history" USING "btree" ("product_id") WHERE ("is_active" = true);



CREATE INDEX "supplier_price_history_created_idx" ON "public"."supplier_price_history" USING "btree" ("created_at" DESC);



CREATE INDEX "supplier_price_history_eff_idx" ON "public"."supplier_price_history" USING "btree" ("effective_from");



CREATE INDEX "supplier_price_history_product_idx" ON "public"."supplier_price_history" USING "btree" ("product_id", "effective_from" DESC);



CREATE INDEX "supplier_price_history_supplier_idx" ON "public"."supplier_price_history" USING "btree" ("supplier_id");



CREATE INDEX "supplier_price_history_valid_idx" ON "public"."supplier_price_history" USING "btree" ("product_id", "effective_from" DESC, "effective_to");



CREATE UNIQUE INDEX "suppliers_name_unique_idx" ON "public"."suppliers" USING "btree" ("lower"("name"));



CREATE OR REPLACE TRIGGER "trg_freeze_order_pricing" BEFORE UPDATE OF "order_items", "supplier_weights", "gross_profit", "payment_status" ON "public"."Orders" FOR EACH ROW EXECUTE FUNCTION "public"."freeze_order_pricing"();



CREATE OR REPLACE TRIGGER "trg_freeze_order_pricing_insert" BEFORE INSERT ON "public"."Orders" FOR EACH ROW EXECUTE FUNCTION "public"."freeze_order_pricing"();



CREATE OR REPLACE TRIGGER "trg_historical_daily_touch" BEFORE UPDATE ON "public"."historical_business_daily" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_product_first_price_history" AFTER INSERT ON "public"."Product" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_product_first_price_history"();



CREATE OR REPLACE TRIGGER "trg_selling_price_history_touch" BEFORE UPDATE ON "public"."selling_price_history" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_supplier_price_history_touch" BEFORE UPDATE ON "public"."supplier_price_history" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_suppliers_touch" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



ALTER TABLE ONLY "public"."Orders"
    ADD CONSTRAINT "Orders_delivery_batch_id_fkey" FOREIGN KEY ("delivery_batch_id") REFERENCES "public"."delivery_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."Orders"
    ADD CONSTRAINT "Orders_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."Orders"
    ADD CONSTRAINT "Orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."Orders"
    ADD CONSTRAINT "Orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combo_items"
    ADD CONSTRAINT "combo_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "public"."combos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combo_items"
    ADD CONSTRAINT "combo_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."Product"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_profiles"
    ADD CONSTRAINT "customer_profiles_user_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_batch_manifest"
    ADD CONSTRAINT "delivery_batch_manifest_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."delivery_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_batch_manifest"
    ADD CONSTRAINT "delivery_batch_manifest_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."Orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_batches"
    ADD CONSTRAINT "delivery_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."historical_business_daily"
    ADD CONSTRAINT "historical_business_daily_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."historical_business_daily"
    ADD CONSTRAINT "historical_business_daily_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."selling_price_history"
    ADD CONSTRAINT "selling_price_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."selling_price_history"
    ADD CONSTRAINT "selling_price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."Product"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."selling_price_history"
    ADD CONSTRAINT "selling_price_history_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_price_history"
    ADD CONSTRAINT "supplier_price_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_price_history"
    ADD CONSTRAINT "supplier_price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."Product"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_price_history"
    ADD CONSTRAINT "supplier_price_history_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_price_history"
    ADD CONSTRAINT "supplier_price_history_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_profiles"
    ADD CONSTRAINT "supplier_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."Orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Product" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Users can insert own profile" ON "public"."customer_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."customer_profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own profile" ON "public"."customer_profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "admin_delete_delivery_batches" ON "public"."delivery_batches" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_delete_delivery_points" ON "public"."delivery_points" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_delete_orders" ON "public"."Orders" FOR DELETE TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "admin_delete_products" ON "public"."Product" FOR DELETE TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "admin_delete_settings" ON "public"."site_settings" FOR DELETE TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "admin_delete_supplier_profiles" ON "public"."supplier_profiles" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_insert_delivery_batches" ON "public"."delivery_batches" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_insert_delivery_points" ON "public"."delivery_points" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_insert_products" ON "public"."Product" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "admin_insert_settings" ON "public"."site_settings" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "admin_insert_supplier_profiles" ON "public"."supplier_profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_select_manifest" ON "public"."delivery_batch_manifest" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_select_orders" ON "public"."Orders" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "admin_select_supplier_profiles" ON "public"."supplier_profiles" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admin_update_delivery_batches" ON "public"."delivery_batches" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_update_delivery_points" ON "public"."delivery_points" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_update_manifest" ON "public"."delivery_batch_manifest" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_update_orders" ON "public"."Orders" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "admin_update_products" ON "public"."Product" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "admin_update_settings" ON "public"."site_settings" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "admin_update_supplier_profiles" ON "public"."supplier_profiles" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_write_manifest" ON "public"."delivery_batch_manifest" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "admins_delete_roles" ON "public"."user_roles" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "user_roles_1"
  WHERE (("user_roles_1"."id" = "auth"."uid"()) AND ("user_roles_1"."role" = 'admin'::"text")))));



CREATE POLICY "admins_insert_roles" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "user_roles_1"
  WHERE (("user_roles_1"."id" = "auth"."uid"()) AND ("user_roles_1"."role" = 'admin'::"text")))));



CREATE POLICY "admins_read_all_roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "admins_update_roles" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "user_roles_1"
  WHERE (("user_roles_1"."id" = "auth"."uid"()) AND ("user_roles_1"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "user_roles_1"
  WHERE (("user_roles_1"."id" = "auth"."uid"()) AND ("user_roles_1"."role" = 'admin'::"text")))));



CREATE POLICY "anon_select_products" ON "public"."Product" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "anyone_select_settings" ON "public"."site_settings" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."combo_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combo_items_delete_all" ON "public"."combo_items" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "combo_items_insert_all" ON "public"."combo_items" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "combo_items_select_all" ON "public"."combo_items" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "combo_items_update_all" ON "public"."combo_items" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."combos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combos_delete_all" ON "public"."combos" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "combos_insert_all" ON "public"."combos" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "combos_select_all" ON "public"."combos" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "combos_update_all" ON "public"."combos" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."customer_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_select_active_delivery_points" ON "public"."delivery_points" FOR SELECT TO "authenticated" USING (("active" = true));



ALTER TABLE "public"."delivery_batch_manifest" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_points" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."historical_business_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "historical_daily_admin_delete" ON "public"."historical_business_daily" FOR DELETE TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "historical_daily_admin_insert" ON "public"."historical_business_daily" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "historical_daily_admin_select" ON "public"."historical_business_daily" FOR SELECT TO "authenticated" USING (("public"."is_admin"() = true));



CREATE POLICY "historical_daily_admin_update" ON "public"."historical_business_daily" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() = true)) WITH CHECK (("public"."is_admin"() = true));



CREATE POLICY "insert_own_orders" ON "public"."Orders" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "price_history_admin_all" ON "public"."selling_price_history" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "price_history_admin_all" ON "public"."supplier_price_history" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "read_delivery_batches" ON "public"."delivery_batches" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rider_select_orders" ON "public"."Orders" FOR SELECT TO "authenticated" USING ("public"."is_delivery_rider"());



CREATE POLICY "rider_update_orders" ON "public"."Orders" FOR UPDATE TO "authenticated" USING ("public"."is_delivery_rider"()) WITH CHECK ("public"."is_delivery_rider"());



CREATE POLICY "select_delivery_points" ON "public"."delivery_points" FOR SELECT TO "authenticated" USING (("public"."is_delivery_rider"() OR "public"."is_admin"()));



CREATE POLICY "select_own_orders" ON "public"."Orders" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."selling_price_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_price_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_select_orders" ON "public"."Orders" FOR SELECT TO "authenticated" USING ("public"."is_supplier"());



CREATE POLICY "supplier_select_own" ON "public"."supplier_profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "supplier_update_orders" ON "public"."Orders" FOR UPDATE TO "authenticated" USING ("public"."is_supplier"()) WITH CHECK ("public"."is_supplier"());



CREATE POLICY "supplier_update_own" ON "public"."supplier_profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_admin_all" ON "public"."suppliers" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_read_own_role" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."_line_cost"("item" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."_line_cost"("item" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_line_cost"("item" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."_line_margin"("item" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."_line_margin"("item" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_line_margin"("item" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."_line_profit"("item" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."_line_profit"("item" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_line_profit"("item" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."_line_qty"("item" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."_line_qty"("item" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_line_qty"("item" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."_line_selling"("item" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."_line_selling"("item" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_line_selling"("item" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."_pricing_set_selling"("p_product_id" "text", "p_selling_price" numeric, "p_effective_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."_pricing_set_selling"("p_product_id" "text", "p_selling_price" numeric, "p_effective_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_pricing_set_selling"("p_product_id" "text", "p_selling_price" numeric, "p_effective_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."_pricing_set_supplier"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text", "p_supplier_id" bigint, "p_effective_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."_pricing_set_supplier"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text", "p_supplier_id" bigint, "p_effective_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_pricing_set_supplier"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text", "p_supplier_id" bigint, "p_effective_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_confirm_hub_arrival"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_confirm_hub_arrival"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_confirm_hub_arrival"("p_batch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_confirm_order_arrival"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_confirm_order_arrival"("p_order_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_confirm_order_arrival"("p_order_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_confirm_order_arrival"("p_order_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_mark_order_ready_for_rider"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_mark_order_ready_for_rider"("p_order_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_mark_order_ready_for_rider"("p_order_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_mark_order_ready_for_rider"("p_order_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_mark_ready_for_rider"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_mark_ready_for_rider"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_mark_ready_for_rider"("p_batch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_product_first_price_history"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_product_first_price_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_product_first_price_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_product_first_price_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."freeze_order_pricing"() TO "anon";
GRANT ALL ON FUNCTION "public"."freeze_order_pricing"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."freeze_order_pricing"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_delivery_rider"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_delivery_rider"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_delivery_rider"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_supplier"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_supplier"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_supplier"() TO "service_role";



GRANT ALL ON FUNCTION "public"."manifest_set_loaded"("p_batch_id" "uuid", "p_order_id" bigint, "p_loaded" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."manifest_set_loaded"("p_batch_id" "uuid", "p_order_id" bigint, "p_loaded" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."manifest_set_loaded"("p_batch_id" "uuid", "p_order_id" bigint, "p_loaded" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."manifest_set_packed"("p_batch_id" "uuid", "p_order_id" bigint, "p_packed" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."manifest_set_packed"("p_batch_id" "uuid", "p_order_id" bigint, "p_packed" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."manifest_set_packed"("p_batch_id" "uuid", "p_order_id" bigint, "p_packed" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."move_combo"("p_id" "text", "p_to_index" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."move_combo"("p_id" "text", "p_to_index" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_combo"("p_id" "text", "p_to_index" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."move_product"("p_id" "text", "p_to_index" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."move_product"("p_id" "text", "p_to_index" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_product"("p_id" "text", "p_to_index" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_combo_order"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_combo_order"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_combo_order"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_product_order"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_product_order"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_product_order"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_monthly_report_mv"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_monthly_report_mv"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_monthly_report_mv"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reorder_combos"("p_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_combos"("p_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_combos"("p_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."reorder_products"("p_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_products"("p_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_products"("p_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."reprice_open_orders_for_product"("p_product_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reprice_open_orders_for_product"("p_product_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reprice_open_orders_for_product"("p_product_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rider_complete_batch_if_done"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rider_complete_batch_if_done"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rider_complete_batch_if_done"("p_batch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rider_receive_order_at_hub"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rider_receive_order_at_hub"("p_order_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."rider_receive_order_at_hub"("p_order_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rider_receive_order_at_hub"("p_order_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."rider_start_batch_delivery"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rider_start_batch_delivery"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rider_start_batch_delivery"("p_batch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rider_start_order_delivery"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rider_start_order_delivery"("p_order_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."rider_start_order_delivery"("p_order_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rider_start_order_delivery"("p_order_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."rider_update_delivery_status"("p_order_id" bigint, "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rider_update_delivery_status"("p_order_id" bigint, "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rider_update_delivery_status"("p_order_id" bigint, "p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_product_selling_price"("p_product_id" "text", "p_selling_price" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_product_selling_price"("p_product_id" "text", "p_selling_price" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."set_product_selling_price"("p_product_id" "text", "p_selling_price" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_product_selling_price"("p_product_id" "text", "p_selling_price" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_product_selling_price_at"("p_product_id" "text", "p_selling_price" numeric, "p_effective_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_product_selling_price_at"("p_product_id" "text", "p_selling_price" numeric, "p_effective_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."set_product_selling_price_at"("p_product_id" "text", "p_selling_price" numeric, "p_effective_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_product_selling_price_at"("p_product_id" "text", "p_selling_price" numeric, "p_effective_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_product_supplier_price"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_product_supplier_price"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_product_supplier_price"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_product_supplier_price"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_product_supplier_price_at"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text", "p_supplier_id" bigint, "p_effective_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_product_supplier_price_at"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text", "p_supplier_id" bigint, "p_effective_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."set_product_supplier_price_at"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text", "p_supplier_id" bigint, "p_effective_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_product_supplier_price_at"("p_product_id" "text", "p_cost_price" numeric, "p_supplier_name" "text", "p_supplier_id" bigint, "p_effective_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."supplier_book_lalamove"("p_batch_id" "uuid", "p_tracking_url" "text", "p_booking_reference" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."supplier_book_lalamove"("p_batch_id" "uuid", "p_tracking_url" "text", "p_booking_reference" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."supplier_book_lalamove"("p_batch_id" "uuid", "p_tracking_url" "text", "p_booking_reference" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."supplier_book_lalamove_order"("p_order_id" bigint, "p_tracking_url" "text", "p_booking_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."supplier_book_lalamove_order"("p_order_id" bigint, "p_tracking_url" "text", "p_booking_reference" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."supplier_book_lalamove_order"("p_order_id" bigint, "p_tracking_url" "text", "p_booking_reference" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."supplier_book_lalamove_order"("p_order_id" bigint, "p_tracking_url" "text", "p_booking_reference" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."supplier_complete_packing"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."supplier_complete_packing"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."supplier_complete_packing"("p_batch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."supplier_complete_packing_order"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."supplier_complete_packing_order"("p_order_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."supplier_complete_packing_order"("p_order_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."supplier_complete_packing_order"("p_order_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."supplier_start_packing"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."supplier_start_packing"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."supplier_start_packing"("p_batch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."supplier_start_packing_order"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."supplier_start_packing_order"("p_order_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."supplier_start_packing_order"("p_order_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."supplier_start_packing_order"("p_order_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tracking_rider_name"("p_delivery_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tracking_rider_name"("p_delivery_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."tracking_rider_name"("p_delivery_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tracking_rider_name"("p_delivery_date" "date") TO "service_role";


















GRANT ALL ON TABLE "public"."Orders" TO "anon";
GRANT ALL ON TABLE "public"."Orders" TO "authenticated";
GRANT ALL ON TABLE "public"."Orders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Orders_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Orders_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Orders_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Product" TO "anon";
GRANT ALL ON TABLE "public"."Product" TO "authenticated";
GRANT ALL ON TABLE "public"."Product" TO "service_role";



GRANT ALL ON TABLE "public"."combo_items" TO "anon";
GRANT ALL ON TABLE "public"."combo_items" TO "authenticated";
GRANT ALL ON TABLE "public"."combo_items" TO "service_role";



GRANT ALL ON TABLE "public"."combos" TO "anon";
GRANT ALL ON TABLE "public"."combos" TO "authenticated";
GRANT ALL ON TABLE "public"."combos" TO "service_role";



GRANT ALL ON TABLE "public"."customer_profiles" TO "anon";
GRANT ALL ON TABLE "public"."customer_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_batch_manifest" TO "anon";
GRANT ALL ON TABLE "public"."delivery_batch_manifest" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_batch_manifest" TO "service_role";



GRANT ALL ON SEQUENCE "public"."delivery_batch_manifest_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."delivery_batch_manifest_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."delivery_batch_manifest_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_batches" TO "anon";
GRANT ALL ON TABLE "public"."delivery_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_batches" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_points" TO "anon";
GRANT ALL ON TABLE "public"."delivery_points" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_points" TO "service_role";



GRANT ALL ON SEQUENCE "public"."delivery_points_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."delivery_points_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."delivery_points_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."historical_business_daily" TO "anon";
GRANT ALL ON TABLE "public"."historical_business_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."historical_business_daily" TO "service_role";



GRANT ALL ON SEQUENCE "public"."historical_business_daily_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."historical_business_daily_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."historical_business_daily_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vw_order_item_flat" TO "anon";
GRANT ALL ON TABLE "public"."vw_order_item_flat" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_order_item_flat" TO "service_role";



GRANT ALL ON TABLE "public"."vw_sales_summary_monthly" TO "anon";
GRANT ALL ON TABLE "public"."vw_sales_summary_monthly" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_sales_summary_monthly" TO "service_role";



GRANT ALL ON TABLE "public"."mv_sales_summary_monthly" TO "anon";
GRANT ALL ON TABLE "public"."mv_sales_summary_monthly" TO "authenticated";
GRANT ALL ON TABLE "public"."mv_sales_summary_monthly" TO "service_role";



GRANT ALL ON TABLE "public"."selling_price_history" TO "anon";
GRANT ALL ON TABLE "public"."selling_price_history" TO "authenticated";
GRANT ALL ON TABLE "public"."selling_price_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."selling_price_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."selling_price_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."selling_price_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."site_settings" TO "anon";
GRANT ALL ON TABLE "public"."site_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."site_settings" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_price_history" TO "anon";
GRANT ALL ON TABLE "public"."supplier_price_history" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_price_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supplier_price_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supplier_price_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supplier_price_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_profiles" TO "anon";
GRANT ALL ON TABLE "public"."supplier_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."suppliers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."suppliers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."suppliers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."vw_category_profit" TO "anon";
GRANT ALL ON TABLE "public"."vw_category_profit" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_category_profit" TO "service_role";



GRANT ALL ON TABLE "public"."vw_product_profit" TO "anon";
GRANT ALL ON TABLE "public"."vw_product_profit" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_product_profit" TO "service_role";



GRANT ALL ON TABLE "public"."vw_dashboard_kpis" TO "anon";
GRANT ALL ON TABLE "public"."vw_dashboard_kpis" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_dashboard_kpis" TO "service_role";



GRANT ALL ON TABLE "public"."vw_order_profit" TO "anon";
GRANT ALL ON TABLE "public"."vw_order_profit" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_order_profit" TO "service_role";



GRANT ALL ON TABLE "public"."vw_sales_summary_daily" TO "anon";
GRANT ALL ON TABLE "public"."vw_sales_summary_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_sales_summary_daily" TO "service_role";



GRANT ALL ON TABLE "public"."vw_supplier_profit" TO "anon";
GRANT ALL ON TABLE "public"."vw_supplier_profit" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_supplier_profit" TO "service_role";



GRANT ALL ON TABLE "public"."vw_top_products" TO "anon";
GRANT ALL ON TABLE "public"."vw_top_products" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_top_products" TO "service_role";



GRANT ALL ON TABLE "public"."vw_top_profit_products" TO "anon";
GRANT ALL ON TABLE "public"."vw_top_profit_products" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_top_profit_products" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































