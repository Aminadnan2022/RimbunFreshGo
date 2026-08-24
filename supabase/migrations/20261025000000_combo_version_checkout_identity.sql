-- Bind storefront carts to the exact immutable combo recipe they displayed.
-- Editing and activating a combo publishes a new effective version; checkout
-- rejects carts that do not name that current version.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_set_combo_lifecycle(
  p_combo_id text,
  p_lifecycle_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_combo public.combos%ROWTYPE;
  v_combo_version_id uuid;
  v_missing_product text;
  v_published_at timestamptz := clock_timestamp();
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  IF p_lifecycle_status NOT IN ('draft', 'active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid combo lifecycle status.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_combo FROM public.combos WHERE id = p_combo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Combo % not found.', p_combo_id USING ERRCODE = 'P0002';
  END IF;

  IF p_lifecycle_status <> 'active' THEN
    UPDATE public.combos
       SET lifecycle_status = p_lifecycle_status,
           active = false,
           featured = false,
           updated_at = now()
     WHERE id = p_combo_id;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.combo_items WHERE combo_id = p_combo_id) THEN
    RAISE EXCEPTION 'A combo needs at least one item before activation.' USING ERRCODE = '22023';
  END IF;

  SELECT ci.product_id INTO v_missing_product
    FROM public.combo_items ci
   WHERE ci.combo_id = p_combo_id
     AND NOT EXISTS (
       SELECT 1 FROM public.product_versions pv
        WHERE pv.product_id = ci.product_id
          AND pv.status = 'published'
          AND pv.effective_from <= v_published_at
          AND (pv.effective_to IS NULL OR pv.effective_to > v_published_at)
     )
   LIMIT 1;
  IF v_missing_product IS NOT NULL THEN
    RAISE EXCEPTION 'Combo component % has no published canonical product version.', v_missing_product;
  END IF;

  UPDATE public.combo_versions
     SET effective_to = v_published_at
   WHERE combo_id = p_combo_id
     AND status = 'published'
     AND effective_from <= v_published_at
     AND (effective_to IS NULL OR effective_to > v_published_at);

  INSERT INTO public.combo_versions (
    combo_id, version_number, status, effective_from, selling_price,
    currency_code, configuration, display_snapshot, published_at, published_by
  ) VALUES (
    p_combo_id,
    COALESCE((SELECT MAX(version_number) FROM public.combo_versions WHERE combo_id = p_combo_id), 0) + 1,
    'published', v_published_at, v_combo.price, 'MYR', '{}'::jsonb,
    jsonb_build_object('name', v_combo.name, 'name_ms', v_combo.name_ms),
    v_published_at, auth.uid()
  ) RETURNING id INTO v_combo_version_id;

  INSERT INTO public.combo_version_items (
    combo_version_id, product_id, product_version_id, quantity, unit_snapshot, display_order
  )
  SELECT
    v_combo_version_id, ci.product_id, pv.id, ci.quantity_value,
    jsonb_build_object('selling_unit', ci.selling_unit), ci.sort_order
  FROM public.combo_items ci
  JOIN LATERAL (
    SELECT id FROM public.product_versions pv
     WHERE pv.product_id = ci.product_id
       AND pv.status = 'published'
       AND pv.effective_from <= v_published_at
       AND (pv.effective_to IS NULL OR pv.effective_to > v_published_at)
     ORDER BY pv.effective_from DESC
     LIMIT 1
  ) pv ON true
  WHERE ci.combo_id = p_combo_id
  ORDER BY ci.sort_order;

  UPDATE public.combos
     SET lifecycle_status = 'active', active = true, updated_at = now()
   WHERE id = p_combo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_combo_lifecycle(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_combo_lifecycle(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.combo_choice_validate_order_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_group record;
  v_count integer;
  v_expected_component_count integer;
BEGIN
  IF NEW.item_kind <> 'combo' THEN RETURN NEW; END IF;

  SELECT so.source_payload->'items'->(NEW.line_number - 1)
    INTO v_item
    FROM public.sales_orders so
   WHERE so.id = NEW.sales_order_id;

  IF v_item->>'combo_version_id' IS DISTINCT FROM NEW.combo_version_id::text THEN
    RAISE EXCEPTION
      'Line %: this combo has changed. Refresh and reselect it before placing the order.',
      NEW.line_number;
  END IF;

  FOR v_group IN
    SELECT choice_group_key
      FROM public.combo_version_items
     WHERE combo_version_id = NEW.combo_version_id
       AND choice_group_key IS NOT NULL
     GROUP BY choice_group_key
  LOOP
    SELECT count(*)
      INTO v_count
      FROM jsonb_array_elements(COALESCE(v_item->'combo_selections', '[]'::jsonb)) selected
     WHERE selected->>'choice_group_key' = v_group.choice_group_key
       AND EXISTS (
         SELECT 1
          FROM public.combo_version_items cvi
          WHERE cvi.combo_version_id = NEW.combo_version_id
            AND cvi.choice_group_key = v_group.choice_group_key
            AND cvi.id::text = selected->>'combo_item_id'
       );
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'Line %: choose exactly one option for Customer Choice %.', NEW.line_number, v_group.choice_group_key;
    END IF;
  END LOOP;

  SELECT count(*) FILTER (WHERE choice_group_key IS NULL)
         + count(DISTINCT choice_group_key) FILTER (WHERE choice_group_key IS NOT NULL)
    INTO v_expected_component_count
    FROM public.combo_version_items
   WHERE combo_version_id = NEW.combo_version_id;

  IF jsonb_typeof(v_item->'combo_components') <> 'array'
     OR jsonb_array_length(v_item->'combo_components') <> v_expected_component_count
  THEN
    RAISE EXCEPTION
      'Line %: this combo has changed. Refresh and reselect it before placing the order.',
      NEW.line_number;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.combo_choice_filter_component()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_choice public.combo_version_items%ROWTYPE;
  v_combo_id text;
  v_projected_number integer;
  v_expected jsonb;
  v_selected_combo_item_id text;
BEGIN
  SELECT * INTO v_choice
    FROM public.combo_version_items
   WHERE id = NEW.combo_version_item_id;

  SELECT so.source_payload->'items'->(sol.line_number - 1), sol.combo_id
    INTO v_item, v_combo_id
    FROM public.sales_order_lines sol
    JOIN public.sales_orders so ON so.id = sol.sales_order_id
   WHERE sol.id = NEW.sales_order_line_id;

  IF v_choice.choice_group_key IS NOT NULL THEN
    SELECT selected->>'combo_item_id'
      INTO v_selected_combo_item_id
      FROM jsonb_array_elements(COALESCE(v_item->'combo_selections', '[]'::jsonb)) selected
      JOIN public.combo_versions cv ON cv.id = v_choice.combo_version_id
     WHERE selected->>'choice_group_key' = v_choice.choice_group_key
       AND (
         selected->>'combo_item_id' = v_choice.id::text
         OR selected->>'combo_item_id' = v_choice.source_combo_item_id::text
         OR EXISTS (
           SELECT 1
             FROM public.combo_items ci
            WHERE ci.id::text = selected->>'combo_item_id'
              AND ci.combo_id = cv.combo_id
              AND ci.choice_group_key = v_choice.choice_group_key
              AND ci.product_id = v_choice.product_id
         )
       )
     LIMIT 1;

    IF v_selected_combo_item_id IS NULL THEN RETURN NULL; END IF;
  END IF;

  SELECT count(*) + 1
    INTO v_projected_number
    FROM public.sales_order_line_components
   WHERE sales_order_line_id = NEW.sales_order_line_id;

  v_expected := v_item->'combo_components'->(v_projected_number - 1);
  IF v_expected IS NULL
     OR (v_expected->>'component_number')::integer IS DISTINCT FROM v_projected_number
     OR v_expected->>'product_id' IS DISTINCT FROM v_choice.product_id
     OR NOT (
       v_expected->>'combo_item_id' = v_choice.id::text
       OR v_expected->>'combo_item_id' = v_choice.source_combo_item_id::text
       OR EXISTS (
         SELECT 1
           FROM public.combo_items ci
          WHERE ci.id::text = v_expected->>'combo_item_id'
            AND ci.combo_id::text = v_combo_id
            AND ci.product_id = v_choice.product_id
            AND ci.choice_group_key IS NOT DISTINCT FROM v_choice.choice_group_key
       )
     )
  THEN
    RAISE EXCEPTION
      'This combo has changed at component %. Refresh and reselect it before placing the order.',
      v_projected_number;
  END IF;

  NEW.component_number := v_projected_number;
  IF v_choice.choice_group_key IS NOT NULL THEN
    NEW.product_snapshot := COALESCE(NEW.product_snapshot, '{}'::jsonb) || jsonb_build_object(
      'choice_group_key', v_choice.choice_group_key,
      'choice_group_label', v_choice.choice_group_label,
      'price_adjustment', v_choice.price_adjustment,
      'selected_combo_item_id', v_selected_combo_item_id
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
