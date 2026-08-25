import { readFile } from 'node:fs/promises';

const [migration, privilegeRepair, sender, worker, client, persistence] = await Promise.all([
  readFile('supabase/migrations/20261113000000_web_push_foundation.sql', 'utf8'),
  readFile('supabase/migrations/20261113000001_repair_web_push_dispatcher_privileges.sql', 'utf8'),
  readFile('supabase/functions/web-push-dispatch/index.ts', 'utf8'),
  readFile('public/sw.js', 'utf8'),
  readFile('src/pwa/webPush.ts', 'utf8'),
  readFile('supabase/functions/web-push-dispatch/persistence.ts', 'utf8'),
]);
const requireAll = (source, markers, area) => {
  for (const marker of markers) if (!source.includes(marker)) throw new Error(`${area} regression guard missing: ${marker}`);
};

// service_role is deliberately narrow while browser roles retain no direct writes.
requireAll(migration, ['GRANT EXECUTE ON FUNCTION public.claim_web_push_delivery_jobs(integer) TO service_role', 'GRANT SELECT, UPDATE ON public.web_push_delivery_jobs TO service_role', 'GRANT INSERT ON public.web_push_delivery_attempts TO service_role', 'GRANT SELECT, UPDATE ON public.push_subscriptions TO service_role', 'GRANT SELECT ON public.notifications TO service_role', 'REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated', 'GRANT SELECT ON public.push_subscriptions TO authenticated'], 'service-role privilege');
requireAll(privilegeRepair, ['GRANT USAGE ON SCHEMA public TO service_role', 'GRANT SELECT, UPDATE ON TABLE public.web_push_delivery_jobs TO service_role', 'GRANT INSERT ON TABLE public.web_push_delivery_attempts TO service_role', 'GRANT SELECT, UPDATE ON TABLE public.push_subscriptions TO service_role', 'GRANT SELECT ON TABLE public.notifications TO service_role'], 'service-role privilege repair');
// This matches the legacy fallback trigger regardless of alphabetical AFTER-trigger ordering.
requireAll(migration, ["COALESCE(NEW.dedupe_key, '') NOT LIKE 'legacy-write:%'", 'trg_notifications_enqueue_web_push', 'trg_notification_discard_legacy_fallback'], 'legacy fallback exclusion');
// One job per subscription prevents partial multi-device retry from replaying a successful device.
requireAll(migration, ['subscription_id uuid NOT NULL REFERENCES public.push_subscriptions', 'UNIQUE (notification_id, subscription_id)', 'SELECT NEW.id, s.id'], 'per-subscription retry');
requireAll(sender, ['subscription_id: string; attempt_count: number', 'job.attempt_count >= 5', 'Subscription query retry limit reached', 'Could not persist subscription query failure'], 'bounded subscription query retry');
requireAll(sender, ['PersistenceError', 'persisted', 'recordDeliveryAttempt', 'web_push_persistence_failure_v4'], 'persistence failure handling');
requireAll(persistence, ['recordDeliveryAttempt', 'persisted(operation', 'no SELECT'], 'audit write privilege alignment');
if (/web_push_delivery_attempts"\)\.insert\(\{[^;]*?\}\)\.select\("id"\)\.single\(\)/s.test(sender)) throw new Error('Attempt audit writes must not request a SELECT representation.');
if (/from\("(?:web_push_delivery_jobs|web_push_delivery_attempts|push_subscriptions)"\)\.(?:insert|update)\([^\n]*\.select\(/.test(sender)) throw new Error('Dispatcher persistence writes must use PostgREST return=minimal (no select representation).');
requireAll(worker, ["value.includes('\\\\')", 'new URL(value, self.location.origin)', 'destination.origin !== self.location.origin', "return '/notifications'"], 'same-origin route');
requireAll(worker, ["self.addEventListener('push'", 'self.registration.showNotification', "self.addEventListener('message'", 'freshgo:service-worker-status', 'freshgo:background-push-diagnostic', 'PUSH_DIAGNOSTIC_CACHE', 'receivedAt', "showResult: 'fulfilled'", "showResult: 'rejected'", 'event.waitUntil((async () =>', 'self.skipWaiting()', 'self.clients.claim()'], 'background push worker');
requireAll(client, ["register('/sw.js', { scope: '/' })", 'webPushWorkerDiagnostic', 'backgroundPushDiagnostic', 'freshgo:background-push-diagnostic', 'freshgo:service-worker-status'], 'expected worker verification');
requireAll(client, ["rpc('upsert_own_push_subscription'", "rpc('disable_own_push_subscription'"], 'browser subscription RPC');
console.log('Web Push Gate 2 regression guards passed.');
