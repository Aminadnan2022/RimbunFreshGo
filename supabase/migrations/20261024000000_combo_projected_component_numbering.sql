-- Give the actual fixed/selected combo projection one canonical, contiguous
-- component numbering contract shared by checkout preparation and the order.

BEGIN;

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
           JOIN public.combo_versions cv ON cv.id = cvi.combo_version_id
          WHERE cvi.combo_version_id = NEW.combo_version_id
            AND cvi.choice_group_key = v_group.choice_group_key
            AND (
              cvi.source_combo_item_id::text = selected->>'combo_item_id'
              OR EXISTS (
                SELECT 1
                  FROM public.combo_items ci
                 WHERE ci.id::text = selected->>'combo_item_id'
                   AND ci.combo_id = cv.combo_id
                   AND ci.choice_group_key = cvi.choice_group_key
                   AND ci.product_id = cvi.product_id
              )
            )
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
         selected->>'combo_item_id' = v_choice.source_combo_item_id::text
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
       v_expected->>'combo_item_id' = v_choice.source_combo_item_id::text
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
