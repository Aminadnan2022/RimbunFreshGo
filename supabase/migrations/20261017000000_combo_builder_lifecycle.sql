-- Combo Builder MVP: a small operational lifecycle around the existing
-- combo catalogue.  Published canonical versions and order snapshots are
-- intentionally never changed by this migration.

ALTER TABLE public.combos
  ADD COLUMN IF NOT EXISTS lifecycle_status text;

UPDATE public.combos
   SET lifecycle_status = CASE WHEN active THEN 'active' ELSE 'inactive' END
 WHERE lifecycle_status IS NULL;

ALTER TABLE public.combos
  ALTER COLUMN lifecycle_status SET DEFAULT 'draft',
  ALTER COLUMN lifecycle_status SET NOT NULL;

ALTER TABLE public.combos
  DROP CONSTRAINT IF EXISTS combos_lifecycle_status_check;
ALTER TABLE public.combos
  ADD CONSTRAINT combos_lifecycle_status_check
  CHECK (lifecycle_status IN ('draft', 'active', 'inactive'));

CREATE INDEX IF NOT EXISTS idx_combos_lifecycle_status
  ON public.combos (lifecycle_status, display_order);

-- Customers may read only live combos.  Keeping the old `active` predicate
-- makes this safe for rows written by older clients during rollout.
DROP POLICY IF EXISTS "customer_select_active_combos" ON public.combos;
CREATE POLICY "customer_select_active_combos" ON public.combos
  FOR SELECT TO authenticated
  USING (active = true AND lifecycle_status = 'active');

DROP POLICY IF EXISTS "customer_select_items_for_active_combos" ON public.combo_items;
CREATE POLICY "customer_select_items_for_active_combos" ON public.combo_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.combos
       WHERE combos.id = combo_items.combo_id
         AND combos.active = true
         AND combos.lifecycle_status = 'active'
    )
  );

-- A canonical order must not be created for a hidden combo even if a client
-- bypasses the storefront and invokes checkout directly.  This trigger runs
-- only for a new order line, so historic snapshots remain untouched.
CREATE OR REPLACE FUNCTION public.combo_builder_require_active_combo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.item_kind = 'combo' AND NOT EXISTS (
    SELECT 1 FROM public.combos c
     WHERE c.id = NEW.combo_id
       AND c.active = true
       AND c.lifecycle_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Combo % is not available for ordering.', NEW.combo_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS combo_builder_require_active_combo ON public.sales_order_lines;
CREATE TRIGGER combo_builder_require_active_combo
  BEFORE INSERT ON public.sales_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.combo_builder_require_active_combo();

-- Admin-only lifecycle transition.  Activating a new combo creates its first
-- immutable canonical recipe from the draft components.  Existing canonical
-- versions are deliberately reused on reactivation: the normal weekly flow is
-- Duplicate -> edit draft -> Activate, never edit a historical combo in place.
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

  IF NOT EXISTS (SELECT 1 FROM public.combo_items WHERE combo_id = p_combo_id) THEN
    RAISE EXCEPTION 'A combo needs at least one item before activation.' USING ERRCODE = '22023';
  END IF;

  SELECT ci.product_id INTO v_missing_product
    FROM public.combo_items ci
   WHERE ci.combo_id = p_combo_id
     AND NOT EXISTS (
       SELECT 1 FROM public.product_versions pv
        WHERE pv.product_id = ci.product_id
          AND pv.status = 'published'
          AND pv.effective_from <= now()
          AND (pv.effective_to IS NULL OR pv.effective_to > now())
     )
   LIMIT 1;
  IF v_missing_product IS NOT NULL THEN
    RAISE EXCEPTION 'Combo component % has no published canonical product version.', v_missing_product;
  END IF;

  SELECT id INTO v_combo_version_id
    FROM public.combo_versions
   WHERE combo_id = p_combo_id
     AND status = 'published'
     AND effective_from <= now()
     AND (effective_to IS NULL OR effective_to > now())
   ORDER BY effective_from DESC
   LIMIT 1;

  IF v_combo_version_id IS NULL THEN
    INSERT INTO public.combo_versions (
      combo_id, version_number, status, effective_from, selling_price,
      currency_code, configuration, display_snapshot, published_at, published_by
    ) VALUES (
      p_combo_id,
      COALESCE((SELECT MAX(version_number) FROM public.combo_versions WHERE combo_id = p_combo_id), 0) + 1,
      'published', now(), v_combo.price, 'MYR', '{}'::jsonb,
      jsonb_build_object('name', v_combo.name, 'name_ms', v_combo.name_ms), now(), auth.uid()
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
         AND pv.effective_from <= now()
         AND (pv.effective_to IS NULL OR pv.effective_to > now())
       ORDER BY pv.effective_from DESC
       LIMIT 1
    ) pv ON true
    WHERE ci.combo_id = p_combo_id
    ORDER BY ci.sort_order;
  END IF;

  UPDATE public.combos
     SET lifecycle_status = 'active', active = true, updated_at = now()
   WHERE id = p_combo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_combo_lifecycle(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_combo_lifecycle(text, text) TO authenticated;
