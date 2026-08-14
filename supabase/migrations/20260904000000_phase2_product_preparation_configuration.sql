-- Phase 2: admin-managed, product-specific preparation configuration.
-- This is additive. The legacy Product.preparation_options and the current
-- storefront / checkout flows deliberately remain the compatibility path.

ALTER TABLE public.preparation_schemas
  ADD COLUMN name_ms text NOT NULL DEFAULT '',
  ADD COLUMN description_ms text NOT NULL DEFAULT '';

ALTER TABLE public.preparation_schema_versions
  ADD COLUMN title_ms text NOT NULL DEFAULT '',
  ADD COLUMN notes_ms text NOT NULL DEFAULT '';

ALTER TABLE public.preparation_questions
  ADD COLUMN label_ms text NOT NULL DEFAULT '',
  ADD COLUMN help_text_ms text NOT NULL DEFAULT '';

ALTER TABLE public.preparation_question_options
  ADD COLUMN label_ms text NOT NULL DEFAULT '';

-- A published product configuration may only expose a published schema. This
-- keeps draft work private even when a product version is queried publicly.
CREATE OR REPLACE FUNCTION public.phase2_validate_published_product_preparation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_status text;
BEGIN
  IF NEW.status = 'published' AND NEW.preparation_schema_version_id IS NOT NULL THEN
    SELECT status INTO v_status
      FROM public.preparation_schema_versions
     WHERE id = NEW.preparation_schema_version_id;
    IF v_status IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'A published product version must reference a published preparation schema version.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_versions_published_preparation_schema
  BEFORE INSERT OR UPDATE ON public.product_versions
  FOR EACH ROW EXECUTE FUNCTION public.phase2_validate_published_product_preparation();

-- Publish through one guarded operation so incomplete questionnaires cannot be
-- accidentally made available to customers.
CREATE OR REPLACE FUNCTION public.publish_preparation_schema_version(p_version_id uuid)
RETURNS public.preparation_schema_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_version public.preparation_schema_versions;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin role required.'; END IF;
  SELECT * INTO v_version FROM public.preparation_schema_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preparation schema version not found.'; END IF;
  IF v_version.status <> 'draft' THEN RAISE EXCEPTION 'Only draft schema versions can be published.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.preparation_questions q
     WHERE q.preparation_schema_version_id = p_version_id AND q.active
  ) THEN RAISE EXCEPTION 'A published preparation schema needs at least one active question.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.preparation_questions q
     WHERE q.preparation_schema_version_id = p_version_id AND q.active
       AND q.answer_type IN ('single_select', 'multi_select')
       AND NOT EXISTS (SELECT 1 FROM public.preparation_question_options o WHERE o.preparation_question_id = q.id AND o.active)
  ) THEN RAISE EXCEPTION 'Every active selection question needs at least one active option.'; END IF;
  UPDATE public.preparation_schema_versions
     SET status = 'published', published_at = now(), published_by = auth.uid()
   WHERE id = p_version_id
   RETURNING * INTO v_version;
  RETURN v_version;
END;
$$;

-- Read-only customer-facing projection. Phase 3 will consume this function;
-- adding it now allows the admin preview and RLS visibility to be verified
-- without changing the checkout experience.
CREATE OR REPLACE FUNCTION public.get_published_product_preparation_questionnaire(
  p_product_id text,
  p_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'product_version_id', pv.id,
    'preparation_schema_version_id', sv.id,
    'questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'code', q.code, 'label', q.label, 'label_ms', q.label_ms,
        'help_text', q.help_text, 'help_text_ms', q.help_text_ms,
        'answer_type', q.answer_type, 'selection_scope', q.selection_scope,
        'required', q.required, 'options', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', o.id, 'code', o.code, 'label', o.label, 'label_ms', o.label_ms, 'value', o.value) ORDER BY o.display_order)
          FROM public.preparation_question_options o
          WHERE o.preparation_question_id = q.id AND o.active
        ), '[]'::jsonb)
      ) ORDER BY q.display_order)
      FROM public.preparation_questions q
      WHERE q.preparation_schema_version_id = sv.id AND q.active
    ), '[]'::jsonb)
  )
  FROM public.product_versions pv
  JOIN public.preparation_schema_versions sv ON sv.id = pv.preparation_schema_version_id
  WHERE pv.product_id = p_product_id
    AND pv.status = 'published' AND sv.status = 'published'
    AND pv.effective_from <= p_at AND (pv.effective_to IS NULL OR p_at < pv.effective_to)
  ORDER BY pv.effective_from DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.publish_preparation_schema_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_product_preparation_questionnaire(text, timestamptz) TO anon, authenticated;
