-- Phase 1: additive versioned catalogue and preparation foundations.
-- Existing Product, combos, price history and Orders structures remain the
-- compatibility model. This migration creates the authoritative foundation
-- for future checkout work; it neither backfills nor changes live behaviour.

CREATE TABLE public.preparation_schemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.preparation_schema_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_schema_id uuid NOT NULL REFERENCES public.preparation_schemas(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  title text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT preparation_schema_versions_period_check
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT preparation_schema_versions_number_key
    UNIQUE (preparation_schema_id, version_number)
);

CREATE TABLE public.preparation_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_schema_version_id uuid NOT NULL REFERENCES public.preparation_schema_versions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  label text NOT NULL CHECK (btrim(label) <> ''),
  help_text text NOT NULL DEFAULT '',
  answer_type text NOT NULL CHECK (answer_type IN ('boolean', 'single_select', 'multi_select', 'integer', 'decimal', 'text')),
  selection_scope text NOT NULL CHECK (selection_scope IN ('line', 'physical_unit')),
  required boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  validation jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(validation) = 'object'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preparation_questions_code_key UNIQUE (preparation_schema_version_id, code),
  CONSTRAINT preparation_questions_display_order_key UNIQUE (preparation_schema_version_id, display_order)
);

CREATE TABLE public.preparation_question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_question_id uuid NOT NULL REFERENCES public.preparation_questions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  label text NOT NULL CHECK (btrim(label) <> ''),
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preparation_question_options_code_key UNIQUE (preparation_question_id, code),
  CONSTRAINT preparation_question_options_display_order_key UNIQUE (preparation_question_id, display_order)
);

