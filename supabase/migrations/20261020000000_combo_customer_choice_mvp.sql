-- Customer Choice MVP. Fixed rows remain NULL and preserve all legacy behaviour.
BEGIN;

ALTER TABLE public.combo_items
  ADD COLUMN IF NOT EXISTS choice_group_key text,
  ADD COLUMN IF NOT EXISTS choice_group_label text,
  ADD COLUMN IF NOT EXISTS price_adjustment numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.combo_items ADD CONSTRAINT combo_items_choice_metadata_check
  CHECK ((choice_group_key IS NULL AND choice_group_label IS NULL) OR
         (NULLIF(btrim(choice_group_key), '') IS NOT NULL AND NULLIF(btrim(choice_group_label), '') IS NOT NULL));

ALTER TABLE public.combo_version_items
  ADD COLUMN IF NOT EXISTS source_combo_item_id uuid,
  ADD COLUMN IF NOT EXISTS choice_group_key text,
  ADD COLUMN IF NOT EXISTS choice_group_label text,
  ADD COLUMN IF NOT EXISTS price_adjustment numeric(12,2) NOT NULL DEFAULT 0;

ALTER FUNCTION public.admin_save_combo(text, jsonb, jsonb) RENAME TO admin_save_combo_choice_core;
CREATE FUNCTION public.admin_save_combo(p_combo_id text, p_combo jsonb, p_items jsonb DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  IF p_items IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item
     WHERE NULLIF(item->>'choice_group_key', '') IS NOT NULL
       AND NULLIF(btrim(item->>'choice_group_label'), '') IS NULL
  ) THEN RAISE EXCEPTION 'Every Customer Choice needs a label.' USING ERRCODE = '22023'; END IF;
  IF p_items IS NOT NULL AND EXISTS (
    SELECT 1 FROM (
      SELECT item->>'choice_group_key' key, count(*) option_count
      FROM jsonb_array_elements(p_items) item
      WHERE NULLIF(item->>'choice_group_key', '') IS NOT NULL GROUP BY 1
    ) groups WHERE option_count < 2
  ) THEN RAISE EXCEPTION 'Every Customer Choice needs at least 2 options.' USING ERRCODE = '22023'; END IF;
  v_id := public.admin_save_combo_choice_core(p_combo_id, p_combo, p_items);
  IF p_items IS NOT NULL THEN
    UPDATE public.combo_items ci SET
      choice_group_key = NULLIF(item->>'choice_group_key', ''),
      choice_group_label = NULLIF(btrim(item->>'choice_group_label'), ''),
      price_adjustment = COALESCE((item->>'price_adjustment')::numeric, 0)
    FROM jsonb_array_elements(p_items) WITH ORDINALITY payload(item, ordinality)
    WHERE ci.combo_id = v_id AND ci.sort_order = COALESCE((item->>'sort_order')::integer, ordinality - 1);
  END IF;
  RETURN v_id;
END; $$;

ALTER FUNCTION public.admin_duplicate_combo(text) RENAME TO admin_duplicate_combo_choice_core;
CREATE FUNCTION public.admin_duplicate_combo(p_source_combo_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_new_id text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  v_new_id := public.admin_duplicate_combo_choice_core(p_source_combo_id);
  UPDATE public.combo_items target SET
    choice_group_key = source.choice_group_key,
    choice_group_label = source.choice_group_label,
    price_adjustment = source.price_adjustment
  FROM public.combo_items source
  WHERE source.combo_id = p_source_combo_id AND target.combo_id = v_new_id
    AND target.sort_order = source.sort_order AND target.product_id = source.product_id;
  RETURN v_new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.combo_choice_version_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  SELECT ci.id, ci.choice_group_key, ci.choice_group_label, ci.price_adjustment
    INTO NEW.source_combo_item_id, NEW.choice_group_key, NEW.choice_group_label, NEW.price_adjustment
    FROM public.combo_versions cv JOIN public.combo_items ci ON ci.combo_id = cv.combo_id
   WHERE cv.id = NEW.combo_version_id AND ci.product_id = NEW.product_id AND ci.sort_order = NEW.display_order
   LIMIT 1;
  RETURN NEW;
END; $$;
CREATE TRIGGER combo_choice_version_snapshot BEFORE INSERT ON public.combo_version_items
FOR EACH ROW EXECUTE FUNCTION public.combo_choice_version_snapshot();

CREATE OR REPLACE FUNCTION public.combo_choice_validate_order_line()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_item jsonb; v_group record; v_count integer;
BEGIN
  IF NEW.item_kind <> 'combo' THEN RETURN NEW; END IF;
  SELECT so.source_payload->'items'->(NEW.line_number - 1) INTO v_item
    FROM public.sales_orders so WHERE so.id = NEW.sales_order_id;
  FOR v_group IN SELECT choice_group_key FROM public.combo_version_items
    WHERE combo_version_id = NEW.combo_version_id AND choice_group_key IS NOT NULL GROUP BY choice_group_key
  LOOP
    SELECT count(*) INTO v_count FROM jsonb_array_elements(COALESCE(v_item->'combo_selections', '[]'::jsonb)) selected
    JOIN public.combo_version_items cvi ON cvi.combo_version_id = NEW.combo_version_id
      AND cvi.choice_group_key = v_group.choice_group_key
      AND cvi.source_combo_item_id::text = selected->>'combo_item_id'
    WHERE selected->>'choice_group_key' = v_group.choice_group_key;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'Line %: choose exactly one option for Customer Choice %.', NEW.line_number, v_group.choice_group_key USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS combo_builder_require_active_combo ON public.sales_order_lines;
CREATE TRIGGER combo_builder_require_active_combo BEFORE INSERT ON public.sales_order_lines
FOR EACH ROW EXECUTE FUNCTION public.combo_builder_require_active_combo();
CREATE TRIGGER combo_choice_validate_order_line BEFORE INSERT ON public.sales_order_lines
FOR EACH ROW EXECUTE FUNCTION public.combo_choice_validate_order_line();

CREATE OR REPLACE FUNCTION public.combo_choice_filter_component()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_item jsonb; v_choice public.combo_version_items%ROWTYPE;
BEGIN
  SELECT * INTO v_choice FROM public.combo_version_items WHERE id = NEW.combo_version_item_id;
  IF v_choice.choice_group_key IS NULL THEN RETURN NEW; END IF;
  SELECT so.source_payload->'items'->(sol.line_number - 1) INTO v_item
    FROM public.sales_order_lines sol JOIN public.sales_orders so ON so.id = sol.sales_order_id
   WHERE sol.id = NEW.sales_order_line_id;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_item->'combo_selections', '[]'::jsonb)) selected
    WHERE selected->>'choice_group_key' = v_choice.choice_group_key
      AND selected->>'combo_item_id' = v_choice.source_combo_item_id::text) THEN
    NEW.product_snapshot := COALESCE(NEW.product_snapshot, '{}'::jsonb) || jsonb_build_object(
      'choice_group_key', v_choice.choice_group_key, 'choice_group_label', v_choice.choice_group_label,
      'price_adjustment', v_choice.price_adjustment, 'selected_combo_item_id', v_choice.source_combo_item_id);
    RETURN NEW;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER combo_choice_filter_component BEFORE INSERT ON public.sales_order_line_components
FOR EACH ROW EXECUTE FUNCTION public.combo_choice_filter_component();

REVOKE ALL ON FUNCTION public.admin_save_combo(text, jsonb, jsonb), public.admin_duplicate_combo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_combo(text, jsonb, jsonb), public.admin_duplicate_combo(text) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.combo_items, public.combo_version_items FROM authenticated;
COMMIT;
