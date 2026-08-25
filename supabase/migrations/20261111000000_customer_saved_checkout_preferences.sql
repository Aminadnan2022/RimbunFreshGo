BEGIN;

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS last_delivery_method text;

ALTER TABLE public.customer_profiles
  DROP CONSTRAINT IF EXISTS customer_profiles_last_delivery_method_check;

ALTER TABLE public.customer_profiles
  ADD CONSTRAINT customer_profiles_last_delivery_method_check
  CHECK (
    last_delivery_method IS NULL
    OR last_delivery_method IN ('normal_bulk', 'instant_customer_lalamove')
  );

COMMENT ON COLUMN public.customer_profiles.last_delivery_method IS
  'Last successful checkout delivery method, reused as the default on future checkouts.';

COMMIT;