CREATE TABLE public.product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public."Product"(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  preparation_schema_version_id uuid REFERENCES public.preparation_schema_versions(id) ON DELETE RESTRICT,
  selling_unit text,
  ordering_mode text,
  physical_unit_type text CHECK (physical_unit_type IN ('none', 'chicken', 'fish', 'other')),
  minimum_quantity numeric(12,3),
  maximum_quantity numeric(12,3),
  quantity_increment numeric(12,3),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  display_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(display_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT product_versions_period_check CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT product_versions_quantity_range_check
    CHECK (minimum_quantity IS NULL OR maximum_quantity IS NULL OR minimum_quantity <= maximum_quantity),
  CONSTRAINT product_versions_quantity_increment_check
    CHECK (quantity_increment IS NULL OR quantity_increment > 0),
  CONSTRAINT product_versions_number_key UNIQUE (product_id, version_number)
);

CREATE TABLE public.combo_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id text NOT NULL REFERENCES public.combos(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  selling_price numeric(12,2) NOT NULL CHECK (selling_price >= 0),
  currency_code text NOT NULL DEFAULT 'MYR' CHECK (currency_code ~ '^[A-Z]{3}$'),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  display_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(display_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT combo_versions_period_check CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT combo_versions_number_key UNIQUE (combo_id, version_number)
);

CREATE TABLE public.combo_version_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_version_id uuid NOT NULL REFERENCES public.combo_versions(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES public."Product"(id) ON DELETE RESTRICT,
  product_version_id uuid REFERENCES public.product_versions(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(unit_snapshot) = 'object'),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT combo_version_items_order_key UNIQUE (combo_version_id, display_order)
);

CREATE INDEX product_versions_effective_lookup_idx
  ON public.product_versions (product_id, effective_from DESC)
  WHERE status = 'published';
CREATE INDEX preparation_schema_versions_effective_lookup_idx
  ON public.preparation_schema_versions (preparation_schema_id, effective_from DESC)
  WHERE status = 'published';
CREATE INDEX preparation_questions_schema_version_idx
  ON public.preparation_questions (preparation_schema_version_id, display_order);
CREATE INDEX preparation_question_options_question_idx
  ON public.preparation_question_options (preparation_question_id, display_order);
CREATE INDEX combo_versions_effective_lookup_idx
  ON public.combo_versions (combo_id, effective_from DESC)
  WHERE status = 'published';
CREATE INDEX combo_version_items_combo_version_idx
  ON public.combo_version_items (combo_version_id, display_order);

CREATE OR REPLACE FUNCTION public.phase1_prevent_published_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'published' THEN
    RAISE EXCEPTION 'Published version rows are immutable.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Published version rows are immutable; retire and publish a new version instead.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase1_prevent_published_definition_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_TABLE_NAME = 'preparation_questions' THEN
    SELECT status INTO v_status
      FROM public.preparation_schema_versions
     WHERE id = COALESCE(NEW.preparation_schema_version_id, OLD.preparation_schema_version_id);
  ELSE
    SELECT v.status INTO v_status
      FROM public.preparation_question_options o
      JOIN public.preparation_questions q ON q.id = o.preparation_question_id
      JOIN public.preparation_schema_versions v ON v.id = q.preparation_schema_version_id
     WHERE o.id = COALESCE(NEW.id, OLD.id);
  END IF;
  IF v_status = 'published' THEN
    RAISE EXCEPTION 'Questions and options in published preparation schemas are immutable.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase1_assert_no_version_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conflict boolean;
BEGIN
  IF NEW.status <> 'published' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'product_versions' THEN
    PERFORM pg_advisory_xact_lock(hashtext('phase1:product:' || NEW.product_id));
    SELECT EXISTS (
      SELECT 1 FROM public.product_versions v
      WHERE v.product_id = NEW.product_id AND v.status = 'published' AND v.id <> NEW.id
        AND tstzrange(v.effective_from, v.effective_to, '[)') && tstzrange(NEW.effective_from, NEW.effective_to, '[)')
    ) INTO v_conflict;
  ELSIF TG_TABLE_NAME = 'preparation_schema_versions' THEN
    PERFORM pg_advisory_xact_lock(hashtext('phase1:preparation:' || NEW.preparation_schema_id));
    SELECT EXISTS (
      SELECT 1 FROM public.preparation_schema_versions v
      WHERE v.preparation_schema_id = NEW.preparation_schema_id AND v.status = 'published' AND v.id <> NEW.id
        AND tstzrange(v.effective_from, v.effective_to, '[)') && tstzrange(NEW.effective_from, NEW.effective_to, '[)')
    ) INTO v_conflict;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('phase1:combo:' || NEW.combo_id));
    SELECT EXISTS (
      SELECT 1 FROM public.combo_versions v
      WHERE v.combo_id = NEW.combo_id AND v.status = 'published' AND v.id <> NEW.id
        AND tstzrange(v.effective_from, v.effective_to, '[)') && tstzrange(NEW.effective_from, NEW.effective_to, '[)')
    ) INTO v_conflict;
  END IF;
  IF v_conflict THEN RAISE EXCEPTION 'Published version effective ranges may not overlap.'; END IF;
  IF NEW.published_at IS NULL THEN NEW.published_at := now(); END IF;
  IF NEW.published_by IS NULL THEN NEW.published_by := auth.uid(); END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_versions_immutable_published
  BEFORE UPDATE OR DELETE ON public.product_versions
  FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_published_version_mutation();
CREATE TRIGGER preparation_schema_versions_immutable_published
  BEFORE UPDATE OR DELETE ON public.preparation_schema_versions
  FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_published_version_mutation();
CREATE TRIGGER combo_versions_immutable_published
  BEFORE UPDATE OR DELETE ON public.combo_versions
  FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_published_version_mutation();
CREATE TRIGGER product_versions_no_overlap
  BEFORE INSERT OR UPDATE ON public.product_versions
  FOR EACH ROW EXECUTE FUNCTION public.phase1_assert_no_version_overlap();
CREATE TRIGGER preparation_schema_versions_no_overlap
  BEFORE INSERT OR UPDATE ON public.preparation_schema_versions
  FOR EACH ROW EXECUTE FUNCTION public.phase1_assert_no_version_overlap();
CREATE TRIGGER combo_versions_no_overlap
  BEFORE INSERT OR UPDATE ON public.combo_versions
  FOR EACH ROW EXECUTE FUNCTION public.phase1_assert_no_version_overlap();
CREATE TRIGGER preparation_questions_immutable_when_published
  BEFORE UPDATE OR DELETE ON public.preparation_questions
  FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_published_definition_mutation();
CREATE TRIGGER preparation_question_options_immutable_when_published
  BEFORE UPDATE OR DELETE ON public.preparation_question_options
  FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_published_definition_mutation();

ALTER TABLE public.preparation_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparation_schema_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparation_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparation_question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_version_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY phase1_preparation_schemas_read_published ON public.preparation_schemas
  FOR SELECT TO anon, authenticated USING (active OR public.is_admin());
CREATE POLICY phase1_preparation_schema_versions_read_published ON public.preparation_schema_versions
  FOR SELECT TO anon, authenticated USING (status = 'published' OR public.is_admin());
CREATE POLICY phase1_preparation_questions_read_published ON public.preparation_questions
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.preparation_schema_versions v WHERE v.id = preparation_schema_version_id AND (v.status = 'published' OR public.is_admin()))
  );
