-- Phase A only: establish the Segar Putrajaya canonical supplier identity.
--
-- The linked FreshGo audit found a pre-canonical schema (supplier_profiles but
-- no supplier_users), one supplier named Shah, and mostly zero-cost placeholder
-- rows. This migration therefore must not perform a price cutover.
--
-- Deliberately out of scope until separately verified:
--   * deciding that Shah and Segar Putrajaya are the same business;
--   * assigning a supplier login;
--   * changing supplier_price_history or Product compatibility cost mirrors;
--   * changing Product.vendor_id / Product.vendor_name;
--   * changing any order, snapshot, fulfilment, or delivery-batch row.
--
-- Phase B must be a later migration containing an explicit reviewed VALUES
-- list of (product_id, verified_cost). It must close and append history only for
-- those listed products. Zero-cost rows are not price evidence.

BEGIN;

-- This branch's supplier authorization and fulfilment functions use
-- supplier_users (supplier_id -> auth user). supplier_profiles is the older
-- vendor-slug model and is not a substitute. Refuse to apply this late migration
-- to a database whose canonical migration chain is incomplete.
DO $$
BEGIN
  IF to_regclass('public.supplier_users') IS NULL THEN
    RAISE EXCEPTION
      'Canonical supplier schema is incomplete: public.supplier_users is missing. Audit migration history before Phase A.';
  END IF;
END
$$;

LOCK TABLE public.suppliers IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_exact_count integer;
  v_normalized_count integer;
  v_supplier_id bigint;
  v_is_active boolean;
BEGIN
  SELECT count(*), min(id)
    INTO v_exact_count, v_supplier_id
    FROM public.suppliers
   WHERE name = 'Segar Putrajaya';

  SELECT count(*)
    INTO v_normalized_count
    FROM public.suppliers
   WHERE lower(btrim(name)) = lower('Segar Putrajaya');

  IF v_normalized_count > 1 THEN
    RAISE EXCEPTION
      'Multiple normalized Segar Putrajaya suppliers exist; resolve the directory manually.';
  END IF;

  -- A near-match may carry distinct business meaning. Do not silently normalize
  -- or rename it in a migration.
  IF v_normalized_count = 1 AND v_exact_count = 0 THEN
    RAISE EXCEPTION
      'A non-exact Segar Putrajaya supplier name exists; review it manually before Phase A.';
  END IF;

  IF v_exact_count = 0 THEN
    INSERT INTO public.suppliers (name)
    VALUES ('Segar Putrajaya')
    RETURNING id, is_active INTO v_supplier_id, v_is_active;
  ELSIF v_exact_count = 1 THEN
    SELECT is_active
      INTO v_is_active
      FROM public.suppliers
     WHERE id = v_supplier_id;
  ELSE
    RAISE EXCEPTION
      'Multiple exact Segar Putrajaya suppliers exist; resolve the directory manually.';
  END IF;

  -- Do not silently reactivate a supplier that an operator intentionally retired.
  IF v_is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'Segar Putrajaya supplier % is inactive; explicit operator review is required.',
      v_supplier_id;
  END IF;
END
$$;

-- Postcondition is intentionally limited to directory identity. Price and login
-- mappings remain unchanged until their inputs are independently verified.
DO $$
DECLARE
  v_matches integer;
BEGIN
  SELECT count(*)
    INTO v_matches
    FROM public.suppliers
   WHERE name = 'Segar Putrajaya'
     AND is_active = true;

  IF v_matches <> 1 THEN
    RAISE EXCEPTION
      'Phase A invariant failed: expected one active exact Segar Putrajaya supplier, found %.',
      v_matches;
  END IF;
END
$$;

COMMIT;
