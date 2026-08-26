-- FreshGo Gate 3: customer transactional email delivery queue.
-- notifications remains the canonical event/message source.
BEGIN;

CREATE TABLE public.transactional_email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  delivered_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transactional_email_jobs_notification_key UNIQUE (notification_id)
);
CREATE INDEX transactional_email_jobs_pending_idx
  ON public.transactional_email_jobs (next_attempt_at, created_at)
  WHERE status = 'pending';

CREATE TABLE public.transactional_email_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.transactional_email_jobs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  outcome text NOT NULL CHECK (outcome IN ('delivered', 'transient_failure', 'permanent_failure', 'recipient_unavailable')),
  response_status integer,
  provider_message_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transactional_email_attempts_job_attempt_key UNIQUE (job_id, attempt_number)
);

ALTER TABLE public.transactional_email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactional_email_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transactional_email_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactional_email_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.transactional_email_jobs, public.transactional_email_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_transactional_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF COALESCE(NEW.dedupe_key, '') NOT LIKE 'legacy-write:%'
     AND NEW.recipient_role = 'customer'
     AND NEW.recipient_user_id IS NOT NULL
     AND NEW.notification_type IN (
       'order_payment_submitted', 'price_finalised', 'payment_confirmed',
       'payment_receipt_rejected', 'order_cancelled', 'out_for_delivery', 'order_delivered'
     ) THEN
    INSERT INTO public.transactional_email_jobs (notification_id, recipient_user_id)
    VALUES (NEW.id, NEW.recipient_user_id)
    ON CONFLICT (notification_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notifications_enqueue_transactional_email
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.enqueue_transactional_email();

CREATE OR REPLACE FUNCTION public.claim_transactional_email_jobs(p_limit integer DEFAULT 25)
RETURNS TABLE(id uuid, notification_id uuid, recipient_user_id uuid, attempt_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 100';
  END IF;
  UPDATE public.transactional_email_jobs
  SET status = 'pending', locked_at = NULL, next_attempt_at = now(), updated_at = now()
  WHERE status = 'processing' AND locked_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH leased AS (
    SELECT j.id FROM public.transactional_email_jobs j
    WHERE j.status = 'pending' AND j.next_attempt_at <= now()
    ORDER BY j.next_attempt_at, j.created_at
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  )
  UPDATE public.transactional_email_jobs j
  SET status = 'processing', locked_at = now(), attempt_count = j.attempt_count + 1, updated_at = now()
  FROM leased WHERE j.id = leased.id
  RETURNING j.id, j.notification_id, j.recipient_user_id, j.attempt_count;
END; $$;

REVOKE ALL ON FUNCTION public.claim_transactional_email_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_transactional_email_jobs(integer) TO service_role;
GRANT SELECT, UPDATE ON public.transactional_email_jobs TO service_role;
GRANT INSERT ON public.transactional_email_attempts TO service_role;
GRANT SELECT ON public.notifications TO service_role;
COMMIT;
