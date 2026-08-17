-- Phase 4B.0 (part 2): canonical combo component architecture.
--
-- Gap: combo preparation is collected PER COMPONENT today (see
-- src/lib/checkoutPreparation.ts loadPreparationTargets, which iterates
-- item.comboItems and generates one preparation target per component using
-- that component's own product questionnaire), but sales_order_lines
-- represents a purchased combo as ONE commercial line. There is no canonical
-- place to attach per-component preparation answers, physical units, or
-- supplier cost. This migration adds the minimum operational/historical
-- layer without moving revenue off the parent combo line.

-- -----------------------------------------------------------------------------
-- 1. sales_order_line_components — one row per combo component actually sold
-- -----------------------------------------------------------------------------
CREATE TABLE public.sales_order_line_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_line_id uuid NOT NULL REFERENCES public.sales_order_lines(id) ON DELETE RESTRICT,
  combo_version_item_id uuid NOT NULL REFERENCES public.combo_version_items(id) ON DELETE RESTRICT,
  component_number integer NOT NULL CHECK (component_number > 0),
  product_id text NOT NULL REFERENCES public."Product"(id) ON DELETE RESTRICT,
  product_version_id uuid NOT NULL REFERENCES public.product_versions(id) ON DELETE RESTRICT,
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(product_snapshot) = 'object'),
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  selling_unit text NOT NULL DEFAULT '',
  ordering_mode text NOT NULL,
  estimated_weight_kg numeric(12,3) CHECK (estimated_weight_kg IS NULL OR estimated_weight_kg >= 0),
  actual_weight_kg numeric(12,3) CHECK (actual_weight_kg IS NULL OR actual_weight_kg >= 0),
  supplier_id bigint REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(supplier_snapshot) = 'object'),
  unit_cost_price numeric(12,2) CHECK (unit_cost_price IS NULL OR unit_cost_price >= 0),
  estimated_supplier_cost numeric(12,2) CHECK (estimated_supplier_cost IS NULL OR estimated_supplier_cost >= 0),
  final_supplier_cost numeric(12,2) CHECK (final_supplier_cost IS NULL OR final_supplier_cost >= 0),
  finalised_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_order_line_components_number_key UNIQUE (sales_order_line_id, component_number)
);

CREATE INDEX sales_order_line_components_line_idx
  ON public.sales_order_line_components (sales_order_line_id, component_number);
CREATE INDEX sales_order_line_components_product_idx
  ON public.sales_order_line_components (product_id);

-- -----------------------------------------------------------------------------
-- 2. sales_order_line_component_units — physical units within a combo component
-- -----------------------------------------------------------------------------
CREATE TABLE public.sales_order_line_component_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_line_component_id uuid NOT NULL REFERENCES public.sales_order_line_components(id) ON DELETE RESTRICT,
  unit_number integer NOT NULL CHECK (unit_number > 0),
  physical_unit_type text NOT NULL CHECK (physical_unit_type IN ('chicken', 'fish', 'other')),
  estimated_weight_kg numeric(12,3) CHECK (estimated_weight_kg IS NULL OR estimated_weight_kg >= 0),
  actual_weight_kg numeric(12,3) CHECK (actual_weight_kg IS NULL OR actual_weight_kg >= 0),
  unit_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(unit_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_order_line_component_units_number_key UNIQUE (sales_order_line_component_id, unit_number)
);

-- -----------------------------------------------------------------------------
-- 3. sales_order_preparation_answers — extend scope to components/component units
-- -----------------------------------------------------------------------------
ALTER TABLE public.sales_order_preparation_answers
  ADD COLUMN sales_order_line_component_id uuid REFERENCES public.sales_order_line_components(id) ON DELETE RESTRICT,
  ADD COLUMN sales_order_line_component_unit_id uuid REFERENCES public.sales_order_line_component_units(id) ON DELETE RESTRICT;

-- An answer targets exactly one scope: the plain line, a normal physical unit,
-- a combo component, or a combo component's physical unit. It never mixes the
-- normal-line-unit path with the combo-component path.
ALTER TABLE public.sales_order_preparation_answers
  ADD CONSTRAINT sales_order_preparation_answers_scope_exclusive_check CHECK (
    (sales_order_line_unit_id IS NULL OR sales_order_line_component_id IS NULL)
    AND (sales_order_line_component_unit_id IS NULL OR sales_order_line_component_id IS NOT NULL)
  );

ALTER TABLE public.sales_order_preparation_answers
  DROP CONSTRAINT sales_order_preparation_answer_scope_key;
ALTER TABLE public.sales_order_preparation_answers
  ADD CONSTRAINT sales_order_preparation_answer_scope_key
    UNIQUE NULLS NOT DISTINCT (
      sales_order_line_id, sales_order_line_unit_id,
      sales_order_line_component_id, sales_order_line_component_unit_id, question_code
    );

-- Extend the existing INSERT validation trigger to understand component scope.
CREATE OR REPLACE FUNCTION public.phase1_validate_preparation_answer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_question record;
  v_option record;
  v_component record;
