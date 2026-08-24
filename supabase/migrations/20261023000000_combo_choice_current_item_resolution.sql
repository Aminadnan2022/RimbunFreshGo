-- Resolve checkout Customer Choice ids against the immutable combo version.
--
-- The storefront sends the selected current combo_items.id. Re-saving a combo
-- can recreate those rows after a version was published, so that id need not
-- equal combo_version_items.source_combo_item_id. Resolve the current id only
-- when it still belongs to the same combo/group/product as the order version.

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
      RAISE EXCEPTION 'Line %: choose exactly one option for Customer Choice %.',
        NEW.line_number, v_group.choice_group_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

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
BEGIN
  SELECT * INTO v_choice
    FROM public.combo_version_items
   WHERE id = NEW.combo_version_item_id;

  IF v_choice.choice_group_key IS NULL THEN RETURN NEW; END IF;

  SELECT so.source_payload->'items'->(sol.line_number - 1)
    INTO v_item
    FROM public.sales_order_lines sol
    JOIN public.sales_orders so ON so.id = sol.sales_order_id
   WHERE sol.id = NEW.sales_order_line_id;

  IF EXISTS (
    SELECT 1
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
  ) THEN
    NEW.product_snapshot := COALESCE(NEW.product_snapshot, '{}'::jsonb) || jsonb_build_object(
      'choice_group_key', v_choice.choice_group_key,
      'choice_group_label', v_choice.choice_group_label,
      'price_adjustment', v_choice.price_adjustment,
      'selected_combo_item_id', (
        SELECT selected->>'combo_item_id'
          FROM jsonb_array_elements(COALESCE(v_item->'combo_selections', '[]'::jsonb)) selected
         WHERE selected->>'choice_group_key' = v_choice.choice_group_key
         LIMIT 1
      )
    );
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

COMMIT;
