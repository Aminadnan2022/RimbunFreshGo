-- Phase 4B.2 corrective migration: place_sales_order unassigned record fix.
--
-- OFFENDING SQL (in the applied 20260919000000 version of place_sales_order,
-- preparation-answers insertion loop):
--
--   INSERT INTO public.sales_order_preparation_answers (
--     sales_order_line_id, sales_order_line_unit_id,
--     sales_order_line_component_id, sales_order_line_component_unit_id,
--     preparation_schema_version_id,
--     preparation_question_id, preparation_option_id, question_code, option_code, answer_value
--   ) VALUES (
--     v_line_ids[v_answer_line], v_unit_id,
--     CASE WHEN v_answer_component IS NOT NULL THEN v_component_row.id ELSE NULL END, v_answer_component_unit,
--     ...
--
-- ROOT CAUSE: this single INSERT runs for BOTH combo and normal (non-combo)
-- lines. For a normal line (e.g. Whole Broiler Chicken, chicken_cut), the
-- ELSE branch of the IF above never executes `SELECT ... INTO v_component_row`,
-- so the record variable v_component_row has no tuple descriptor at all in
-- that code path. PL/pgSQL must resolve the type of `v_component_row.id` when
-- preparing this INSERT's parameter list, which happens regardless of which
-- CASE branch is actually selected at runtime -- referencing a field of a
-- record variable that was never assigned always raises:
--   "record \"v_component_row\" is not assigned yet"
-- even though the surrounding CASE WHEN correctly guards its use for combo
-- lines only in every other respect.
--
-- FIX: never let `v_component_row.id` appear inside this shared INSERT.
-- Instead, resolve the component id into a plain uuid variable
-- (v_answer_component_id) via ordinary PL/pgSQL control flow (a real IF/ELSE
-- assignment, not a SQL CASE expression) before the INSERT runs. Plain
-- variable assignment has no such record-type resolution requirement, and
-- v_component_row is only ever dereferenced here inside the branch where it
-- was actually just assigned two statements above (the combo path).
--
-- Everything else in the function (delivery/payment resolution, line/combo
-- component creation, canonical_operation scoping, required-question
-- enforcement, totals projection) is byte-for-byte identical to the applied
-- 20260919000000 version.

CREATE OR REPLACE FUNCTION public.place_sales_order(
  p_customer_snapshot jsonb,
  p_delivery_request jsonb,
  p_items jsonb,
  p_preparation_answers jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  sales_order_id uuid,
  order_number text,
  price_status text,
  payment_status text,
  requires_supplier_finalisation boolean,
  estimated_total numeric,
  final_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_id uuid := auth.uid();
  v_order_id uuid;
  v_order_number text;
  v_method_code text := p_delivery_request ->> 'method_code';
  v_requested_date date;
  v_requested_time time;
  v_zone_code text := p_delivery_request ->> 'zone_code';
  v_weekday smallint;
  v_delivery_version public.delivery_method_versions%ROWTYPE;
  v_zone public.delivery_method_version_zones%ROWTYPE;
  v_delivery_fee numeric(12,2);
  v_delivery_snapshot jsonb;
  v_payment_version public.payment_configuration_versions%ROWTYPE;
  v_payment_snapshot jsonb := '{}'::jsonb;
  v_customer_snapshot jsonb;
  v_item jsonb;
  v_line_number integer := 0;
  v_item_kind text;
  v_product_id text;
  v_combo_id text;
  v_quantity numeric(12,3);
  v_estimated_weight_kg numeric(12,3);
  v_product_version public.product_versions%ROWTYPE;
  v_combo_version public.combo_versions%ROWTYPE;
  v_selling_price record;
  v_supplier_price record;
  v_ordering_mode text;
  v_selling_unit text;
  v_physical_unit_type text;
  v_unit_selling_price numeric(12,2);
  v_unit_cost_price numeric(12,2);
  v_supplier_id bigint;
  v_supplier_snapshot jsonb;
  v_product_snapshot jsonb;
  v_line_requires_finalisation boolean;
  v_estimated_line_total numeric(12,2);
  v_estimated_supplier_cost numeric(12,2);
  v_sales_order_line_id uuid;
  v_unit_count integer;
  v_unit_number integer;
  v_unit_id uuid;
  v_order_requires_finalisation boolean := false;
  v_estimated_subtotal numeric(12,2) := 0;
  v_estimated_total numeric(12,2);
  v_final_subtotal numeric(12,2);
  v_final_total numeric(12,2);
  v_price_status text;
  v_price_finalised_at timestamptz;
  v_line_schema_version_id uuid;
  v_answer jsonb;
  v_question public.preparation_questions%ROWTYPE;
  v_option public.preparation_question_options%ROWTYPE;
  v_answer_unit integer;
  v_answer_line integer;
  v_line_ids uuid[] := ARRAY[]::uuid[];
  v_line_schema_versions uuid[] := ARRAY[]::uuid[];
  v_line_kinds text[] := ARRAY[]::text[];
  v_missing_required text;
  v_combo_item record;
  v_component_id uuid;
  v_component_product_version public.product_versions%ROWTYPE;
  v_component_supplier_price record;
  v_component_estimated_weight numeric(12,3);
  v_component_estimated_cost numeric(12,2);
  v_component_unit_count integer;
  v_component_unit_number integer;
  v_answer_component integer;
  v_answer_component_unit integer;
  v_answer_component_id uuid;
  v_component_row record;
  v_component_schema_version_id uuid;
  v_combo_requires_finalisation boolean;
  v_combo_final_cost_sum numeric(12,2);
BEGIN
  -----------------------------------------------------------------------------
  -- Authorization: customer identity comes only from auth.uid(), never input.
  -----------------------------------------------------------------------------
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to place an order.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one order item is required.';
  END IF;
  IF p_delivery_request IS NULL OR jsonb_typeof(p_delivery_request) <> 'object' THEN
    RAISE EXCEPTION 'A delivery request is required.';
  END IF;
  IF v_method_code NOT IN ('instant_customer_lalamove', 'normal_bulk') THEN
    RAISE EXCEPTION 'Unsupported delivery method: %', v_method_code;
  END IF;

  -----------------------------------------------------------------------------
  -- Delivery configuration: resolve and validate against canonical rules.
  -- Client-supplied fee is never trusted; fee always comes from the resolved
  -- published version.
  -----------------------------------------------------------------------------
  BEGIN
    v_requested_date := (p_delivery_request ->> 'requested_date')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'requested_date is required and must be a valid date.';
  END;
  IF p_delivery_request ->> 'requested_time' IS NOT NULL THEN
    BEGIN
      v_requested_time := (p_delivery_request ->> 'requested_time')::time;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'requested_time must be a valid time (HH:MM).';
    END;
  END IF;
  IF v_method_code = 'instant_customer_lalamove' AND v_requested_time IS NULL THEN
    RAISE EXCEPTION 'requested_time is required for instant delivery.';
  END IF;

  SELECT * INTO v_delivery_version
    FROM public.delivery_method_versions
   WHERE method_code = v_method_code
     AND status = 'published' AND active
     AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
   ORDER BY effective_from DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active published delivery configuration for %.', v_method_code;
  END IF;

  v_weekday := extract(dow FROM v_requested_date)::smallint;
  IF NOT EXISTS (
    SELECT 1 FROM public.delivery_method_version_days
     WHERE delivery_method_version_id = v_delivery_version.id AND weekday = v_weekday
  ) THEN
    RAISE EXCEPTION 'Requested delivery date is not an allowed day for %.', v_method_code;
  END IF;

  IF v_requested_time IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.delivery_method_version_windows
     WHERE delivery_method_version_id = v_delivery_version.id
       AND v_requested_time BETWEEN start_time AND end_time
  ) THEN
    RAISE EXCEPTION 'Requested delivery time is outside the allowed window for %.', v_method_code;
  END IF;

  IF v_method_code = 'normal_bulk' THEN
    IF v_zone_code IS NULL THEN
      RAISE EXCEPTION 'zone_code is required for normal bulk delivery.';
    END IF;
    SELECT * INTO v_zone
      FROM public.delivery_method_version_zones
     WHERE delivery_method_version_id = v_delivery_version.id AND zone_code = v_zone_code;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Residence % is not eligible for normal bulk delivery.', v_zone_code;
    END IF;
  END IF;

  v_delivery_fee := v_delivery_version.fee_amount;
  v_delivery_snapshot := jsonb_build_object(
    'method_code', v_delivery_version.method_code,
    'fee_amount', v_delivery_version.fee_amount,
    'currency_code', v_delivery_version.currency_code,
    'external_provider', v_delivery_version.external_provider,
    'external_booking_url', v_delivery_version.external_booking_url,
    'customer_pays_external_provider', v_delivery_version.customer_pays_external_provider,
    'requested_date', v_requested_date,
    'requested_time', v_requested_time,
    'zone_code', v_zone.zone_code,
    'zone_name', v_zone.zone_name,
    'apartment', p_delivery_request ->> 'apartment',
    'house_unit', p_delivery_request ->> 'house_unit',
    'delivery_point_name', p_delivery_request ->> 'delivery_point_name',
    'pickup_location', p_delivery_request ->> 'pickup_location'
  );

  -----------------------------------------------------------------------------
  -- Payment configuration: optional at order-creation time. A draft/no-QR
  -- configuration must never block checkout; the customer simply cannot pay
  -- until a published configuration exists AND price_status = 'final'.
  -----------------------------------------------------------------------------
  SELECT * INTO v_payment_version
    FROM public.payment_configuration_versions
   WHERE status = 'published'
     AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
   ORDER BY effective_from DESC
   LIMIT 1;
  IF FOUND THEN
    v_payment_snapshot := jsonb_build_object(
      'configuration_code', v_payment_version.configuration_code,
      'qr_storage_path', v_payment_version.qr_storage_path,
      'instructions', v_payment_version.instructions,
      'currency_code', v_payment_version.currency_code
    );
  END IF;

  -----------------------------------------------------------------------------
  -- Customer snapshot: only contact/identity fields, frozen at order time.
  -----------------------------------------------------------------------------
  v_customer_snapshot := jsonb_build_object(
    'name', p_customer_snapshot ->> 'name',
    'phone', p_customer_snapshot ->> 'phone',
    'email', p_customer_snapshot ->> 'email',
    'notes', p_customer_snapshot ->> 'notes'
  );
  IF NULLIF(btrim(v_customer_snapshot ->> 'name'), '') IS NULL THEN
    RAISE EXCEPTION 'Customer name is required.';
  END IF;

  -----------------------------------------------------------------------------
  -- Create the order header first (id needed for line FKs). Totals are
  -- finalised after all lines are resolved, then updated once via UPDATE
  -- inside the SAME transaction (append-only trigger permits INSERT freely;
  -- this single pre-commit UPDATE happens before the row is ever visible
  -- outside this transaction, so no historical fact is ever mutated post-hoc).
  -----------------------------------------------------------------------------
  v_order_number := public.phase4b1_generate_order_number();

  INSERT INTO public.sales_orders (
    order_number, customer_id, status, confirmed_at, currency_code,
    customer_snapshot, delivery_snapshot, subtotal, delivery_fee, discount_amount, total,
    source_payload, created_by,
    requires_supplier_finalisation, price_status,
    estimated_subtotal, estimated_total, payment_status,
    payment_configuration_version_id, payment_configuration_snapshot,
    delivery_configuration_version_id, delivery_configuration_snapshot
  ) VALUES (
    v_order_number, v_customer_id, 'confirmed', now(), 'MYR',
    v_customer_snapshot, v_delivery_snapshot, 0, v_delivery_fee, 0, v_delivery_fee,
    jsonb_build_object('items', p_items), v_customer_id,
    false, 'estimated',
    0, v_delivery_fee, 'pending',
    v_payment_version.id, v_payment_snapshot,
    v_delivery_version.id, v_delivery_snapshot
  )
  RETURNING id INTO v_order_id;

  -----------------------------------------------------------------------------
  -- Lines: resolve canonical product/combo version, freeze price/cost.
  -----------------------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_number := v_line_number + 1;
    v_product_id := v_item ->> 'product_id';
    v_combo_id := v_item ->> 'combo_id';

    IF (v_product_id IS NULL) = (v_combo_id IS NULL) THEN
      RAISE EXCEPTION 'Line %: exactly one of product_id or combo_id is required.', v_line_number;
    END IF;

    BEGIN
      v_quantity := (v_item ->> 'quantity')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Line %: quantity must be numeric.', v_line_number;
    END;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Line %: quantity must be greater than zero.', v_line_number;
    END IF;

    v_estimated_weight_kg := NULLIF(v_item ->> 'estimated_weight_kg', '')::numeric;

    IF v_product_id IS NOT NULL THEN
      v_item_kind := 'product';

      SELECT * INTO v_product_version
        FROM public.product_versions
       WHERE product_id = v_product_id
         AND status = 'published'
         AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
       ORDER BY effective_from DESC
       LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Line %: product % has no published canonical version.', v_line_number, v_product_id;
      END IF;

      SELECT selling_price INTO v_selling_price
        FROM public.selling_price_history
       WHERE product_id = v_product_id AND is_active = true
       LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Line %: product % has no active selling price.', v_line_number, v_product_id;
      END IF;

      SELECT supplier_id, cost_price INTO v_supplier_price
        FROM public.supplier_price_history
       WHERE product_id = v_product_id AND is_active = true
       LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Line %: product % has no active supplier cost basis.', v_line_number, v_product_id;
      END IF;

      v_ordering_mode := v_product_version.ordering_mode;
      v_selling_unit := COALESCE(v_product_version.selling_unit, '');
      v_physical_unit_type := COALESCE(v_product_version.physical_unit_type, 'none');
      v_unit_selling_price := v_selling_price.selling_price;
      v_unit_cost_price := v_supplier_price.cost_price;
      v_supplier_id := v_supplier_price.supplier_id;
      v_supplier_snapshot := jsonb_build_object('supplier_id', v_supplier_id, 'cost_price', v_supplier_price.cost_price);
      v_product_snapshot := COALESCE(v_product_version.display_snapshot, '{}'::jsonb)
        || jsonb_build_object('ordering_mode', v_ordering_mode, 'selling_unit', v_selling_unit);
      v_line_schema_version_id := v_product_version.preparation_schema_version_id;

      v_line_requires_finalisation := v_ordering_mode IN ('whole_fish_by_weight', 'weight_only', 'slice');

      IF v_ordering_mode IN ('whole_fish_by_weight', 'weight_only', 'slice') THEN
        v_estimated_line_total := round(v_unit_selling_price * COALESCE(v_estimated_weight_kg, 0), 2);
        v_estimated_supplier_cost := round(v_unit_cost_price * COALESCE(v_estimated_weight_kg, 0), 2);
      ELSE
        v_estimated_line_total := round(v_unit_selling_price * v_quantity, 2);
        v_estimated_supplier_cost := round(v_unit_cost_price * v_quantity, 2);
      END IF;

    ELSE
      v_item_kind := 'combo';

      SELECT * INTO v_combo_version
        FROM public.combo_versions
       WHERE combo_id = v_combo_id
         AND status = 'published'
         AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
       ORDER BY effective_from DESC
       LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Line %: combo % has no published canonical version.', v_line_number, v_combo_id;
      END IF;

      v_ordering_mode := 'combo';
      v_selling_unit := 'combo';
      v_physical_unit_type := 'none';
      v_unit_selling_price := v_combo_version.selling_price;
      v_unit_cost_price := NULL;
      v_supplier_id := NULL;
      v_supplier_snapshot := '{}'::jsonb;
      v_product_snapshot := COALESCE(v_combo_version.display_snapshot, '{}'::jsonb)
        || jsonb_build_object('ordering_mode', 'combo');
      v_line_schema_version_id := NULL;
      v_line_requires_finalisation := false;
      v_estimated_line_total := round(v_unit_selling_price * v_quantity, 2);
      v_estimated_supplier_cost := NULL;
    END IF;

    IF v_line_requires_finalisation THEN
      v_order_requires_finalisation := true;
    END IF;
    v_estimated_subtotal := v_estimated_subtotal + v_estimated_line_total;

    INSERT INTO public.sales_order_lines (
      sales_order_id, line_number, product_id, product_version_id, combo_id, combo_version_id,
      item_kind, product_snapshot, quantity, estimated_weight_kg, selling_unit,
      unit_selling_price, unit_cost_price, supplier_id, supplier_snapshot,
      discount_amount, line_total, ordering_mode,
      estimated_line_total, estimated_supplier_cost,
      final_line_total, final_supplier_cost, finalised_at
    ) VALUES (
      v_order_id, v_line_number, v_product_id, v_product_version.id, v_combo_id, v_combo_version.id,
      v_item_kind, v_product_snapshot, v_quantity, v_estimated_weight_kg, v_selling_unit,
      v_unit_selling_price, v_unit_cost_price, v_supplier_id, v_supplier_snapshot,
      0, v_estimated_line_total, v_ordering_mode,
      v_estimated_line_total, v_estimated_supplier_cost,
      CASE WHEN v_line_requires_finalisation THEN NULL ELSE v_estimated_line_total END,
      CASE WHEN v_line_requires_finalisation THEN NULL ELSE v_estimated_supplier_cost END,
      CASE WHEN v_line_requires_finalisation THEN NULL ELSE now() END
    )
    RETURNING id INTO v_sales_order_line_id;

    v_line_ids := v_line_ids || v_sales_order_line_id;
    v_line_schema_versions := v_line_schema_versions || v_line_schema_version_id;
    v_line_kinds := v_line_kinds || v_item_kind;

    -----------------------------------------------------------------------------
    -- Physical units: only whole_fish_by_weight creates per-fish rows.
    -----------------------------------------------------------------------------
    v_unit_count := 0;
    IF v_ordering_mode = 'whole_fish_by_weight' THEN
      v_unit_count := round(v_quantity)::integer;
      IF v_unit_count < 1 THEN
        RAISE EXCEPTION 'Line %: whole_fish_by_weight quantity must be a positive whole count.', v_line_number;
      END IF;
      FOR v_unit_number IN 1..v_unit_count LOOP
        INSERT INTO public.sales_order_line_units (
          sales_order_line_id, unit_number, physical_unit_type, estimated_weight_kg, unit_snapshot
        ) VALUES (
          v_sales_order_line_id, v_unit_number,
          CASE WHEN v_physical_unit_type IN ('chicken', 'fish') THEN v_physical_unit_type ELSE 'other' END,
          CASE WHEN v_estimated_weight_kg IS NOT NULL THEN round(v_estimated_weight_kg / v_unit_count, 3) ELSE NULL END,
          '{}'::jsonb
        );
      END LOOP;
    END IF;

    -----------------------------------------------------------------------------
    -- Combo components: read the immutable recipe (combo_version_items), freeze
    -- one sales_order_line_component per component. product_version_id is the
    -- version frozen into the combo recipe at publish time (the recipe itself
    -- is historical); supplier cost is resolved fresh at order time, exactly
    -- like a normal product line. Combo revenue stays on the parent line.
    -----------------------------------------------------------------------------
    IF v_item_kind = 'combo' THEN
      v_combo_requires_finalisation := false;
      v_combo_final_cost_sum := 0;
      FOR v_combo_item IN
        SELECT ci.id AS combo_version_item_id, ci.product_id, ci.product_version_id,
               ci.quantity, ci.unit_snapshot, ci.display_order
          FROM public.combo_version_items ci
         WHERE ci.combo_version_id = v_combo_version.id
         ORDER BY ci.display_order
      LOOP
        SELECT * INTO v_component_product_version
          FROM public.product_versions WHERE id = v_combo_item.product_version_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Line %: combo component % has no resolvable product version.', v_line_number, v_combo_item.product_id;
        END IF;

        SELECT supplier_id, cost_price INTO v_component_supplier_price
          FROM public.supplier_price_history
         WHERE product_id = v_combo_item.product_id AND is_active = true
         LIMIT 1;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Line %: combo component % has no active supplier cost basis.', v_line_number, v_combo_item.product_id;
        END IF;

        v_component_estimated_weight := NULLIF(
          v_item -> 'component_estimated_weights' ->> (v_combo_item.display_order + 1)::text, ''
        )::numeric;

        IF v_component_product_version.ordering_mode IN ('whole_fish_by_weight', 'weight_only', 'slice') THEN
          v_component_estimated_cost := round(v_component_supplier_price.cost_price * COALESCE(v_component_estimated_weight, 0), 2);
          v_combo_requires_finalisation := true;
        ELSE
          v_component_estimated_cost := round(v_component_supplier_price.cost_price * v_combo_item.quantity, 2);
          v_combo_final_cost_sum := v_combo_final_cost_sum + v_component_estimated_cost;
        END IF;

        INSERT INTO public.sales_order_line_components (
          sales_order_line_id, combo_version_item_id, component_number,
          product_id, product_version_id, product_snapshot,
          quantity, selling_unit, ordering_mode, estimated_weight_kg,
          supplier_id, supplier_snapshot, unit_cost_price,
          estimated_supplier_cost,
          final_supplier_cost, finalised_at
        ) VALUES (
          v_sales_order_line_id, v_combo_item.combo_version_item_id, v_combo_item.display_order + 1,
          v_combo_item.product_id, v_combo_item.product_version_id,
          COALESCE(v_component_product_version.display_snapshot, '{}'::jsonb),
          v_combo_item.quantity, COALESCE(v_component_product_version.selling_unit, ''),
          v_component_product_version.ordering_mode, v_component_estimated_weight,
          v_component_supplier_price.supplier_id,
          jsonb_build_object('supplier_id', v_component_supplier_price.supplier_id, 'cost_price', v_component_supplier_price.cost_price),
          v_component_supplier_price.cost_price,
          v_component_estimated_cost,
          CASE WHEN v_component_product_version.ordering_mode IN ('whole_fish_by_weight', 'weight_only', 'slice') THEN NULL ELSE v_component_estimated_cost END,
          CASE WHEN v_component_product_version.ordering_mode IN ('whole_fish_by_weight', 'weight_only', 'slice') THEN NULL ELSE now() END
        )
        RETURNING id INTO v_component_id;

        IF v_component_product_version.ordering_mode = 'whole_fish_by_weight' THEN
          v_component_unit_count := round(v_combo_item.quantity)::integer;
          IF v_component_unit_count < 1 THEN
            RAISE EXCEPTION 'Line %: combo component % quantity must be a positive whole count.', v_line_number, v_combo_item.product_id;
          END IF;
          FOR v_component_unit_number IN 1..v_component_unit_count LOOP
            INSERT INTO public.sales_order_line_component_units (
              sales_order_line_component_id, unit_number, physical_unit_type, estimated_weight_kg, unit_snapshot
            ) VALUES (
              v_component_id, v_component_unit_number,
              CASE WHEN v_component_product_version.physical_unit_type IN ('chicken', 'fish') THEN v_component_product_version.physical_unit_type ELSE 'other' END,
              CASE WHEN v_component_estimated_weight IS NOT NULL THEN round(v_component_estimated_weight / v_component_unit_count, 3) ELSE NULL END,
              '{}'::jsonb
            );
          END LOOP;
        END IF;
      END LOOP;

      -- Combo customer revenue (parent line_total/finalised_at) is already
      -- final regardless of component state. Supplier cost is a separate,
      -- purely internal concern: if every component's cost is already fully
      -- known (fixed_quantity only), freeze the aggregate now; otherwise the
      -- order-level price_status gate waits for finalize_sales_order_pricing
      -- to compute it from the components once actual weights are recorded.
      -- This is creation-time work, not later supplier/admin finalisation, so
      -- it runs under 'order_creation' (narrowly restricted to
      -- final_supplier_cost only on sales_order_lines) and is cleared
      -- immediately after.
      IF v_combo_requires_finalisation THEN
        v_order_requires_finalisation := true;
      ELSE
        PERFORM set_config('freshgo.canonical_operation', 'order_creation', true);
        UPDATE public.sales_order_lines
           SET final_supplier_cost = v_combo_final_cost_sum
         WHERE id = v_sales_order_line_id;
        PERFORM set_config('freshgo.canonical_operation', '', true);
      END IF;
    END IF;
  END LOOP;

  -----------------------------------------------------------------------------
  -- Preparation answers: server-side validated, no client-trusted UUIDs.
  -- Combo lines target a component via component_number (resolved against
  -- sales_order_line_components created above); normal product lines target
  -- the line/unit directly. Neither path trusts a client-supplied schema id.
  -----------------------------------------------------------------------------
  IF p_preparation_answers IS NOT NULL AND jsonb_typeof(p_preparation_answers) = 'array' THEN
    FOR v_answer IN SELECT * FROM jsonb_array_elements(p_preparation_answers)
    LOOP
      v_answer_line := (v_answer ->> 'line_number')::integer;
      IF v_answer_line IS NULL OR v_answer_line < 1 OR v_answer_line > array_length(v_line_ids, 1) THEN
        RAISE EXCEPTION 'Preparation answer references an unknown line_number.';
      END IF;
      v_answer_component := NULLIF(v_answer ->> 'component_number', '')::integer;
      v_answer_component_id := NULL;

      IF v_line_kinds[v_answer_line] = 'combo' THEN
        IF v_answer_component IS NULL THEN
          RAISE EXCEPTION 'Line %: combo preparation answers must specify component_number.', v_answer_line;
        END IF;
        SELECT c.id, c.product_version_id INTO v_component_row
          FROM public.sales_order_line_components c
         WHERE c.sales_order_line_id = v_line_ids[v_answer_line] AND c.component_number = v_answer_component;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Line %: component % does not exist on this order.', v_answer_line, v_answer_component;
        END IF;
        v_answer_component_id := v_component_row.id;
        SELECT preparation_schema_version_id INTO v_component_schema_version_id
          FROM public.product_versions WHERE id = v_component_row.product_version_id;
        IF v_component_schema_version_id IS NULL THEN
          RAISE EXCEPTION 'Line %: component % has no preparation schema.', v_answer_line, v_answer_component;
        END IF;
      ELSE
        IF v_answer_component IS NOT NULL THEN
          RAISE EXCEPTION 'Line %: component_number is only valid for combo lines.', v_answer_line;
        END IF;
        IF v_line_schema_versions[v_answer_line] IS NULL THEN
          RAISE EXCEPTION 'Line %: this product has no preparation schema.', v_answer_line;
        END IF;
        v_component_schema_version_id := v_line_schema_versions[v_answer_line];
      END IF;

      SELECT * INTO v_question
        FROM public.preparation_questions
       WHERE preparation_schema_version_id = v_component_schema_version_id
         AND code = (v_answer ->> 'question_code')
         AND active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Line %: unknown or inactive preparation question %.', v_answer_line, v_answer ->> 'question_code';
      END IF;

      v_option := NULL;
      IF v_answer ->> 'option_code' IS NOT NULL THEN
        SELECT * INTO v_option
          FROM public.preparation_question_options
         WHERE preparation_question_id = v_question.id
           AND code = (v_answer ->> 'option_code')
           AND active;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Line %: unknown or inactive preparation option %.', v_answer_line, v_answer ->> 'option_code';
        END IF;
      END IF;

      v_answer_unit := NULLIF(v_answer ->> 'unit_number', '')::integer;
      IF (v_question.selection_scope = 'physical_unit') <> (v_answer_unit IS NOT NULL) THEN
        RAISE EXCEPTION 'Line %: preparation answer scope does not match question scope for %.', v_answer_line, v_question.code;
      END IF;

      v_unit_id := NULL;
      v_answer_component_unit := NULL;
      IF v_answer_unit IS NOT NULL THEN
        IF v_answer_component IS NOT NULL THEN
          SELECT id INTO v_answer_component_unit
            FROM public.sales_order_line_component_units
           WHERE sales_order_line_component_id = v_answer_component_id AND unit_number = v_answer_unit;
          IF v_answer_component_unit IS NULL THEN
            RAISE EXCEPTION 'Line %: component % unit % does not exist on this order.', v_answer_line, v_answer_component, v_answer_unit;
          END IF;
        ELSE
          SELECT id INTO v_unit_id
            FROM public.sales_order_line_units
           WHERE sales_order_line_id = v_line_ids[v_answer_line] AND unit_number = v_answer_unit;
          IF v_unit_id IS NULL THEN
            RAISE EXCEPTION 'Line %: unit % does not exist on this order.', v_answer_line, v_answer_unit;
          END IF;
        END IF;
      END IF;

      INSERT INTO public.sales_order_preparation_answers (
        sales_order_line_id, sales_order_line_unit_id,
        sales_order_line_component_id, sales_order_line_component_unit_id,
        preparation_schema_version_id,
        preparation_question_id, preparation_option_id, question_code, option_code, answer_value
      ) VALUES (
        v_line_ids[v_answer_line], v_unit_id,
        v_answer_component_id, v_answer_component_unit,
        v_component_schema_version_id,
        v_question.id, v_option.id, v_question.code, v_option.code,
        COALESCE(v_answer -> 'answer_value', 'null'::jsonb)
      );
    END LOOP;
  END IF;

  -----------------------------------------------------------------------------
  -- Required-question enforcement: fail atomically if anything is missing.
  -----------------------------------------------------------------------------
  FOR v_line_number IN 1..COALESCE(array_length(v_line_ids, 1), 0) LOOP
    IF v_line_kinds[v_line_number] = 'combo' THEN
      FOR v_component_row IN
        SELECT c.id, c.component_number, pv.preparation_schema_version_id
          FROM public.sales_order_line_components c
          JOIN public.product_versions pv ON pv.id = c.product_version_id
         WHERE c.sales_order_line_id = v_line_ids[v_line_number]
      LOOP
        IF v_component_row.preparation_schema_version_id IS NULL THEN
          CONTINUE;
        END IF;

        SELECT q.code INTO v_missing_required
          FROM public.preparation_questions q
         WHERE q.preparation_schema_version_id = v_component_row.preparation_schema_version_id
           AND q.active AND q.required AND q.selection_scope = 'line'
           AND NOT EXISTS (
             SELECT 1 FROM public.sales_order_preparation_answers a
              WHERE a.sales_order_line_component_id = v_component_row.id
                AND a.preparation_question_id = q.id AND a.sales_order_line_component_unit_id IS NULL
           )
         LIMIT 1;
        IF v_missing_required IS NOT NULL THEN
          RAISE EXCEPTION 'Line %: component %: required preparation answer % is missing.', v_line_number, v_component_row.component_number, v_missing_required;
        END IF;

        SELECT q.code INTO v_missing_required
          FROM public.preparation_questions q
          JOIN public.sales_order_line_component_units u ON u.sales_order_line_component_id = v_component_row.id
         WHERE q.preparation_schema_version_id = v_component_row.preparation_schema_version_id
           AND q.active AND q.required AND q.selection_scope = 'physical_unit'
           AND NOT EXISTS (
             SELECT 1 FROM public.sales_order_preparation_answers a
              WHERE a.sales_order_line_component_unit_id = u.id AND a.preparation_question_id = q.id
           )
         LIMIT 1;
        IF v_missing_required IS NOT NULL THEN
          RAISE EXCEPTION 'Line %: component %: required per-unit preparation answer % is missing for one or more units.', v_line_number, v_component_row.component_number, v_missing_required;
        END IF;
      END LOOP;
      CONTINUE;
    END IF;

    IF v_line_schema_versions[v_line_number] IS NULL THEN
      CONTINUE;
    END IF;

    SELECT q.code INTO v_missing_required
      FROM public.preparation_questions q
     WHERE q.preparation_schema_version_id = v_line_schema_versions[v_line_number]
       AND q.active AND q.required AND q.selection_scope = 'line'
       AND NOT EXISTS (
         SELECT 1 FROM public.sales_order_preparation_answers a
          WHERE a.sales_order_line_id = v_line_ids[v_line_number]
            AND a.preparation_question_id = q.id AND a.sales_order_line_unit_id IS NULL
       )
     LIMIT 1;
    IF v_missing_required IS NOT NULL THEN
      RAISE EXCEPTION 'Line %: required preparation answer % is missing.', v_line_number, v_missing_required;
    END IF;

    SELECT q.code INTO v_missing_required
      FROM public.preparation_questions q
      JOIN public.sales_order_line_units u ON u.sales_order_line_id = v_line_ids[v_line_number]
     WHERE q.preparation_schema_version_id = v_line_schema_versions[v_line_number]
       AND q.active AND q.required AND q.selection_scope = 'physical_unit'
       AND NOT EXISTS (
         SELECT 1 FROM public.sales_order_preparation_answers a
          WHERE a.sales_order_line_unit_id = u.id AND a.preparation_question_id = q.id
       )
     LIMIT 1;
    IF v_missing_required IS NOT NULL THEN
      RAISE EXCEPTION 'Line %: required per-unit preparation answer % is missing for one or more units.', v_line_number, v_missing_required;
    END IF;
  END LOOP;

  -----------------------------------------------------------------------------
  -- Finalise order-level totals now that every line is known. This is the
  -- single controlled header projection update, run under 'order_creation'
  -- and restricted (by the trigger) to exactly the columns below. The
  -- operation is cleared immediately after so the following event INSERT (and
  -- anything else in this transaction) never inherits it.
  -----------------------------------------------------------------------------
  v_estimated_total := v_estimated_subtotal + v_delivery_fee;
  IF v_order_requires_finalisation THEN
    v_price_status := 'estimated';
    v_final_subtotal := NULL;
    v_final_total := NULL;
    v_price_finalised_at := NULL;
  ELSE
    v_price_status := 'final';
    v_final_subtotal := v_estimated_subtotal;
    v_final_total := v_estimated_total;
    v_price_finalised_at := now();
  END IF;

  PERFORM set_config('freshgo.canonical_operation', 'order_creation', true);
  UPDATE public.sales_orders
     SET requires_supplier_finalisation = v_order_requires_finalisation,
         price_status = v_price_status,
         estimated_subtotal = v_estimated_subtotal,
         estimated_total = v_estimated_total,
         final_subtotal = v_final_subtotal,
         final_total = v_final_total,
         price_finalised_at = v_price_finalised_at,
         subtotal = COALESCE(v_final_subtotal, v_estimated_subtotal),
         total = COALESCE(v_final_total, v_estimated_total)
   WHERE id = v_order_id;
  PERFORM set_config('freshgo.canonical_operation', '', true);

  INSERT INTO public.sales_order_events (sales_order_id, event_type, actor_id, payload)
  VALUES (
    v_order_id, 'order_confirmed', v_customer_id,
    jsonb_build_object(
      'order_number', v_order_number,
      'line_count', v_line_number,
      'requires_supplier_finalisation', v_order_requires_finalisation,
      'price_status', v_price_status
    )
  );

  RETURN QUERY
  SELECT v_order_id, v_order_number, v_price_status, 'pending'::text,
         v_order_requires_finalisation, v_estimated_total, v_final_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_sales_order(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_sales_order(jsonb, jsonb, jsonb, jsonb) TO authenticated;
