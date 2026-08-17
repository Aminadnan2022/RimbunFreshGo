-- Phase 3C: per-physical-unit preparation for fish sold by piece.
--
-- Existing fish-preparation v1 remains active for weight-based fish and uses
-- line-level preparation.
--
-- A separate fish-piece-preparation schema is introduced for individually
-- countable fish. Its questions use physical_unit scope so each fish may have
-- different cleaning/cutting instructions.
--
-- Published product versions are retired only when moving eligible piece-fish
-- products to the new schema. Retired historical versions remain immutable.

CREATE OR REPLACE FUNCTION public.phase1_prevent_published_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('published', 'retired') THEN
    RAISE EXCEPTION 'Published and retired version rows are immutable.';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'retired' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Retired version rows are immutable.';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'published'
     AND NEW IS DISTINCT FROM OLD
  THEN
    -- The only allowed mutation of a published version is retiring it and
    -- closing its effective period. All other fields must remain identical.
    IF NEW.status = 'retired'
       AND NEW.effective_to IS NOT NULL
       AND NEW.effective_to > OLD.effective_from
       AND (
         to_jsonb(NEW) - 'status' - 'effective_to'
       ) = (
         to_jsonb(OLD) - 'status' - 'effective_to'
       )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'Published version rows are immutable; only retirement with effective_to is allowed.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  v_weight_schema_id uuid;
  v_weight_schema_version_id uuid;

  v_piece_schema_id uuid;
  v_piece_schema_version_id uuid;

  v_clean_question_id uuid;
  v_cut_question_id uuid;

  v_cutover timestamptz := clock_timestamp();
