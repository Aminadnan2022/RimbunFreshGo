-- Phase 4C.0 canonical supplier test provisioning.
-- Verified business inputs only:
--   supplier name: Segar Putrajaya
--   supplier login UUID: 450b3022-3322-45bb-8e6f-8abb1112f625
--   broiler-chicken supplier cost: RM16.00
--
-- No historical sales orders are modified.

BEGIN;

DO $$
DECLARE
  v_supplier_id bigint;
BEGIN
  -- 1. Canonical supplier master.
  SELECT id
    INTO v_supplier_id
    FROM public.suppliers
   WHERE name = 'Segar Putrajaya'
   LIMIT 1;

  IF v_supplier_id IS NULL THEN
    INSERT INTO public.suppliers (name)
    VALUES ('Segar Putrajaya')
    RETURNING id INTO v_supplier_id;
  END IF;

  -- 2. Map the verified supplier login to the canonical supplier.
  INSERT INTO public.supplier_users (
    supplier_id,
    user_id,
    active
  )
  VALUES (
    v_supplier_id,
    '450b3022-3322-45bb-8e6f-8abb1112f625'::uuid,
    true
  )
  ON CONFLICT (supplier_id, user_id)
  DO UPDATE SET active = true;

  -- 3. Close the existing active broiler-chicken supplier cost row.
  UPDATE public.supplier_price_history
     SET effective_to = now(),
         is_active = false,
         updated_at = now()
   WHERE product_id = 'broiler-chicken'
     AND is_active = true;

  -- 4. Insert the verified canonical supplier cost.
  INSERT INTO public.supplier_price_history (
    product_id,
    supplier_id,
    supplier_name,
    cost_price,
    effective_from,
    effective_to,
    is_active
  )
  VALUES (
    'broiler-chicken',
    v_supplier_id,
    'Segar Putrajaya',
    16.00,
    now(),
    NULL,
    true
  );

  -- 5. Legacy compatibility mirror only.
  -- Canonical checkout still reads supplier_price_history.
  UPDATE public."Product"
     SET cost_price = 16.00,
         cost_supplier_name = 'Segar Putrajaya'
   WHERE id = 'broiler-chicken';
END
$$;

COMMIT;
