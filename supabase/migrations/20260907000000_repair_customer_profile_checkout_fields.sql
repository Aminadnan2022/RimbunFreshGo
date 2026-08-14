-- Repair customer_profiles checkout fields.
--
-- Migration 20260902000000 is recorded as applied on the linked database,
-- but the deployed schema does not contain these columns. Keep the historical
-- migration immutable and repair the drift forward.

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS email_address text,
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.customer_profiles.email_address IS
  'Checkout convenience copy of the authenticated customer email; auth.users remains authoritative.';

COMMENT ON COLUMN public.customer_profiles.notes IS
  'Customer delivery notes saved by checkout.';
