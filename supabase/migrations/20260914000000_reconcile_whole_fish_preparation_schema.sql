-- Reconcile live whole_fish_by_weight products with their published
-- product_versions and the existing fish-piece-preparation schema.
--
-- This handles products changed through Admin after Phase 3C was deployed,
-- e.g. Selar changed from weight_only/kg to whole_fish_by_weight/piece.

DO $$
DECLARE
  v_piece_schema_id uuid;
  v_piece_schema_version_id uuid;
  v_cutover timestamptz := clock_timestamp();
BEGIN
  ---------------------------------------------------------------------------
  -- Resolve existing fish-piece-preparation published schema version.
  ---------------------------------------------------------------------------
  SELECT id
    INTO v_piece_schema_id
    FROM public.preparation_schemas
   WHERE code = 'fish-piece-preparation'
     AND active = true
   LIMIT 1;

  IF v_piece_schema_id IS NULL THEN
    RAISE EXCEPTION
      'fish-piece-preparation schema is missing. Apply Phase 3C first.';
  END IF;

  SELECT id
    INTO v_piece_schema_version_id
    FROM public.preparation_schema_versions
   WHERE preparation_schema_id = v_piece_schema_id
     AND status = 'published'
   ORDER BY version_number DESC
   LIMIT 1;

  IF v_piece_schema_version_id IS NULL THEN
    RAISE EXCEPTION
      'No published fish-piece-preparation schema version exists.';
  END IF;

  ---------------------------------------------------------------------------
  -- Capture published versions which no longer match the live Product.
  --
  -- Only whole_fish_by_weight fish are affected.
  -- weight_only fish remain on fish-preparation.
  ---------------------------------------------------------------------------
  CREATE TEMP TABLE reconcile_whole_fish_versions
  ON COMMIT DROP
  AS
  SELECT
    pv.id AS old_version_id,
    pv.product_id,
    pv.minimum_quantity,
    pv.maximum_quantity,
    pv.quantity_increment,
    pv.configuration,
    pv.display_snapshot,
    p.ordering_mode AS live_ordering_mode,
    p.selling_unit AS live_selling_unit
  FROM public.product_versions pv
  JOIN public."Product" p
    ON p.id = pv.product_id
  LEFT JOIN public.preparation_schema_versions current_psv
    ON current_psv.id = pv.preparation_schema_version_id
  LEFT JOIN public.preparation_schemas current_ps
    ON current_ps.id = current_psv.preparation_schema_id
  WHERE pv.status = 'published'
    AND p.category = 'fish'
    AND p.ordering_mode = 'whole_fish_by_weight'
    AND p.selling_unit = 'piece'
    AND (
      pv.ordering_mode IS DISTINCT FROM p.ordering_mode
      OR pv.selling_unit IS DISTINCT FROM p.selling_unit
      OR pv.preparation_schema_version_id IS DISTINCT FROM v_piece_schema_version_id
      OR current_ps.code IS DISTINCT FROM 'fish-piece-preparation'
    );

  ---------------------------------------------------------------------------
  -- Retire mismatched published versions.
  ---------------------------------------------------------------------------
  UPDATE public.product_versions pv
     SET status = 'retired',
         effective_to = v_cutover
    FROM reconcile_whole_fish_versions src
   WHERE pv.id = src.old_version_id;

  ---------------------------------------------------------------------------
  -- Publish replacement versions using the live Product configuration.
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
    src.live_selling_unit,
    src.live_ordering_mode,
    'fish',
    src.minimum_quantity,
    src.maximum_quantity,
    src.quantity_increment,
    src.configuration,
    src.display_snapshot,
    v_cutover
  FROM reconcile_whole_fish_versions src;

END;
$$;
