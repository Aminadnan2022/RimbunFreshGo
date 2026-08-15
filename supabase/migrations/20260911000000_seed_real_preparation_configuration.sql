-- Phase 3B: seed real preparation questionnaires and product mappings.

DO $$
DECLARE
  v_chicken_schema_id uuid;
  v_chicken_version_id uuid;
  v_chicken_question_id uuid;

  v_fish_schema_id uuid;
  v_fish_version_id uuid;
  v_fish_clean_question_id uuid;
  v_fish_cut_question_id uuid;
BEGIN
  -- ---------------------------------------------------------------------------
  -- Chicken schema
  -- ---------------------------------------------------------------------------

  INSERT INTO public.preparation_schemas (
    code,
    name,
    name_ms,
    description,
    description_ms,
    active
  )
  VALUES (
    'chicken-preparation',
    'Chicken preparation',
    'Penyediaan ayam',
    'Preparation choices for whole chicken.',
    'Pilihan penyediaan untuk ayam seekor.',
    true
  )
  ON CONFLICT (code) DO UPDATE
  SET
    name = EXCLUDED.name,
    name_ms = EXCLUDED.name_ms,
    description = EXCLUDED.description,
    description_ms = EXCLUDED.description_ms,
    active = true
  RETURNING id INTO v_chicken_schema_id;

  SELECT id
  INTO v_chicken_version_id
  FROM public.preparation_schema_versions
  WHERE preparation_schema_id = v_chicken_schema_id
    AND version_number = 1;

  IF v_chicken_version_id IS NULL THEN
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
      v_chicken_schema_id,
      1,
      'draft',
      now(),
      'Whole chicken preparation',
      'Penyediaan ayam seekor',
      'Initial FreshGo chicken preparation configuration.',
      'Konfigurasi awal penyediaan ayam FreshGo.'
    )
    RETURNING id INTO v_chicken_version_id;
  END IF;

  SELECT id
  INTO v_chicken_question_id
  FROM public.preparation_questions
  WHERE preparation_schema_version_id = v_chicken_version_id
    AND code = 'chicken_cut';

  IF v_chicken_question_id IS NULL THEN
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
      v_chicken_version_id,
      'chicken_cut',
      'Chicken cutting',
      'Potongan ayam',
      'Choose how you want this chicken cut.',
      'Pilih cara ayam ini dipotong.',
      'single_select',
      'physical_unit',
      true,
      0,
      true
    )
    RETURNING id INTO v_chicken_question_id;
  END IF;

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
    (v_chicken_question_id, 'no_cut', 'Do not cut', 'Tak nak potong', '"no_cut"'::jsonb, 0, true),
    (v_chicken_question_id, 'cut_4', 'Cut into 4', 'Potong 4', '"cut_4"'::jsonb, 1, true),
    (v_chicken_question_id, 'cut_8', 'Cut into 8', 'Potong 8', '"cut_8"'::jsonb, 2, true),
    (v_chicken_question_id, 'cut_12', 'Cut into 12', 'Potong 12', '"cut_12"'::jsonb, 3, true),
    (v_chicken_question_id, 'cut_16', 'Cut into 16', 'Potong 16', '"cut_16"'::jsonb, 4, true),
    (v_chicken_question_id, 'cut_20', 'Cut into 20', 'Potong 20', '"cut_20"'::jsonb, 5, true),
    (v_chicken_question_id, 'cut_24', 'Cut into 24', 'Potong 24', '"cut_24"'::jsonb, 6, true)
  ON CONFLICT (preparation_question_id, code) DO UPDATE
  SET
    label = EXCLUDED.label,
    label_ms = EXCLUDED.label_ms,
    value = EXCLUDED.value,
    display_order = EXCLUDED.display_order,
    active = true;

  UPDATE public.preparation_schema_versions
  SET
    status = 'published',
    published_at = COALESCE(published_at, now())
  WHERE id = v_chicken_version_id
    AND status = 'draft';

  -- ---------------------------------------------------------------------------
  -- Fish schema
  -- ---------------------------------------------------------------------------

  INSERT INTO public.preparation_schemas (
    code,
    name,
    name_ms,
    description,
    description_ms,
    active
  )
  VALUES (
    'fish-preparation',
    'Fish preparation',
    'Penyediaan ikan',
    'Preparation choices for fresh fish.',
    'Pilihan penyediaan untuk ikan segar.',
    true
  )
  ON CONFLICT (code) DO UPDATE
  SET
    name = EXCLUDED.name,
    name_ms = EXCLUDED.name_ms,
    description = EXCLUDED.description,
    description_ms = EXCLUDED.description_ms,
    active = true
  RETURNING id INTO v_fish_schema_id;

  SELECT id
  INTO v_fish_version_id
  FROM public.preparation_schema_versions
  WHERE preparation_schema_id = v_fish_schema_id
    AND version_number = 1;

  IF v_fish_version_id IS NULL THEN
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
      v_fish_schema_id,
      1,
      'draft',
      now(),
      'Fresh fish preparation',
      'Penyediaan ikan segar',
      'Initial FreshGo fish preparation configuration.',
      'Konfigurasi awal penyediaan ikan FreshGo.'
    )
    RETURNING id INTO v_fish_version_id;
  END IF;

  SELECT id
  INTO v_fish_clean_question_id
  FROM public.preparation_questions
  WHERE preparation_schema_version_id = v_fish_version_id
    AND code = 'fish_clean';

  IF v_fish_clean_question_id IS NULL THEN
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
      v_fish_version_id,
      'fish_clean',
      'Clean the fish?',
      'Nak siang ikan?',
      'Choose whether the fish should be cleaned.',
      'Pilih sama ada ikan perlu disiang.',
      'single_select',
      'line',
      true,
      0,
      true
    )
    RETURNING id INTO v_fish_clean_question_id;
  END IF;

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
    (v_fish_clean_question_id, 'yes', 'Yes', 'Ya', 'true'::jsonb, 0, true),
    (v_fish_clean_question_id, 'no', 'No', 'Tak nak siang', 'false'::jsonb, 1, true)
  ON CONFLICT (preparation_question_id, code) DO UPDATE
  SET
    label = EXCLUDED.label,
    label_ms = EXCLUDED.label_ms,
    value = EXCLUDED.value,
    display_order = EXCLUDED.display_order,
    active = true;

  SELECT id
  INTO v_fish_cut_question_id
  FROM public.preparation_questions
  WHERE preparation_schema_version_id = v_fish_version_id
    AND code = 'fish_cut';

  IF v_fish_cut_question_id IS NULL THEN
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
      v_fish_version_id,
      'fish_cut',
      'Fish cutting',
      'Potongan ikan',
      'Choose how you want the fish cut.',
      'Pilih cara ikan dipotong.',
      'single_select',
      'line',
      true,
      1,
      true
    )
    RETURNING id INTO v_fish_cut_question_id;
  END IF;

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
    (v_fish_cut_question_id, 'no_cut', 'Do not cut', 'Tak nak potong', '"no_cut"'::jsonb, 0, true),
    (v_fish_cut_question_id, 'slice', 'Slice / bone-in pieces', 'Potong slice / keping', '"slice"'::jsonb, 1, true),
    (v_fish_cut_question_id, 'butterfly', 'Butterfly cut', 'Potong butterfly', '"butterfly"'::jsonb, 2, true),
    (v_fish_cut_question_id, 'cut_2', 'Cut into 2', 'Potong 2', '"cut_2"'::jsonb, 3, true)
  ON CONFLICT (preparation_question_id, code) DO UPDATE
  SET
    label = EXCLUDED.label,
    label_ms = EXCLUDED.label_ms,
    value = EXCLUDED.value,
    display_order = EXCLUDED.display_order,
    active = true;

  UPDATE public.preparation_schema_versions
  SET
    status = 'published',
    published_at = COALESCE(published_at, now())
  WHERE id = v_fish_version_id
    AND status = 'draft';

  -- ---------------------------------------------------------------------------
  -- Product versions
  -- ---------------------------------------------------------------------------

  INSERT INTO public.product_versions (
    product_id,
    version_number,
    status,
    effective_from,
    preparation_schema_version_id,
    selling_unit,
    ordering_mode,
    physical_unit_type,
    minimum_quantity,
    quantity_increment,
    configuration,
    display_snapshot,
    published_at
  )
  SELECT
    p.id,
    1,
    'published',
    now(),
    CASE
      WHEN p.category = 'chicken' THEN v_chicken_version_id
      WHEN p.category = 'fish' THEN v_fish_version_id
      ELSE NULL
    END,
    p.selling_unit,
    p.ordering_mode,
    CASE
      WHEN p.category = 'chicken' THEN 'chicken'
      WHEN p.category = 'fish' THEN 'fish'
      ELSE 'none'
    END,
    NULL,
    NULL,
    '{}'::jsonb,
    jsonb_build_object(
      'name', p.name,
      'name_ms', p.name_ms,
      'category', p.category
    ),
    now()
  FROM public."Product" p
  WHERE p.category IN ('chicken', 'fish')
    AND COALESCE(p.ordering_mode, '') <> 'slice'
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_versions pv
      WHERE pv.product_id = p.id
        AND pv.version_number = 1
    );

END;
$$;
