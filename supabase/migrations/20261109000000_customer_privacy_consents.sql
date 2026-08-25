-- Customer privacy-notice acknowledgements and optional marketing consent.
-- This is an append-only audit log: each row records the customer's choice
-- at a specific point in time and against a named policy version.

CREATE TABLE IF NOT EXISTS public.customer_privacy_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  consent_type text NOT NULL CHECK (consent_type IN ('privacy_notice', 'marketing')),
  granted boolean NOT NULL,
  policy_version text NOT NULL,
  source text NOT NULL CHECK (source IN ('signup', 'checkout', 'profile')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_privacy_consents_customer_recorded_idx
  ON public.customer_privacy_consents (customer_id, recorded_at DESC);

ALTER TABLE public.customer_privacy_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_privacy_consents FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_customer_privacy_consents(
  p_privacy_notice_accepted boolean,
  p_marketing_opt_in boolean DEFAULT NULL,
  p_policy_version text DEFAULT '2026-08-25',
  p_source text DEFAULT 'checkout'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid := auth.uid();
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to record privacy choices.';
  END IF;
  IF p_privacy_notice_accepted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Privacy Notice acceptance is required.';
  END IF;
  IF p_policy_version IS NULL OR length(trim(p_policy_version)) = 0 THEN
    RAISE EXCEPTION 'A privacy policy version is required.';
  END IF;
  IF p_source NOT IN ('signup', 'checkout', 'profile') THEN
    RAISE EXCEPTION 'Invalid privacy consent source.';
  END IF;

  INSERT INTO public.customer_privacy_consents
    (customer_id, consent_type, granted, policy_version, source)
  VALUES
    (v_customer_id, 'privacy_notice', true, trim(p_policy_version), p_source);

  IF p_marketing_opt_in IS NOT NULL THEN
    INSERT INTO public.customer_privacy_consents
      (customer_id, consent_type, granted, policy_version, source)
    VALUES
      (v_customer_id, 'marketing', p_marketing_opt_in, trim(p_policy_version), p_source);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_privacy_consents(boolean, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_customer_privacy_consents(boolean, boolean, text, text) TO authenticated;

-- Email-confirmation flows may not have a customer session immediately after
-- sign-up. Store the normal sign-up choice server-side from auth metadata.
CREATE OR REPLACE FUNCTION public.capture_signup_privacy_consents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_version text := COALESCE(NULLIF(NEW.raw_user_meta_data->>'privacy_policy_version', ''), '2026-08-25');
BEGIN
  IF COALESCE((NEW.raw_user_meta_data->>'privacy_notice_accepted')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Privacy Notice acceptance is required to create a customer account.';
  END IF;

  INSERT INTO public.customer_privacy_consents
    (customer_id, consent_type, granted, policy_version, source)
  VALUES
    (NEW.id, 'privacy_notice', true, v_version, 'signup'),
    (NEW.id, 'marketing', COALESCE((NEW.raw_user_meta_data->>'marketing_opt_in')::boolean, false), v_version, 'signup');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_signup_privacy_consents ON auth.users;
CREATE TRIGGER capture_signup_privacy_consents
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.capture_signup_privacy_consents();
