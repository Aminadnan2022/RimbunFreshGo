import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, notificationPhase1, correctionMigration, emailMigration] = await Promise.all([
  readFile('supabase/migrations/20261124000000_allow_repeatable_final_amount_updated_notifications.sql', 'utf8'),
  readFile('supabase/migrations/20261104000000_notification_phase1.sql', 'utf8'),
  readFile('supabase/migrations/20261123000000_allow_pre_payment_weight_corrections.sql', 'utf8'),
  readFile('supabase/migrations/20261114000000_transactional_email_foundation.sql', 'utf8'),
]);

assert.match(migration, /DROP INDEX IF EXISTS public\.notifications_user_order_type_unique/);
assert.match(
  migration,
  /CREATE UNIQUE INDEX notifications_user_order_type_unique\s+ON public\.notifications \(recipient_user_id, sales_order_id, notification_type\)\s+WHERE recipient_user_id IS NOT NULL\s+AND sales_order_id IS NOT NULL\s+AND notification_type <> 'final_amount_updated'/s,
);
assert.match(notificationPhase1, /CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_unique\s+ON public\.notifications \(dedupe_key\)/s);
assert.match(notificationPhase1, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
assert.match(correctionMigration, /IF v_previous_final_total IS DISTINCT FROM v_final_total THEN/s);
assert.match(correctionMigration, /'final_amount_updated:' \|\| p_sales_order_id::text \|\| ':' \|\| gen_random_uuid\(\)::text/);
assert.match(emailMigration, /CONSTRAINT transactional_email_jobs_notification_key UNIQUE \(notification_id\)/);
assert.match(correctionMigration, /INSERT INTO public\.transactional_email_jobs \(notification_id, recipient_user_id\)[\s\S]*?ON CONFLICT \(notification_id\) DO NOTHING/);
assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY|ALTER TABLE public\.notifications.*NO FORCE ROW LEVEL SECURITY/is);

const rows = [];
const insert = ({ type, dedupeKey }) => {
  if (rows.some((row) => row.dedupeKey === dedupeKey)) return false;
  if (type !== 'final_amount_updated' && rows.some((row) => row.type === type)) {
    throw new Error(`one-per-order notification duplicated: ${type}`);
  }
  rows.push({ type, dedupeKey });
  return true;
};

assert.equal(insert({ type: 'final_amount_updated', dedupeKey: 'final_amount_updated:order:correction-1' }), true, 'first genuine correction inserts');
assert.equal(insert({ type: 'final_amount_updated', dedupeKey: 'final_amount_updated:order:correction-2' }), true, 'second genuine correction inserts a distinct notification/job');
assert.equal(insert({ type: 'final_amount_updated', dedupeKey: 'final_amount_updated:order:correction-2' }), false, 'replayed/no-op correction inserts nothing');
assert.equal(insert({ type: 'price_finalised', dedupeKey: 'price_finalised:order' }), true, 'first protected event inserts');
assert.throws(() => insert({ type: 'price_finalised', dedupeKey: 'price_finalised:order:duplicate' }), /one-per-order notification duplicated/, 'protected event remains one per order');

console.log('Repeatable final-amount notification checks passed (distinct corrections, no-op idempotency, legacy one-per-order events, and notification-scoped email jobs).');
