-- Repair remote privilege drift discovered after a successful Web Push send
-- could not persist its delivery-attempt audit row. Do not amend the already
-- applied web-push foundation migration: production environments may have its
-- older grant state.
BEGIN;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, UPDATE ON TABLE public.web_push_delivery_jobs TO service_role;
GRANT INSERT ON TABLE public.web_push_delivery_attempts TO service_role;
GRANT SELECT, UPDATE ON TABLE public.push_subscriptions TO service_role;
GRANT SELECT ON TABLE public.notifications TO service_role;

COMMIT;
