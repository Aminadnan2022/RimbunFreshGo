-- Align admin product republication with the existing immutable-version guard.
-- A published version remains published as a historical snapshot; retirement
-- is represented solely by closing its open effective period.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_update_product_and_publish_configuration(
  p_product_id text,
  p_product jsonb
)
RETURNS public."Product"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_product public."Product"%ROWTYPE;
  v_current public.product_versions%ROWTYPE;
  v_schema_version_id uuid;
  v_schema_code text;
  v_physical_unit_type text;
  v_next_version integer;
  v_display_snapshot jsonb;
  v_should_publish boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access is required.' USING ERRCODE = '42501';
  END IF;

  IF p_product_id IS NULL OR btrim(p_product_id) = ''
     OR p_product IS NULL OR jsonb_typeof(p_product) <> 'object' THEN
    RAISE EXCEPTION 'A product id and product configuration are required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product
    FROM public."Product"
   WHERE id = p_product_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % was not found.', p_product_id USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(p_product ->> 'ordering_mode', '') NOT IN
     ('fixed_quantity', 'weight_only', 'whole_fish_by_weight', 'combo', 'slice') THEN
    RAISE EXCEPTION 'Invalid ordering mode.' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_product ->> 'selling_unit', '') NOT IN ('piece', 'kg', 'pack') THEN
    RAISE EXCEPTION 'Invalid selling unit.' USING ERRCODE = '22023';
  END IF;

  UPDATE public."Product"
     SET name = p_product ->> 'name',
         name_ms = p_product ->> 'name_ms',
         category = p_product ->> 'category',
         price = (p_product ->> 'price')::numeric,
         cost_price = COALESCE((p_product ->> 'cost_price')::numeric, 0),
         cost_supplier_name = COALESCE(p_product ->> 'cost_supplier_name', ''),
         unit = p_product ->> 'unit',
         price_note = NULLIF(p_product ->> 'price_note', ''),
         weight = NULLIF(p_product ->> 'weight', ''),
         quantity = COALESCE((p_product ->> 'quantity')::integer, 0),
         description = p_product ->> 'description',
         long_description = p_product ->> 'long_description',
         image = p_product ->> 'image',
         images = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_product -> 'images', '[]'::jsonb))),
         freshness = p_product ->> 'freshness',
         vendor_id = p_product ->> 'vendor_id',
         vendor_name = p_product ->> 'vendor_name',
         tags = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_product -> 'tags', '[]'::jsonb))),
         is_popular = COALESCE((p_product ->> 'is_popular')::boolean, false),
         ordering_mode = p_product ->> 'ordering_mode',
         selling_unit = p_product ->> 'selling_unit',
         slice_unit = COALESCE(NULLIF(p_product ->> 'slice_unit', ''), v_product.slice_unit),
         min_slice = COALESCE((p_product ->> 'min_slice')::integer, v_product.min_slice),
         max_slice = COALESCE((p_product ->> 'max_slice')::integer, v_product.max_slice),
         default_slice = COALESCE((p_product ->> 'default_slice')::integer, v_product.default_slice),
         slice_increment = COALESCE((p_product ->> 'slice_increment')::integer, v_product.slice_increment),
         slice_instruction = COALESCE(p_product ->> 'slice_instruction', v_product.slice_instruction)
   WHERE id = p_product_id
   RETURNING * INTO v_product;

  v_schema_code := CASE
    WHEN v_product.category = 'chicken' AND v_product.ordering_mode <> 'slice'
      THEN 'chicken-preparation'
    WHEN v_product.category = 'fish'
         AND v_product.ordering_mode IN ('fixed_quantity', 'whole_fish_by_weight')
         AND v_product.selling_unit = 'piece'
      THEN 'fish-piece-preparation'
    WHEN v_product.category = 'fish' AND v_product.ordering_mode = 'weight_only'
      THEN 'fish-preparation'
    ELSE NULL
  END;

  IF v_schema_code IS NOT NULL THEN
    SELECT psv.id INTO v_schema_version_id
      FROM public.preparation_schema_versions psv
      JOIN public.preparation_schemas ps ON ps.id = psv.preparation_schema_id
     WHERE ps.code = v_schema_code
       AND ps.active = true
       AND psv.status = 'published'
       AND psv.effective_from <= v_now
       AND (psv.effective_to IS NULL OR psv.effective_to > v_now)
     ORDER BY psv.version_number DESC
     LIMIT 1;

    IF v_schema_version_id IS NULL THEN
      RAISE EXCEPTION 'No published preparation schema exists for %.', v_schema_code;
    END IF;
  END IF;

  v_physical_unit_type := CASE
    WHEN v_product.category = 'chicken' THEN 'chicken'
    WHEN v_product.category = 'fish' THEN 'fish'
    ELSE 'none'
  END;

  v_display_snapshot := jsonb_build_object(
    'name', v_product.name,
    'name_ms', v_product.name_ms,
    'category', v_product.category,
    'ordering_mode', v_product.ordering_mode,
    'selling_unit', v_product.selling_unit
  );

  SELECT * INTO v_current
    FROM public.product_versions
   WHERE product_id = p_product_id
     AND status = 'published'
     AND effective_from <= v_now
     AND (effective_to IS NULL OR effective_to > v_now)
   ORDER BY effective_from DESC
   LIMIT 1
   FOR UPDATE;

  v_should_publish := NOT FOUND
    OR v_current.ordering_mode IS DISTINCT FROM v_product.ordering_mode
    OR v_current.selling_unit IS DISTINCT FROM v_product.selling_unit
    OR v_current.physical_unit_type IS DISTINCT FROM v_physical_unit_type
    OR v_current.preparation_schema_version_id IS DISTINCT FROM v_schema_version_id
    OR COALESCE(v_current.display_snapshot ->> 'name', '') IS DISTINCT FROM v_product.name
    OR COALESCE(v_current.display_snapshot ->> 'name_ms', '') IS DISTINCT FROM v_product.name_ms
    OR COALESCE(v_current.display_snapshot ->> 'category', '') IS DISTINCT FROM v_product.category
    OR (v_product.ordering_mode = 'slice' AND (
         v_current.minimum_quantity IS DISTINCT FROM v_product.min_slice
         OR v_current.maximum_quantity IS DISTINCT FROM v_product.max_slice
         OR v_current.quantity_increment IS DISTINCT FROM v_product.slice_increment
       ));

  IF v_should_publish THEN
    IF v_current.id IS NOT NULL THEN
      UPDATE public.product_versions
         SET effective_to = v_now
       WHERE id = v_current.id;
    END IF;

    SELECT COALESCE(max(version_number), 0) + 1
      INTO v_next_version
      FROM public.product_versions
     WHERE product_id = p_product_id;

    INSERT INTO public.product_versions (
      product_id, version_number, status, effective_from,
      preparation_schema_version_id, selling_unit, ordering_mode,
      physical_unit_type, minimum_quantity, maximum_quantity,
      quantity_increment, configuration, display_snapshot,
      published_at, published_by, created_by
    ) VALUES (
      p_product_id, v_next_version, 'published', v_now,
      v_schema_version_id, v_product.selling_unit, v_product.ordering_mode,
      v_physical_unit_type,
      CASE WHEN v_product.ordering_mode = 'slice' THEN v_product.min_slice ELSE v_current.minimum_quantity END,
      CASE WHEN v_product.ordering_mode = 'slice' THEN v_product.max_slice ELSE v_current.maximum_quantity END,
      CASE WHEN v_product.ordering_mode = 'slice' THEN v_product.slice_increment ELSE v_current.quantity_increment END,
      COALESCE(v_current.configuration, '{}'::jsonb), v_display_snapshot,
      v_now, auth.uid(), auth.uid()
    );
  END IF;

  RETURN v_product;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_product_and_publish_configuration(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_product_and_publish_configuration(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_product_and_publish_configuration(text, jsonb) TO authenticated;

COMMIT;
