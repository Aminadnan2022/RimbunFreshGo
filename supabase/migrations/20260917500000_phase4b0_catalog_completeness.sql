-- Phase 4B.0: catalog completeness prerequisite for Phase 4B.1 place_sales_order.
--
-- Findings that motivated this migration (see chat report for the full matrix):
--   * product_versions only covered whole_fish_by_weight/weight_only chicken and
--     fish (migrations 20260911-20260914). Prawns, squid, fixed_quantity, and
--     slice-mode fish products had NO published product_version at all.
--   * combo_versions / combo_version_items were never seeded; both active
--     combos would fail place_sales_order's mandatory version resolution.
--   * product_versions / combo_versions / combo_version_items / preparation_*
--     tables never received the service_role SELECT grant added for the
--     Phase 4A tables in 20260917000000, blocking backend verification.
--
-- This migration is data-completion only. No historical published version is
-- rewritten; every insert is guarded by NOT EXISTS so it is safe to re-run.
-- Price-history determinism (selling_price_history_active_uniq /
-- supplier_price_history_active_uniq, added in 20260822000000) was audited and
-- already guarantees at most one active row per product; no change needed.

-- -----------------------------------------------------------------------------
-- 1. Read privileges for catalog verification (least-privilege, SELECT only)
-- -----------------------------------------------------------------------------
GRANT SELECT ON TABLE
  public.product_versions,
  public.combo_versions,
  public.combo_version_items,
  public.preparation_schemas,
  public.preparation_schema_versions,
  public.preparation_questions,
  public.preparation_question_options
TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Backfill missing product_versions
--
-- Mirrors the ACTUAL live checkout preparation rule in
-- src/lib/checkoutPreparation.ts (shouldIncludePreparationItem): only
-- chicken/fish categories get a preparation schema, and slice-mode items never
-- do (the storefront explicitly excludes slice from preparation targets).
-- average_weight_g values are copied verbatim from the existing frontend
-- constant (src/data/products.ts WHOLE_FISH_CONFIG / WEIGHT_ONLY_CONFIG) so no
-- new numbers are invented; products absent from that map keep NULL, matching
-- the frontend's own `cfg?.averageWeight ?? 0` fallback.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_chicken_schema_version_id uuid;
  v_fish_schema_version_id uuid;
