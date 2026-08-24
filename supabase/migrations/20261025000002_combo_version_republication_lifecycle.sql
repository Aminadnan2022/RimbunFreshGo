-- Allow a published version's effective period to be closed without allowing
-- its immutable recipe, price, snapshots, or provenance to be rewritten.
-- Combo reactivation can then publish the latest mutable recipe as a new
-- non-overlapping immutable version.

BEGIN;

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
    IF OLD.effective_to IS NULL
       AND NEW.effective_to IS NOT NULL
       AND NEW.effective_to > OLD.effective_from
       AND (to_jsonb(NEW) - 'effective_to') = (to_jsonb(OLD) - 'effective_to') THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Published version rows are immutable; only closing an open effective period is allowed.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_combo_lifecycle(
  p_combo_id text,
  p_lifecycle_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_combo public.combos%ROWTYPE;
  v_combo_version_id uuid;
  v_missing_product text;
  v_published_at timestamptz := clock_timestamp();
  v_mutable_item_count integer;
  v_published_item_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  IF p_lifecycle_status NOT IN ('draft', 'active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid combo lifecycle status.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_combo FROM public.combos WHERE id = p_combo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Combo % not found.', p_combo_id USING ERRCODE = 'P0002';
  END IF;

  IF p_lifecycle_status <> 'active' THEN
    UPDATE public.combos
       SET lifecycle_status = p_lifecycle_status,
           active = false,
           featured = false,
           updated_at = now()
     WHERE id = p_combo_id;
    RETURN;
  END IF;

  SELECT count(*) INTO v_mutable_item_count
    FROM public.combo_items
   WHERE combo_id = p_combo_id;
  IF v_mutable_item_count = 0 THEN
    RAISE EXCEPTION 'A combo needs at least one item before activation.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.combo_items
     WHERE combo_id = p_combo_id
       AND choice_group_key IS NOT NULL
     GROUP BY choice_group_key
    HAVING count(*) < 2
  ) THEN
    RAISE EXCEPTION 'Every Customer Choice needs at least 2 options before activation.' USING ERRCODE = '22023';
  END IF;

  SELECT ci.product_id INTO v_missing_product
    FROM public.combo_items ci
   WHERE ci.combo_id = p_combo_id
     AND NOT EXISTS (
       SELECT 1 FROM public.product_versions pv
        WHERE pv.product_id = ci.product_id
          AND pv.status = 'published'
          AND pv.effective_from <= v_published_at
          AND (pv.effective_to IS NULL OR pv.effective_to > v_published_at)
     )
   ORDER BY ci.sort_order, ci.id
   LIMIT 1;
  IF v_missing_product IS NOT NULL THEN
    RAISE EXCEPTION 'Combo component % has no published canonical product version.', v_missing_product USING ERRCODE = '22023';
  END IF;

  UPDATE public.combo_versions
     SET effective_to = v_published_at
   WHERE combo_id = p_combo_id
     AND status = 'published'
     AND effective_from <= v_published_at
     AND (effective_to IS NULL OR effective_to > v_published_at);

  INSERT INTO public.combo_versions (
    combo_id, version_number, status, effective_from, selling_price,
    currency_code, configuration, display_snapshot, published_at, published_by
  ) VALUES (
    p_combo_id,
    COALESCE((SELECT MAX(version_number) FROM public.combo_versions WHERE combo_id = p_combo_id), 0) + 1,
    'published', v_published_at, v_combo.price, 'MYR', '{}'::jsonb,
    jsonb_build_object('name', v_combo.name, 'name_ms', v_combo.name_ms),
    v_published_at, auth.uid()
  ) RETURNING id INTO v_combo_version_id;

  INSERT INTO public.combo_version_items (
    combo_version_id, product_id, product_version_id, quantity, unit_snapshot, display_order
  )
  SELECT
    v_combo_version_id, ci.product_id, pv.id, ci.quantity_value,
    jsonb_build_object('selling_unit', ci.selling_unit), ci.sort_order
  FROM public.combo_items ci
  JOIN LATERAL (
    SELECT id FROM public.product_versions pv
     WHERE pv.product_id = ci.product_id
       AND pv.status = 'published'
       AND pv.effective_from <= v_published_at
       AND (pv.effective_to IS NULL OR pv.effective_to > v_published_at)
     ORDER BY pv.effective_from DESC
     LIMIT 1
  ) pv ON true
  WHERE ci.combo_id = p_combo_id
  ORDER BY ci.sort_order, ci.id;

  GET DIAGNOSTICS v_published_item_count = ROW_COUNT;
  IF v_published_item_count <> v_mutable_item_count THEN
    RAISE EXCEPTION 'Combo publication item count mismatch: mutable recipe has %, immutable version has %.',
      v_mutable_item_count, v_published_item_count USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.combos
     SET lifecycle_status = 'active', active = true, updated_at = now()
   WHERE id = p_combo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_combo_lifecycle(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_combo_lifecycle(text, text) TO authenticated;

COMMIT;