BEGIN
  ---------------------------------------------------------------------------
  -- Confirm Phase 3B weight-based fish schema exists.
  ---------------------------------------------------------------------------

  SELECT id
    INTO v_weight_schema_id
    FROM public.preparation_schemas
   WHERE code = 'fish-preparation';

  IF v_weight_schema_id IS NULL THEN
    RAISE EXCEPTION
      'fish-preparation schema is missing. Apply Phase 3B before Phase 3C.';
  END IF;

  SELECT id
    INTO v_weight_schema_version_id
    FROM public.preparation_schema_versions
   WHERE preparation_schema_id = v_weight_schema_id
     AND version_number = 1
     AND status = 'published';

  IF v_weight_schema_version_id IS NULL THEN
    RAISE EXCEPTION
      'Published fish-preparation version 1 is missing.';
  END IF;

  ---------------------------------------------------------------------------
  -- Create dedicated schema for individually countable fish.
  ---------------------------------------------------------------------------

  INSERT INTO public.preparation_schemas (
    code,
    name,
    name_ms,
    description,
    description_ms,
    active
  )
  VALUES (
    'fish-piece-preparation',
    'Fish preparation — per fish',
    'Penyediaan ikan — setiap ikan',
    'Preparation choices for fish sold as individually countable pieces.',
    'Pilihan penyediaan untuk ikan yang dijual mengikut ekor.',
    true
  )
  RETURNING id INTO v_piece_schema_id;

  ---------------------------------------------------------------------------
  -- Create draft version 1.
  ---------------------------------------------------------------------------

  INSERT INTO public.preparation_schema_versions (
    preparation_schema_id,
    version_number,
    status,
    effective_from,
    title,
    title_ms,
    notes,
    notes_ms
  )
  VALUES (
    v_piece_schema_id,
    1,
    'draft',
    v_cutover,
    'Fresh fish preparation — per fish',
    'Penyediaan ikan segar — setiap ikan',
    'Per-physical-unit preparation for fish sold by piece.',
    'Pilihan penyediaan berasingan untuk setiap ikan yang dijual seekor.'
  )
  RETURNING id INTO v_piece_schema_version_id;

  ---------------------------------------------------------------------------
  -- Question 1: clean fish?
  ---------------------------------------------------------------------------

  INSERT INTO public.preparation_questions (
    preparation_schema_version_id,
    code,
    label,
    label_ms,
    help_text,
    help_text_ms,
    answer_type,
    selection_scope,
    required,
    display_order,
    active
  )
  VALUES (
    v_piece_schema_version_id,
    'fish_clean',
    'Clean the fish?',
    'Nak siang ikan?',
    'Choose whether this fish should be cleaned.',
    'Pilih sama ada ikan ini perlu disiang.',
    'single_select',
    'physical_unit',
    true,
    0,
    true
  )
  RETURNING id INTO v_clean_question_id;

  INSERT INTO public.preparation_question_options (
    preparation_question_id,
    code,
    label,
    label_ms,
    value,
    display_order,
    active
  )
  VALUES
    (
      v_clean_question_id,
      'yes',
      'Yes',
      'Ya',
      'true'::jsonb,
      0,
      true
    ),
    (
      v_clean_question_id,
      'no',
      'No',
      'Tak nak siang',
      'false'::jsonb,
      1,
      true
    );

  ---------------------------------------------------------------------------
  -- Question 2: cutting style.
  ---------------------------------------------------------------------------

  INSERT INTO public.preparation_questions (
    preparation_schema_version_id,
    code,
    label,
    label_ms,
    help_text,
    help_text_ms,
    answer_type,
    selection_scope,
    required,
    display_order,
    active
  )
  VALUES (
    v_piece_schema_version_id,
    'fish_cut',
    'Fish cutting',
    'Potongan ikan',
    'Choose how you want this fish cut.',
    'Pilih cara ikan ini dipotong.',
    'single_select',
    'physical_unit',
    true,
    1,
    true
  )
  RETURNING id INTO v_cut_question_id;

  INSERT INTO public.preparation_question_options (
    preparation_question_id,
    code,
    label,
    label_ms,
    value,
    display_order,
    active
  )
  VALUES
    (
      v_cut_question_id,
      'no_cut',
      'Do not cut',
      'Tak nak potong',
      '"no_cut"'::jsonb,
      0,
      true
    ),
    (
      v_cut_question_id,
      'slice',
      'Slice / bone-in pieces',
      'Potong slice / keping',
      '"slice"'::jsonb,
      1,
      true
    ),
    (
      v_cut_question_id,
      'butterfly',
      'Butterfly cut',
      'Potong butterfly',
      '"butterfly"'::jsonb,
      2,
      true
    ),
    (
      v_cut_question_id,
      'cut_2',
      'Cut into 2',
      'Potong 2',
      '"cut_2"'::jsonb,
      3,
      true
    );

  ---------------------------------------------------------------------------
  -- Publish fish-piece-preparation v1.
  --
  -- Because this is a separate preparation schema, it does not overlap with
  -- the existing weight-based fish-preparation v1.
  ---------------------------------------------------------------------------

  UPDATE public.preparation_schema_versions
     SET status = 'published',
         published_at = COALESCE(published_at, v_cutover)
   WHERE id = v_piece_schema_version_id
     AND status = 'draft';

  ---------------------------------------------------------------------------
  -- Capture current published individually-countable fish product versions.
  --
  -- Weight-only/kg products stay on fish-preparation v1.
  -- Slice products remain excluded.
  ---------------------------------------------------------------------------

  CREATE TEMP TABLE phase3c_piece_fish_versions
  ON COMMIT DROP
  AS
  SELECT
    pv.id AS old_version_id,
    pv.product_id,
    pv.version_number,
    pv.selling_unit,
    pv.ordering_mode,
    pv.physical_unit_type,
    pv.minimum_quantity,
    pv.maximum_quantity,
    pv.quantity_increment,
    pv.configuration,
    pv.display_snapshot
  FROM public.product_versions pv
  JOIN public."Product" p
    ON p.id = pv.product_id
  WHERE pv.status = 'published'
    AND pv.preparation_schema_version_id = v_weight_schema_version_id
    AND p.category = 'fish'
    AND COALESCE(pv.ordering_mode, '') <> 'slice'
    AND COALESCE(pv.selling_unit, '') <> 'slice'
    AND (
      pv.selling_unit = 'piece'
      OR pv.ordering_mode IN ('fixed_quantity', 'whole_or_weight')
    );

  ---------------------------------------------------------------------------
  -- Retire current product versions.
  ---------------------------------------------------------------------------

  UPDATE public.product_versions pv
     SET status = 'retired',
         effective_to = v_cutover
    FROM phase3c_piece_fish_versions src
   WHERE pv.id = src.old_version_id;

  ---------------------------------------------------------------------------
  -- Create replacement published versions pointing to physical-unit schema.
  --
  -- Use MAX(version_number)+1 so this remains safe if historical versions
  -- already exist for a product.
  ---------------------------------------------------------------------------

  INSERT INTO public.product_versions (
    product_id,
    version_number,
    status,
    effective_from,
    effective_to,
    preparation_schema_version_id,
    selling_unit,
    ordering_mode,
    physical_unit_type,
    minimum_quantity,
    maximum_quantity,
    quantity_increment,
    configuration,
    display_snapshot,
    published_at
  )
  SELECT
    src.product_id,
    (
      SELECT COALESCE(MAX(existing.version_number), 0) + 1
      FROM public.product_versions existing
      WHERE existing.product_id = src.product_id
    ),
    'published',
    v_cutover,
    NULL,
    v_piece_schema_version_id,
    src.selling_unit,
    src.ordering_mode,
    'fish',
    src.minimum_quantity,
    src.maximum_quantity,
    src.quantity_increment,
    src.configuration,
    src.display_snapshot,
    v_cutover
  FROM phase3c_piece_fish_versions src;

END;
$$;
