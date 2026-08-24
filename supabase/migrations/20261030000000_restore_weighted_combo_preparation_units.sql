-- Preserve whole-fish component unit materialisation while scaling every
-- component's physical units across the number of ordered combo copies.

CREATE OR REPLACE FUNCTION public.phase4b2_materialize_component_preparation_units()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version public.product_versions%ROWTYPE;
  v_combo_quantity numeric;
  v_unit_count integer;
  v_estimated_unit_weight_kg numeric;
  v_unit_number integer;
BEGIN
  SELECT * INTO v_version FROM public.product_versions WHERE id = NEW.product_version_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v_version.ordering_mode <> 'whole_fish_by_weight'
     AND NOT public.phase4b2_has_physical_unit_preparation(v_version.preparation_schema_version_id) THEN
    RETURN NEW;
  END IF;

  SELECT quantity INTO v_combo_quantity FROM public.sales_order_lines WHERE id = NEW.sales_order_line_id;
  IF NEW.quantity <> trunc(NEW.quantity) OR NEW.quantity <= 0
     OR v_combo_quantity IS NULL OR v_combo_quantity <> trunc(v_combo_quantity) OR v_combo_quantity <= 0 THEN
    RAISE EXCEPTION 'Combo component % requires positive whole component and combo quantities (component %, combo %).',
      NEW.component_number, NEW.quantity, v_combo_quantity;
  END IF;

  v_unit_count := (NEW.quantity * v_combo_quantity)::integer;
  v_estimated_unit_weight_kg := CASE
    WHEN v_version.ordering_mode = 'whole_fish_by_weight' AND NEW.estimated_weight_kg IS NOT NULL
      THEN round(NEW.estimated_weight_kg / NEW.quantity, 3)
    ELSE NULLIF(v_version.configuration ->> 'average_weight_g', '')::numeric / 1000
  END;

  FOR v_unit_number IN 1..v_unit_count LOOP
    INSERT INTO public.sales_order_line_component_units (
      sales_order_line_component_id, unit_number, physical_unit_type,
      estimated_weight_kg, actual_weight_kg, unit_snapshot
    ) VALUES (
      NEW.id, v_unit_number,
      CASE WHEN v_version.physical_unit_type IN ('chicken', 'fish') THEN v_version.physical_unit_type ELSE 'other' END,
      v_estimated_unit_weight_kg, NULL,
      jsonb_build_object(
        'source', CASE WHEN v_version.ordering_mode = 'whole_fish_by_weight' THEN 'ordering_mode' ELSE 'preparation_schema' END,
        'ordering_mode', v_version.ordering_mode,
        'combo_unit_number', ((v_unit_number - 1) / NEW.quantity::integer) + 1,
        'component_unit_number', ((v_unit_number - 1) % NEW.quantity::integer) + 1
      )
    ) ON CONFLICT (sales_order_line_component_id, unit_number) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;
