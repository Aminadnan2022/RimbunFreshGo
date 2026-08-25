-- FreshGo Web Push Gate 2. This migration has not been applied anywhere.
-- notifications remains canonical; each active subscription gets one private job.
BEGIN;

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL, p256dh text NOT NULL, auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(), last_success_at timestamptz,
  disabled_at timestamptz, failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_failure_at timestamptz, last_failure_reason text,
  CONSTRAINT push_subscriptions_endpoint_https CHECK (endpoint ~ '^https://'),
  CONSTRAINT push_subscriptions_p256dh_present CHECK (length(p256dh) BETWEEN 16 AND 512),
  CONSTRAINT push_subscriptions_auth_present CHECK (length(auth) BETWEEN 8 AND 256)
);
CREATE UNIQUE INDEX push_subscriptions_endpoint_key ON public.push_subscriptions (endpoint);
CREATE INDEX push_subscriptions_active_user_idx ON public.push_subscriptions (user_id, last_seen_at DESC) WHERE disabled_at IS NULL;
CREATE OR REPLACE FUNCTION public.set_push_subscription_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_push_subscriptions_updated_at BEFORE UPDATE ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_push_subscription_updated_at();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY push_subscriptions_owner_select ON public.push_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Browser writes use the narrowly scoped RPCs below; direct table mutation is denied.
REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.push_subscriptions TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_own_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE existing_user uuid; subscription_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT user_id INTO existing_user FROM public.push_subscriptions WHERE endpoint = p_endpoint FOR UPDATE;
  IF existing_user IS NOT NULL AND existing_user <> auth.uid() THEN RAISE EXCEPTION 'Push endpoint belongs to another account' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth)
  ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, last_seen_at = now(), disabled_at = NULL, failure_count = 0, last_failure_at = NULL, last_failure_reason = NULL
  RETURNING id INTO subscription_id;
  RETURN subscription_id;
END; $$;
CREATE OR REPLACE FUNCTION public.disable_own_push_subscription(p_endpoint text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  UPDATE public.push_subscriptions SET disabled_at = now() WHERE user_id = auth.uid() AND endpoint = p_endpoint;
END; $$;
REVOKE ALL ON FUNCTION public.upsert_own_push_subscription(text, text, text), public.disable_own_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_own_push_subscription(text, text, text), public.disable_own_push_subscription(text) TO authenticated;

CREATE TABLE public.web_push_delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0), next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz, delivered_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_push_delivery_jobs_notification_subscription_key UNIQUE (notification_id, subscription_id)
);
CREATE INDEX web_push_delivery_jobs_pending_idx ON public.web_push_delivery_jobs (next_attempt_at, created_at) WHERE status = 'pending';
CREATE TABLE public.web_push_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES public.web_push_delivery_jobs(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.push_subscriptions(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN ('delivered', 'transient_failure', 'permanent_failure', 'expired', 'no_active_subscriptions')),
  response_status integer, error_code text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_push_delivery_attempts_job_idx ON public.web_push_delivery_attempts (job_id, created_at DESC);
ALTER TABLE public.web_push_delivery_jobs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.web_push_delivery_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.web_push_delivery_attempts ENABLE ROW LEVEL SECURITY; ALTER TABLE public.web_push_delivery_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_push_delivery_jobs, public.web_push_delivery_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_web_push_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- trg_notification_discard_legacy_fallback is alphabetically earlier among AFTER INSERT triggers.
  -- Explicit exclusion remains safe even if trigger ordering changes.
  IF COALESCE(NEW.dedupe_key, '') NOT LIKE 'legacy-write:%' AND NEW.recipient_user_id IS NOT NULL
     AND NEW.notification_type IN ('payment_receipt_submitted', 'order_requires_weighing', 'price_finalised', 'payment_confirmed', 'payment_receipt_rejected', 'order_paid_ready_to_prepare', 'order_ready_for_dispatch', 'delivery_assigned', 'out_for_delivery', 'order_cancelled') THEN
    INSERT INTO public.web_push_delivery_jobs (notification_id, subscription_id)
    SELECT NEW.id, s.id FROM public.push_subscriptions s WHERE s.user_id = NEW.recipient_user_id AND s.disabled_at IS NULL
    ON CONFLICT (notification_id, subscription_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notifications_enqueue_web_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.enqueue_web_push_delivery();

CREATE OR REPLACE FUNCTION public.claim_web_push_delivery_jobs(p_limit integer DEFAULT 25)
RETURNS TABLE(id uuid, notification_id uuid, subscription_id uuid, attempt_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'p_limit must be between 1 and 100'; END IF;
  UPDATE public.web_push_delivery_jobs SET status = 'pending', locked_at = NULL, next_attempt_at = now(), updated_at = now() WHERE status = 'processing' AND locked_at < now() - interval '15 minutes';
  RETURN QUERY WITH leased AS (SELECT j.id FROM public.web_push_delivery_jobs j WHERE j.status = 'pending' AND j.next_attempt_at <= now() ORDER BY j.next_attempt_at, j.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit)
  UPDATE public.web_push_delivery_jobs j SET status = 'processing', locked_at = now(), attempt_count = j.attempt_count + 1, updated_at = now() FROM leased WHERE j.id = leased.id RETURNING j.id, j.notification_id, j.subscription_id, j.attempt_count;
END; $$;
REVOKE ALL ON FUNCTION public.claim_web_push_delivery_jobs(integer) FROM PUBLIC, anon, authenticated;
-- Dispatcher runs as service_role, with only the tables/functions it needs.
GRANT EXECUTE ON FUNCTION public.claim_web_push_delivery_jobs(integer) TO service_role;
GRANT SELECT, UPDATE ON public.web_push_delivery_jobs TO service_role;
GRANT INSERT ON public.web_push_delivery_attempts TO service_role;
GRANT SELECT, UPDATE ON public.push_subscriptions TO service_role;
GRANT SELECT ON public.notifications TO service_role;
COMMIT;
