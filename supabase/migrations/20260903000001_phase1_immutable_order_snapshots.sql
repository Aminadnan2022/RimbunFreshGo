-- Phase 1: normalized immutable order snapshots.
-- This is intentionally not wired into CheckoutPage yet. Existing Orders JSONB
-- and operational workflows continue unchanged until a later cutover phase.

CREATE TABLE public.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_order_id bigint UNIQUE REFERENCES public."Orders"(id) ON DELETE SET NULL,
  order_number text NOT NULL UNIQUE CHECK (btrim(order_number) <> ''),
  customer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'confirmed',
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  currency_code text NOT NULL DEFAULT 'MYR' CHECK (currency_code ~ '^[A-Z]{3}$'),
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(customer_snapshot) = 'object'),
  delivery_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(delivery_snapshot) = 'object'),
  subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT sales_orders_total_check CHECK (total = subtotal + delivery_fee - discount_amount)
);

CREATE TABLE public.sales_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  line_number integer NOT NULL CHECK (line_number > 0),
  product_id text REFERENCES public."Product"(id) ON DELETE RESTRICT,
  product_version_id uuid REFERENCES public.product_versions(id) ON DELETE RESTRICT,
  combo_id text REFERENCES public.combos(id) ON DELETE RESTRICT,
  combo_version_id uuid REFERENCES public.combo_versions(id) ON DELETE RESTRICT,
  item_kind text NOT NULL CHECK (item_kind IN ('product', 'combo')),
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(product_snapshot) = 'object'),
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  estimated_weight_kg numeric(12,3) CHECK (estimated_weight_kg IS NULL OR estimated_weight_kg >= 0),
  actual_weight_kg numeric(12,3) CHECK (actual_weight_kg IS NULL OR actual_weight_kg >= 0),
  selling_unit text NOT NULL DEFAULT '',
  unit_selling_price numeric(12,2) NOT NULL CHECK (unit_selling_price >= 0),
  unit_cost_price numeric(12,2) CHECK (unit_cost_price IS NULL OR unit_cost_price >= 0),
  supplier_id bigint REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(supplier_snapshot) = 'object'),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_order_lines_number_key UNIQUE (sales_order_id, line_number),
  CONSTRAINT sales_order_lines_kind_reference_check CHECK (
    (item_kind = 'product' AND product_id IS NOT NULL AND combo_id IS NULL)
    OR (item_kind = 'combo' AND combo_id IS NOT NULL AND product_id IS NULL)
  ),
  CONSTRAINT sales_order_lines_version_reference_check CHECK (
    (item_kind = 'product' AND product_version_id IS NOT NULL AND combo_version_id IS NULL)
    OR (item_kind = 'combo' AND combo_version_id IS NOT NULL AND product_version_id IS NULL)
  )
);

CREATE TABLE public.sales_order_line_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_line_id uuid NOT NULL REFERENCES public.sales_order_lines(id) ON DELETE RESTRICT,
  unit_number integer NOT NULL CHECK (unit_number > 0),
  physical_unit_type text NOT NULL CHECK (physical_unit_type IN ('chicken', 'fish', 'other')),
  estimated_weight_kg numeric(12,3) CHECK (estimated_weight_kg IS NULL OR estimated_weight_kg >= 0),
  actual_weight_kg numeric(12,3) CHECK (actual_weight_kg IS NULL OR actual_weight_kg >= 0),
  unit_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(unit_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_order_line_units_number_key UNIQUE (sales_order_line_id, unit_number)
);

CREATE TABLE public.sales_order_preparation_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_line_id uuid NOT NULL REFERENCES public.sales_order_lines(id) ON DELETE RESTRICT,
  sales_order_line_unit_id uuid REFERENCES public.sales_order_line_units(id) ON DELETE RESTRICT,
  preparation_schema_version_id uuid NOT NULL REFERENCES public.preparation_schema_versions(id) ON DELETE RESTRICT,
  preparation_question_id uuid NOT NULL REFERENCES public.preparation_questions(id) ON DELETE RESTRICT,
  preparation_option_id uuid REFERENCES public.preparation_question_options(id) ON DELETE RESTRICT,
  question_code text NOT NULL,
  option_code text,
  answer_value jsonb NOT NULL DEFAULT 'null'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_order_preparation_answer_scope_key
    UNIQUE NULLS NOT DISTINCT (sales_order_line_id, sales_order_line_unit_id, question_code),
  CONSTRAINT sales_order_preparation_answer_code_check CHECK (btrim(question_code) <> ''),
  CONSTRAINT sales_order_preparation_option_code_check CHECK (option_code IS NULL OR btrim(option_code) <> '')
);