CREATE POLICY phase1_preparation_options_read_published ON public.preparation_question_options
  FOR SELECT TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM public.preparation_questions q JOIN public.preparation_schema_versions v ON v.id = q.preparation_schema_version_id
      WHERE q.id = preparation_question_id AND (v.status = 'published' OR public.is_admin())
    )
  );
CREATE POLICY phase1_product_versions_read_published ON public.product_versions
  FOR SELECT TO anon, authenticated USING (status = 'published' OR public.is_admin());
CREATE POLICY phase1_combo_versions_read_published ON public.combo_versions
  FOR SELECT TO anon, authenticated USING (status = 'published' OR public.is_admin());
CREATE POLICY phase1_combo_version_items_read_published ON public.combo_version_items
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.combo_versions v WHERE v.id = combo_version_id AND (v.status = 'published' OR public.is_admin()))
  );
CREATE POLICY phase1_preparation_schemas_admin_write ON public.preparation_schemas
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY phase1_preparation_schema_versions_admin_write ON public.preparation_schema_versions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY phase1_preparation_questions_admin_write ON public.preparation_questions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY phase1_preparation_options_admin_write ON public.preparation_question_options
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY phase1_product_versions_admin_write ON public.product_versions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY phase1_combo_versions_admin_write ON public.combo_versions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY phase1_combo_version_items_admin_write ON public.combo_version_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.get_effective_product_configuration(p_product_id text, p_at timestamptz DEFAULT now())
RETURNS TABLE (
  product_version_id uuid,
  preparation_schema_version_id uuid,
  configuration jsonb,
  display_snapshot jsonb,
  selling_price numeric,
  cost_price numeric,
  supplier_id bigint,
  supplier_name text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT pv.id, pv.preparation_schema_version_id, pv.configuration, pv.display_snapshot,
         sp.selling_price, cp.cost_price, cp.supplier_id, cp.supplier_name
    FROM public.product_versions pv
    LEFT JOIN LATERAL (
      SELECT selling_price FROM public.selling_price_history
       WHERE product_id = pv.product_id AND effective_from <= p_at AND (effective_to IS NULL OR p_at < effective_to)
       ORDER BY effective_from DESC, id DESC LIMIT 1
    ) sp ON true
    LEFT JOIN LATERAL (
      SELECT cost_price, supplier_id, supplier_name FROM public.supplier_price_history
       WHERE product_id = pv.product_id AND effective_from <= p_at AND (effective_to IS NULL OR p_at < effective_to)
       ORDER BY effective_from DESC, id DESC LIMIT 1
    ) cp ON true
   WHERE pv.product_id = p_product_id AND pv.status = 'published'
     AND pv.effective_from <= p_at AND (pv.effective_to IS NULL OR p_at < pv.effective_to)
   ORDER BY pv.effective_from DESC
   LIMIT 1;
$$;
