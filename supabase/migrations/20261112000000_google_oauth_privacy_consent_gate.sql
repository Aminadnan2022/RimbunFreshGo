-- Google is allowed to create an identity, but it starts with an explicit
-- non-granted consent record. The customer cannot complete checkout until a
-- current, granted Privacy Notice record exists.

CREATE OR REPLACE FUNCTION public.capture_signup_privacy_consents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_version text := COALESCE(NULLIF(NEW.raw_user_meta_data->>'privacy_policy_version', ''), '2026-08-25');
BEGIN
  IF NEW.raw_app_meta_data->>'provider' = 'google' THEN
    INSERT INTO public.customer_privacy_consents
      (customer_id, consent_type, granted, policy_version, source)
    VALUES
      (NEW.id, 'privacy_notice', false, v_version, 'signup'),
      (NEW.id, 'marketing', false, v_version, 'signup');
    RETURN NEW;
  END IF;

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

CREATE OR REPLACE FUNCTION public.has_current_customer_privacy_consent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customer_privacy_consents AS consent
    WHERE consent.customer_id = auth.uid()
      AND consent.consent_type = 'privacy_notice'
      AND consent.granted = true
      AND consent.policy_version = '2026-08-25'
  );
$$;

REVOKE ALL ON FUNCTION public.has_current_customer_privacy_consent() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_current_customer_privacy_consent() TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_customer_privacy_consent_before_checkout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id = auth.uid()
     AND NOT public.is_admin()
     AND NOT public.has_current_customer_privacy_consent() THEN
    RAISE EXCEPTION 'Please accept the FreshGo Privacy Notice before placing an order.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_customer_privacy_consent_before_checkout ON public.sales_orders;
CREATE TRIGGER enforce_customer_privacy_consent_before_checkout
  BEFORE INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_privacy_consent_before_checkout();
