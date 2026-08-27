-- Suppress legacy notification fallback rows before uniqueness checks.
-- Phase 1 already emits the canonical price_finalised notification when an
-- order becomes final. The older pricing RPC still attempts a fallback insert
-- in the same transaction, which must not abort the supplier's final weight.
BEGIN;

DROP TRIGGER IF EXISTS trg_notification_discard_legacy_fallback
  ON public.notifications;

CREATE OR REPLACE FUNCTION public.notification_discard_legacy_fallback()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.dedupe_key LIKE 'legacy-write:%'
     AND NEW.notification_type IN (
       'price_finalised',
       'payment_receipt_submitted',
       'payment_receipt_rejected',
       'payment_confirmed'
     ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notification_discard_legacy_fallback
BEFORE INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.notification_discard_legacy_fallback();

COMMIT;
