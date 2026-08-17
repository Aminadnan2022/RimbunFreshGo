-- Phase 4B.2 corrective migration: preparation physical units.
--
-- Preparation scope and pricing scope are separate. A fixed_quantity chicken
-- can require one preparation answer per physical chicken without becoming a
-- supplier-weighed order. Whole-fish units continue to be created by
-- place_sales_order's existing weight-specific branch.

CREATE OR REPLACE FUNCTION public.phase4b2_has_physical_unit_preparation(
  p_preparation_schema_version_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.preparation_questions q
     WHERE q.preparation_schema_version_id = p_preparation_schema_version_id
       AND q.active
       AND q.selection_scope = 'physical_unit'
  );
$$;

CREATE OR REPLACE FUNCTION public.phase4b2_materialize_line_preparation_units()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version public.product_versions%ROWTYPE;
  v_unit_count integer;
  v_average_weight_kg numeric;
  v_unit_number integer;
BEGIN
  SELECT * INTO v_version
    FROM public.product_versions
   WHERE id = NEW.product_version_id;

  IF NOT FOUND OR v_version.ordering_mode = 'whole_fish_by_weight'
     OR NOT public.phase4b2_has_physical_unit_preparation(v_version.preparation_schema_version_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity <> trunc(NEW.quantity) OR NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Line % requires physical preparation units but quantity % is not a positive whole count.', NEW.line_number, NEW.quantity;
  END IF;
  v_unit_count := NEW.quantity::integer;
  v_average_weight_kg := NULLIF(v_version.configuration ->> 'average_weight_g', '')::numeric / 1000;

  FOR v_unit_number IN 1..v_unit_count LOOP
    INSERT INTO public.sales_order_line_units (
      sales_order_line_id, unit_number, physical_unit_type,
      estimated_weight_kg, actual_weight_kg, unit_snapshot
    ) VALUES (
      NEW.id,
      v_unit_number,
      CASE WHEN v_version.physical_unit_type IN ('chicken', 'fish') THEN v_version.physical_unit_type ELSE 'other' END,
      CASE WHEN v_average_weight_kg IS NULL THEN NULL ELSE round(v_average_weight_kg, 3) END,
      NULL,
      jsonb_build_object('source', 'preparation_schema', 'ordering_mode', v_version.ordering_mode)
    )
    ON CONFLICT (sales_order_line_id, unit_number) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.phase4b2_materialize_component_preparation_units()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version public.product_versions%ROWTYPE;
  v_unit_count integer;
  v_average_weight_kg numeric;
  v_unit_number integer;
BEGIN
  SELECT * INTO v_version
    FROM public.product_versions
   WHERE id = NEW.product_version_id;

  IF NOT FOUND OR v_version.ordering_mode = 'whole_fish_by_weight'
     OR NOT public.phase4b2_has_physical_unit_preparation(v_version.preparation_schema_version_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity <> trunc(NEW.quantity) OR NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Combo component % requires physical preparation units but quantity % is not a positive whole count.', NEW.component_number, NEW.quantity;
  END IF;
  v_unit_count := NEW.quantity::integer;
  v_average_weight_kg := NULLIF(v_version.configuration ->> 'average_weight_g', '')::numeric / 1000;

  FOR v_unit_number IN 1..v_unit_count LOOP
    INSERT INTO public.sales_order_line_component_units (
      sales_order_line_component_id, unit_number, physical_unit_type,
      estimated_weight_kg, actual_weight_kg, unit_snapshot
    ) VALUES (
      NEW.id,
      v_unit_number,
      CASE WHEN v_version.physical_unit_type IN ('chicken', 'fish') THEN v_version.physical_unit_type ELSE 'other' END,
      CASE WHEN v_average_weight_kg IS NULL THEN NULL ELSE round(v_average_weight_kg, 3) END,
      NULL,
      jsonb_build_object('source', 'preparation_schema', 'ordering_mode', v_version.ordering_mode)
    )
    ON CONFLICT (sales_order_line_component_id, unit_number) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_order_lines_materialize_preparation_units
  AFTER INSERT ON public.sales_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.phase4b2_materialize_line_preparation_units();

CREATE TRIGGER sales_order_line_components_materialize_preparation_units
  AFTER INSERT ON public.sales_order_line_components
  FOR EACH ROW EXECUTE FUNCTION public.phase4b2_materialize_component_preparation_units();

-- Preparation units are not automatically weighable. Only physical units on
-- whole_fish_by_weight parents may receive supplier actual weights.
CREATE OR REPLACE FUNCTION public.record_sales_order_line_unit_actual_weight(
  p_sales_order_line_unit_id uuid, p_actual_weight_kg numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unit public.sales_order_line_units%ROWTYPE;
  v_line public.sales_order_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_unit
    FROM public.sales_order_line_units
   WHERE id = p_sales_order_line_unit_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order line unit not found.'; END IF;

  SELECT * INTO v_line FROM public.sales_order_lines WHERE id = v_unit.sales_order_line_id;
  IF NOT (public.is_admin() OR public.is_supplier_for_sales_order_line(v_line.id)) THEN
    RAISE EXCEPTION 'Not authorized for this order line.';
  END IF;
  IF v_line.ordering_mode <> 'whole_fish_by_weight' THEN
    RAISE EXCEPTION 'Actual unit weight is only allowed for whole_fish_by_weight lines.';
  END IF;
  IF p_actual_weight_kg IS NULL OR p_actual_weight_kg < 0 THEN
    RAISE EXCEPTION 'Invalid actual weight.';
  END IF;
  IF v_line.final_line_total IS NOT NULL THEN
    RAISE EXCEPTION 'This line is already finalised.';
  END IF;

  PERFORM set_config('freshgo.canonical_operation', 'price_finalisation', true);
  UPDATE public.sales_order_line_units
     SET actual_weight_kg = p_actual_weight_kg
   WHERE id = p_sales_order_line_unit_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_sales_order_line_component_unit_actual_weight(
  p_sales_order_line_component_unit_id uuid, p_actual_weight_kg numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unit public.sales_order_line_component_units%ROWTYPE;
  v_component public.sales_order_line_components%ROWTYPE;
BEGIN
  SELECT * INTO v_unit
    FROM public.sales_order_line_component_units
   WHERE id = p_sales_order_line_component_unit_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Combo component unit not found.'; END IF;

  SELECT * INTO v_component
    FROM public.sales_order_line_components
   WHERE id = v_unit.sales_order_line_component_id;
  IF NOT (public.is_admin() OR public.is_supplier_for_sales_order_line_component(v_component.id)) THEN
    RAISE EXCEPTION 'Not authorized for this combo component.';
  END IF;
  IF v_component.ordering_mode <> 'whole_fish_by_weight' THEN
    RAISE EXCEPTION 'Actual component unit weight is only allowed for whole_fish_by_weight components.';
  END IF;
  IF p_actual_weight_kg IS NULL OR p_actual_weight_kg < 0 THEN
    RAISE EXCEPTION 'Invalid actual weight.';
  END IF;
  IF v_component.final_supplier_cost IS NOT NULL THEN
    RAISE EXCEPTION 'This component is already finalised.';
  END IF;

  PERFORM set_config('freshgo.canonical_operation', 'price_finalisation', true);
  UPDATE public.sales_order_line_component_units
     SET actual_weight_kg = p_actual_weight_kg
   WHERE id = p_sales_order_line_component_unit_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.phase4b2_has_physical_unit_preparation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.phase4b2_materialize_line_preparation_units() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.phase4b2_materialize_component_preparation_units() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_sales_order_line_unit_actual_weight(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_sales_order_line_component_unit_actual_weight(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_sales_order_line_unit_actual_weight(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_sales_order_line_component_unit_actual_weight(uuid, numeric) TO authenticated;