BEGIN
  SELECT sv.id INTO v_chicken_schema_version_id
    FROM public.preparation_schema_versions sv
    JOIN public.preparation_schemas s ON s.id = sv.preparation_schema_id
   WHERE s.code = 'chicken-preparation' AND sv.status = 'published'
   ORDER BY sv.effective_from DESC
   LIMIT 1;

  SELECT sv.id INTO v_fish_schema_version_id
    FROM public.preparation_schema_versions sv
    JOIN public.preparation_schemas s ON s.id = sv.preparation_schema_id
   WHERE s.code = 'fish-preparation' AND sv.status = 'published'
   ORDER BY sv.effective_from DESC
   LIMIT 1;

  INSERT INTO public.product_versions (
    product_id, version_number, status, effective_from,
    preparation_schema_version_id, selling_unit, ordering_mode, physical_unit_type,
    configuration, display_snapshot, published_at
  )
  SELECT
    p.id,
    COALESCE((SELECT MAX(pv2.version_number) FROM public.product_versions pv2 WHERE pv2.product_id = p.id), 0) + 1,
    'published',
    now(),
    CASE
      WHEN p.category = 'chicken' AND COALESCE(p.ordering_mode, '') <> 'slice' THEN v_chicken_schema_version_id
      WHEN p.category = 'fish' AND COALESCE(p.ordering_mode, '') <> 'slice' THEN v_fish_schema_version_id
      ELSE NULL
    END,
    p.selling_unit,
    p.ordering_mode,
    CASE
      WHEN p.category = 'chicken' THEN 'chicken'
      WHEN p.category = 'fish' THEN 'fish'
      ELSE 'none'
    END,
    jsonb_strip_nulls(jsonb_build_object('average_weight_g', w.average_weight_g)),
    jsonb_build_object('name', p.name, 'name_ms', p.name_ms, 'category', p.category),
    now()
  FROM public."Product" p
  LEFT JOIN (VALUES
    ('broiler-chicken', 1600), ('bawal-emas', 600), ('bawal-hitam', 600), ('bawal-putih', 600),
    ('jenahak-potong', 1000), ('jenahak-b', 800), ('tenggiri', 1000), ('tenggiri-potong', 1000),
    ('merah-potong', 1000), ('merah-b', 800), ('cencaru', 400), ('mabong-a', 300),
    ('keli', 500), ('nyok', 600), ('pelaling', 150), ('parang', 500),
    ('talapia-merah', 400), ('tongkol-hitam', 500), ('tongkol-putih', 400),
    ('selar', 100), ('selar-kuning', 100), ('sardin', 80), ('kerisi-a', 200),
    ('siakap', 700), ('udang-a', 29), ('udang-rencah', 0), ('sotong-a', 0), ('sotong-kembang', 0)
  ) AS w(product_id, average_weight_g) ON w.product_id = p.id
  WHERE p.freshness <> 'sold-out'
    AND NOT EXISTS (
      SELECT 1 FROM public.product_versions pv
       WHERE pv.product_id = p.id AND pv.status = 'published'
         AND pv.effective_from <= now() AND (pv.effective_to IS NULL OR pv.effective_to > now())
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Backfill missing combo_versions + combo_version_items
--
-- Component product_version_id is resolved from the versions just created
-- above (same migration, same transaction). Any component that still cannot
-- resolve a product_version aborts the whole migration rather than creating
-- an incomplete lineage row.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_combo record;
  v_combo_version_id uuid;
  v_incomplete_count integer;
BEGIN
  FOR v_combo IN
    SELECT c.id, c.name, c.name_ms, c.price
      FROM public.combos c
     WHERE c.active
       AND NOT EXISTS (
         SELECT 1 FROM public.combo_versions cv
          WHERE cv.combo_id = c.id AND cv.status = 'published'
            AND cv.effective_from <= now() AND (cv.effective_to IS NULL OR cv.effective_to > now())
       )
  LOOP
    INSERT INTO public.combo_versions (
      combo_id, version_number, status, effective_from, selling_price, currency_code,
      configuration, display_snapshot, published_at
    ) VALUES (
      v_combo.id,
      COALESCE((SELECT MAX(version_number) FROM public.combo_versions WHERE combo_id = v_combo.id), 0) + 1,
      'published', now(), v_combo.price, 'MYR',
      '{}'::jsonb,
      jsonb_build_object('name', v_combo.name, 'name_ms', v_combo.name_ms),
      now()
    )
    RETURNING id INTO v_combo_version_id;

    INSERT INTO public.combo_version_items (
      combo_version_id, product_id, product_version_id, quantity, unit_snapshot, display_order
    )
    SELECT
      v_combo_version_id,
      ci.product_id,
      pv.id,
      ci.quantity_value,
      jsonb_build_object('selling_unit', ci.selling_unit),
      ci.sort_order
    FROM public.combo_items ci
    LEFT JOIN LATERAL (
      SELECT pv.id FROM public.product_versions pv
       WHERE pv.product_id = ci.product_id AND pv.status = 'published'
         AND pv.effective_from <= now() AND (pv.effective_to IS NULL OR pv.effective_to > now())
       ORDER BY pv.effective_from DESC
       LIMIT 1
    ) pv ON true
    WHERE ci.combo_id = v_combo.id;

    SELECT count(*) INTO v_incomplete_count
      FROM public.combo_version_items
     WHERE combo_version_id = v_combo_version_id AND product_version_id IS NULL;
    IF v_incomplete_count > 0 THEN
      RAISE EXCEPTION 'Combo %: % component(s) have no resolvable product_version.', v_combo.id, v_incomplete_count;
    END IF;
  END LOOP;
END;
$$;
