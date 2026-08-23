-- Combo Builder admin writes must not depend on table INSERT/UPDATE/DELETE
-- privileges for the browser role.  These narrowly scoped RPCs keep the
-- existing tables read-only to authenticated clients and perform mutations
-- only after the caller is confirmed as an admin.

CREATE OR REPLACE FUNCTION public.admin_duplicate_combo(p_source_combo_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.combos%ROWTYPE;
  v_new_id text;
  v_new_slug text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_source
    FROM public.combos
   WHERE id = p_source_combo_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Combo % not found.', p_source_combo_id USING ERRCODE = 'P0002';
  END IF;

  v_new_id := 'combo-' || replace(gen_random_uuid()::text, '-', '');
  v_new_slug := left(v_source.slug, 48) || '-copy-' || left(replace(gen_random_uuid()::text, '-', ''), 10);

  INSERT INTO public.combos (
    id, name, name_ms, slug, description, badge, category_label, tagline,
    price, original_value, image, images, servings, highlights, featured,
    active, lifecycle_status, is_pinned, display_order, updated_at
  ) VALUES (
    v_new_id, v_source.name || ' (Copy)', v_source.name_ms || ' (Copy)',
    v_new_slug, v_source.description, v_source.badge, v_source.category_label,
    v_source.tagline, v_source.price, v_source.original_value, v_source.image,
    v_source.images, v_source.servings, v_source.highlights, false, false,
    'draft', false,
    COALESCE((SELECT MAX(display_order) + 1 FROM public.combos), 0), now()
  );

  INSERT INTO public.combo_items (
    combo_id, product_id, quantity_value, selling_unit, sort_order,
    custom_label, preparation, unit
  )
  SELECT v_new_id, product_id, quantity_value, selling_unit, sort_order,
         custom_label, preparation, unit
    FROM public.combo_items
   WHERE combo_id = p_source_combo_id
   ORDER BY sort_order, id;

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_combo(
  p_combo_id text,
  p_combo jsonb,
  p_items jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  IF p_combo_id IS NULL OR btrim(p_combo_id) = '' OR jsonb_typeof(p_combo) <> 'object' THEN
    RAISE EXCEPTION 'Invalid combo payload.' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid combo items payload.' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.combos WHERE id = p_combo_id) INTO v_exists;
  IF v_exists THEN
    UPDATE public.combos c
       SET name = COALESCE(p_combo->>'name', c.name),
           name_ms = COALESCE(p_combo->>'name_ms', c.name_ms),
           slug = COALESCE(p_combo->>'slug', c.slug),
           description = COALESCE(p_combo->>'description', c.description),
           badge = COALESCE(p_combo->>'badge', c.badge),
           category_label = COALESCE(p_combo->>'category_label', c.category_label),
           tagline = COALESCE(p_combo->>'tagline', c.tagline),
           price = COALESCE((p_combo->>'price')::numeric, c.price),
           original_value = COALESCE((p_combo->>'original_value')::numeric, c.original_value),
           image = COALESCE(p_combo->>'image', c.image),
           images = CASE WHEN p_combo ? 'images' THEN ARRAY(SELECT jsonb_array_elements_text(p_combo->'images')) ELSE c.images END,
           servings = COALESCE((p_combo->>'servings')::integer, c.servings),
           highlights = CASE WHEN p_combo ? 'highlights' THEN ARRAY(SELECT jsonb_array_elements_text(p_combo->'highlights')) ELSE c.highlights END,
           updated_at = now()
     WHERE c.id = p_combo_id;
  ELSE
    INSERT INTO public.combos (
      id, name, name_ms, slug, description, badge, category_label, tagline,
      price, original_value, image, images, servings, highlights, featured,
      active, lifecycle_status, is_pinned, display_order, updated_at
    ) VALUES (
      p_combo_id, COALESCE(p_combo->>'name', ''), COALESCE(p_combo->>'name_ms', ''),
      COALESCE(p_combo->>'slug', p_combo_id), COALESCE(p_combo->>'description', ''),
      COALESCE(p_combo->>'badge', 'Best Value'), COALESCE(p_combo->>'category_label', ''),
      COALESCE(p_combo->>'tagline', ''), COALESCE((p_combo->>'price')::numeric, 0),
      COALESCE((p_combo->>'original_value')::numeric, 0), COALESCE(p_combo->>'image', ''),
      CASE WHEN p_combo ? 'images' THEN ARRAY(SELECT jsonb_array_elements_text(p_combo->'images')) ELSE '{}'::text[] END,
      COALESCE((p_combo->>'servings')::integer, 4),
      CASE WHEN p_combo ? 'highlights' THEN ARRAY(SELECT jsonb_array_elements_text(p_combo->'highlights')) ELSE '{}'::text[] END,
      false, false, 'draft', false,
      COALESCE((SELECT MAX(display_order) + 1 FROM public.combos), 0), now()
    );
  END IF;

  IF p_items IS NOT NULL THEN
    DELETE FROM public.combo_items WHERE combo_id = p_combo_id;
    INSERT INTO public.combo_items (
      combo_id, product_id, quantity_value, selling_unit, sort_order,
      custom_label, preparation, unit
    )
    SELECT p_combo_id,
           item->>'product_id',
           COALESCE((item->>'quantity_value')::numeric, 1),
           COALESCE(item->>'selling_unit', 'piece'),
           COALESCE((item->>'sort_order')::integer, ordinality - 1),
           NULLIF(item->>'custom_label', ''), NULLIF(item->>'preparation', ''), NULLIF(item->>'unit', '')
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS items(item, ordinality);
  END IF;

  RETURN p_combo_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_combo_presentation(
  p_combo_id text,
  p_featured boolean DEFAULT NULL,
  p_is_pinned boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.combos
     SET featured = CASE
                      WHEN lifecycle_status = 'active' AND p_featured IS NOT NULL THEN p_featured
                      WHEN lifecycle_status <> 'active' THEN false
                      ELSE featured
                    END,
         is_pinned = COALESCE(p_is_pinned, is_pinned),
         updated_at = now()
   WHERE id = p_combo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Combo % not found.', p_combo_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_duplicate_combo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_save_combo(text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_combo_presentation(text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_duplicate_combo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_combo(text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_combo_presentation(text, boolean, boolean) TO authenticated;

-- Keep authenticated clients read-only at the table layer.  RLS remains in
-- force for reads; the SECURITY DEFINER functions above are the admin write API.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.combos, public.combo_items FROM authenticated;
