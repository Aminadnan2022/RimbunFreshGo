-- Phase 0: reconcile CheckoutPage with the deployed customer_profiles schema.
-- Safe on environments where an earlier manual change already added either column.
-- No existing values, orders, policies, or RLS predicates are modified.

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS email_address text,
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.customer_profiles.email_address IS
  'Checkout convenience copy of the authenticated customer email; auth.users remains authoritative.';

COMMENT ON COLUMN public.customer_profiles.notes IS
  'Customer delivery notes saved by checkout.';
