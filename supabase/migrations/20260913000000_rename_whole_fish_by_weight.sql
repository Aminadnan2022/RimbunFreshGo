-- Phase 3D: clarify whole-fish pricing semantics.
--
-- whole_or_weight previously mixed two concepts:
--   1. how the customer orders
--   2. how the final price is calculated
--
-- New canonical mode:
--   whole_fish_by_weight
--
-- Customer orders a whole fish by physical quantity (ekor).
-- Supplier later records actual weight.
-- Final selling price = actual_weight_kg * RM/kg.
--
-- Historical published product_versions are preserved by retiring them and
-- creating new published versions.

DO $$
DECLARE
  v_cutover timestamptz := clock_timestamp();
BEGIN
  ---------------------------------------------------------------------------
  -- Live Product catalogue.
  ---------------------------------------------------------------------------

  UPDATE public."Product"
     SET ordering_mode = 'whole_fish_by_weight'
   WHERE ordering_mode = 'whole_or_weight';

  ---------------------------------------------------------------------------
  -- Capture current published product versions using the legacy mode.
  ---------------------------------------------------------------------------

  CREATE TEMP TABLE phase3d_whole_fish_versions
  ON COMMIT DROP
  AS
  SELECT
    pv.id AS old_version_id,
    pv.product_id,
    pv.version_number,
    pv.preparation_schema_version_id,
    pv.selling_unit,
    pv.ordering_mode,
    pv.physical_unit_type,
    pv.minimum_quantity,
    pv.maximum_quantity,
    pv.quantity_increment,
    pv.configuration,
    pv.display_snapshot
  FROM public.product_versions pv
  WHERE pv.status = 'published'
    AND pv.ordering_mode = 'whole_or_weight';

  ---------------------------------------------------------------------------
  -- Retire existing published versions.
  -- Phase 3C already allows published -> retired with effective_to.
  ---------------------------------------------------------------------------

  UPDATE public.product_versions pv
     SET status = 'retired',
         effective_to = v_cutover
    FROM phase3d_whole_fish_versions src
   WHERE pv.id = src.old_version_id;

  ---------------------------------------------------------------------------
  -- Publish replacement versions with canonical ordering mode.
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
    src.preparation_schema_version_id,
    'piece',
    'whole_fish_by_weight',
    'fish',
    src.minimum_quantity,
    src.maximum_quantity,
    src.quantity_increment,
    src.configuration,
    src.display_snapshot,
    v_cutover
  FROM phase3d_whole_fish_versions src;
END;
$$;