CREATE TABLE public.sales_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (btrim(event_type) <> ''),
  event_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales_order_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  sales_order_line_id uuid REFERENCES public.sales_order_lines(id) ON DELETE RESTRICT,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('refund', 'credit', 'charge', 'settlement')),
  amount numeric(12,2) NOT NULL CHECK (amount <> 0),
  currency_code text NOT NULL DEFAULT 'MYR' CHECK (currency_code ~ '^[A-Z]{3}$'),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX sales_orders_customer_confirmed_idx ON public.sales_orders (customer_id, confirmed_at DESC);
CREATE INDEX sales_orders_legacy_order_idx ON public.sales_orders (legacy_order_id) WHERE legacy_order_id IS NOT NULL;
CREATE INDEX sales_order_lines_order_idx ON public.sales_order_lines (sales_order_id, line_number);
CREATE INDEX sales_order_lines_product_idx ON public.sales_order_lines (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX sales_order_lines_combo_idx ON public.sales_order_lines (combo_id) WHERE combo_id IS NOT NULL;
CREATE INDEX sales_order_line_units_line_idx ON public.sales_order_line_units (sales_order_line_id, unit_number);
CREATE INDEX sales_order_preparation_answers_question_idx
  ON public.sales_order_preparation_answers (preparation_question_id, option_code);
CREATE INDEX sales_order_events_order_idx ON public.sales_order_events (sales_order_id, event_at);
CREATE INDEX sales_order_adjustments_order_idx ON public.sales_order_adjustments (sales_order_id, created_at);

CREATE OR REPLACE FUNCTION public.phase1_prevent_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Order snapshots are append-only. Record an event or adjustment; do not mutate historical facts.';
END;
$$;

CREATE OR REPLACE FUNCTION public.phase1_validate_preparation_answer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_question record;
  v_option record;
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
  IF (v_question.selection_scope = 'physical_unit') <> (NEW.sales_order_line_unit_id IS NOT NULL) THEN
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
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_orders_append_only
  BEFORE UPDATE OR DELETE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_snapshot_mutation();
CREATE TRIGGER sales_order_lines_append_only
  BEFORE UPDATE OR DELETE ON public.sales_order_lines FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_snapshot_mutation();
CREATE TRIGGER sales_order_line_units_append_only
  BEFORE UPDATE OR DELETE ON public.sales_order_line_units FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_snapshot_mutation();
CREATE TRIGGER sales_order_preparation_answers_append_only
  BEFORE UPDATE OR DELETE ON public.sales_order_preparation_answers FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_snapshot_mutation();
CREATE TRIGGER sales_order_events_append_only
  BEFORE UPDATE OR DELETE ON public.sales_order_events FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_snapshot_mutation();
CREATE TRIGGER sales_order_adjustments_append_only
  BEFORE UPDATE OR DELETE ON public.sales_order_adjustments FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_snapshot_mutation();
CREATE TRIGGER sales_order_preparation_answers_validate
  BEFORE INSERT ON public.sales_order_preparation_answers FOR EACH ROW EXECUTE FUNCTION public.phase1_validate_preparation_answer();

ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_line_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_preparation_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY phase1_sales_orders_customer_select ON public.sales_orders
  FOR SELECT TO authenticated USING (customer_id = auth.uid() OR public.is_admin());
CREATE POLICY phase1_sales_order_lines_customer_select ON public.sales_order_lines
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.sales_orders o WHERE o.id = sales_order_id AND (o.customer_id = auth.uid() OR public.is_admin()))
  );
CREATE POLICY phase1_sales_order_line_units_customer_select ON public.sales_order_line_units
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.sales_order_lines l JOIN public.sales_orders o ON o.id = l.sales_order_id
      WHERE l.id = sales_order_line_id AND (o.customer_id = auth.uid() OR public.is_admin())
    )
  );
CREATE POLICY phase1_sales_order_answers_customer_select ON public.sales_order_preparation_answers
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.sales_order_lines l JOIN public.sales_orders o ON o.id = l.sales_order_id
      WHERE l.id = sales_order_line_id AND (o.customer_id = auth.uid() OR public.is_admin())
    )
  );
CREATE POLICY phase1_sales_order_events_customer_select ON public.sales_order_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.sales_orders o WHERE o.id = sales_order_id AND (o.customer_id = auth.uid() OR public.is_admin()))
  );
CREATE POLICY phase1_sales_order_adjustments_customer_select ON public.sales_order_adjustments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.sales_orders o WHERE o.id = sales_order_id AND (o.customer_id = auth.uid() OR public.is_admin()))
  );

COMMENT ON TABLE public.sales_orders IS
  'Phase 1 normalized immutable order snapshot. Existing public."Orders" remains the live compatibility model until a later cutover.';
COMMENT ON TABLE public.sales_order_line_units IS
  'One row per physical chicken, fish, or other prepared unit; apply-to-all is expanded before persistence.';
COMMENT ON TABLE public.sales_order_preparation_answers IS
  'Append-only structured answers retaining schema, question and option identity plus immutable codes.';