BEGIN
  SELECT q.id, q.code, q.preparation_schema_version_id, q.selection_scope
    INTO v_question
    FROM public.preparation_questions q
   WHERE q.id = NEW.preparation_question_id;
  IF NOT FOUND OR v_question.preparation_schema_version_id <> NEW.preparation_schema_version_id THEN
    RAISE EXCEPTION 'Preparation question does not belong to the supplied schema version.';
  END IF;
  IF NEW.question_code <> v_question.code THEN
    RAISE EXCEPTION 'question_code must be the immutable code from the referenced question.';
  END IF;
  IF (v_question.selection_scope = 'physical_unit')
     <> (NEW.sales_order_line_unit_id IS NOT NULL OR NEW.sales_order_line_component_unit_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Preparation answer scope must match the question selection scope.';
  END IF;
  IF NEW.preparation_option_id IS NOT NULL THEN
    SELECT o.id, o.code INTO v_option FROM public.preparation_question_options o WHERE o.id = NEW.preparation_option_id;
    IF NOT FOUND OR v_option.id IS NULL OR v_option.code <> NEW.option_code THEN
      RAISE EXCEPTION 'option_code must be the immutable code from the referenced option.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.preparation_question_options o WHERE o.id = NEW.preparation_option_id AND o.preparation_question_id = NEW.preparation_question_id) THEN
      RAISE EXCEPTION 'Preparation option does not belong to the referenced question.';
    END IF;
  ELSIF NEW.option_code IS NOT NULL THEN
    RAISE EXCEPTION 'option_code requires preparation_option_id.';
  END IF;
  IF NEW.sales_order_line_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sales_order_line_units u WHERE u.id = NEW.sales_order_line_unit_id AND u.sales_order_line_id = NEW.sales_order_line_id
  ) THEN
    RAISE EXCEPTION 'Preparation unit must belong to the referenced order line.';
  END IF;
  IF NEW.sales_order_line_component_id IS NOT NULL THEN
    SELECT c.id, c.sales_order_line_id INTO v_component
      FROM public.sales_order_line_components c
     WHERE c.id = NEW.sales_order_line_component_id;
    IF NOT FOUND OR v_component.sales_order_line_id <> NEW.sales_order_line_id THEN
      RAISE EXCEPTION 'Preparation component must belong to the referenced order line.';
    END IF;
  END IF;
  IF NEW.sales_order_line_component_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sales_order_line_component_units u
     WHERE u.id = NEW.sales_order_line_component_unit_id
       AND u.sales_order_line_component_id = NEW.sales_order_line_component_id
  ) THEN
    RAISE EXCEPTION 'Preparation component unit must belong to the referenced component.';
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Immutability: extend the operation-scoped canonical mutation guard.
--    Only actual_weight_kg / final_supplier_cost / finalised_at may change,
--    and only under the 'price_finalisation' operation — same philosophy as
--    sales_order_lines / sales_order_line_units in 20260916000000.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.phase1_prevent_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation text := current_setting('freshgo.canonical_operation', true);
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Order snapshots are append-only. DELETE is never allowed.';
  END IF;

  IF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'price_finalisation'
     AND (to_jsonb(NEW) - ARRAY['price_status', 'final_subtotal', 'final_total',
       'subtotal', 'total', 'price_finalised_at', 'price_finalised_by'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['price_status', 'final_subtotal', 'final_total',
       'subtotal', 'total', 'price_finalised_at', 'price_finalised_by']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'receipt_submission'
     AND (to_jsonb(NEW) - ARRAY['payment_status', 'receipt_submitted_at'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['payment_status', 'receipt_submitted_at']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'payment_rejection'
     AND (to_jsonb(NEW) - ARRAY['payment_status'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['payment_status']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_orders' AND v_operation = 'payment_confirmation'
     AND (to_jsonb(NEW) - ARRAY['payment_status', 'paid_at', 'paid_by'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['payment_status', 'paid_at', 'paid_by']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_order_lines' AND v_operation = 'price_finalisation'
     AND (to_jsonb(NEW) - ARRAY['actual_weight_kg', 'final_line_total',
       'final_supplier_cost', 'finalised_at', 'line_total'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['actual_weight_kg', 'final_line_total',
       'final_supplier_cost', 'finalised_at', 'line_total']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_order_line_units' AND v_operation = 'price_finalisation'
     AND (to_jsonb(NEW) - ARRAY['actual_weight_kg'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['actual_weight_kg']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_order_line_components' AND v_operation = 'price_finalisation'
     AND (to_jsonb(NEW) - ARRAY['actual_weight_kg', 'final_supplier_cost', 'finalised_at'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['actual_weight_kg', 'final_supplier_cost', 'finalised_at']) THEN
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sales_order_line_component_units' AND v_operation = 'price_finalisation'
     AND (to_jsonb(NEW) - ARRAY['actual_weight_kg'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['actual_weight_kg']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Unexpected or unauthorized canonical mutation.';
END;
$$;

ALTER TABLE public.sales_order_line_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_line_component_units ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER sales_order_line_components_append_only
  BEFORE UPDATE OR DELETE ON public.sales_order_line_components
  FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_snapshot_mutation();
CREATE TRIGGER sales_order_line_component_units_append_only
  BEFORE UPDATE OR DELETE ON public.sales_order_line_component_units
  FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_snapshot_mutation();

-- -----------------------------------------------------------------------------
-- 5. RLS: same visibility rule as the existing line/unit tables (customer owns
--    the parent order, or admin). No customer/supplier direct write policy;
--    all writes happen through place_sales_order / finalize_sales_order_pricing.
-- -----------------------------------------------------------------------------
CREATE POLICY phase4b0_sales_order_line_components_select ON public.sales_order_line_components
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.sales_order_lines l
      JOIN public.sales_orders o ON o.id = l.sales_order_id
      WHERE l.id = sales_order_line_id AND (o.customer_id = auth.uid() OR public.is_admin())
    )
  );
CREATE POLICY phase4b0_sales_order_line_component_units_select ON public.sales_order_line_component_units
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.sales_order_line_components c
      JOIN public.sales_order_lines l ON l.id = c.sales_order_line_id
      JOIN public.sales_orders o ON o.id = l.sales_order_id
      WHERE c.id = sales_order_line_component_id AND (o.customer_id = auth.uid() OR public.is_admin())
    )
  );

GRANT SELECT ON TABLE
  public.sales_order_line_components,
  public.sales_order_line_component_units
TO authenticated, service_role;
