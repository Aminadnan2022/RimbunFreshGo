import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, notificationPhase1, correctionMigration, emailMigration, webPushMigration] = await Promise.all([
  readFile('supabase/migrations/20261125000000_allow_repeatable_payment_receipt_rejections.sql', 'utf8'),
  readFile('supabase/migrations/20261104000000_notification_phase1.sql', 'utf8'),
  readFile('supabase/migrations/20261123000000_allow_pre_payment_weight_corrections.sql', 'utf8'),
  readFile('supabase/migrations/20261114000000_transactional_email_foundation.sql', 'utf8'),
  readFile('supabase/migrations/20261113000000_web_push_foundation.sql', 'utf8'),
]);

assert.match(migration, /DROP INDEX IF EXISTS public\.notifications_user_order_type_unique/);
assert.match(
  migration,
  /CREATE UNIQUE INDEX notifications_user_order_type_unique\s+ON public\.notifications \(recipient_user_id, sales_order_id, notification_type\)\s+WHERE recipient_user_id IS NOT NULL\s+AND sales_order_id IS NOT NULL\s+AND notification_type NOT IN \(\s*'final_amount_updated',\s*'payment_receipt_rejected'\s*\)/s,
);
assert.match(notificationPhase1, /CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_unique\s+ON public\.notifications \(dedupe_key\)/s);
assert.match(notificationPhase1, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
assert.match(
  notificationPhase1,
  /'payment_receipt_rejected:' \|\| NEW\.id::text \|\| ':' \|\| NEW\.customer_id::text \|\| ':' \|\| NEW\.receipt_submitted_at::text/,
);
assert.match(correctionMigration, /IF v_previous_final_total IS DISTINCT FROM v_final_total THEN/s);
assert.match(correctionMigration, /'final_amount_updated:' \|\| p_sales_order_id::text \|\| ':' \|\| gen_random_uuid\(\)::text/);
assert.match(emailMigration, /CONSTRAINT transactional_email_jobs_notification_key UNIQUE \(notification_id\)/);
assert.match(correctionMigration, /INSERT INTO public\.transactional_email_jobs \(notification_id, recipient_user_id\)[\s\S]*?ON CONFLICT \(notification_id\) DO NOTHING/);
assert.match(webPushMigration, /CONSTRAINT web_push_delivery_jobs_notification_subscription_key UNIQUE \(notification_id, subscription_id\)/);
assert.match(webPushMigration, /INSERT INTO public\.web_push_delivery_jobs \(notification_id, subscription_id\)[\s\S]*?ON CONFLICT \(notification_id, subscription_id\) DO NOTHING/);
assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY|ALTER TABLE public\.notifications.*NO FORCE ROW LEVEL SECURITY/is);

const repeatableTypes = new Set(['final_amount_updated', 'payment_receipt_rejected']);
const state = { notifications: [], emailJobs: [], webPushJobs: [], paymentStatus: 'receipt_submitted', receipts: new Map() };
let notificationSequence = 0;

const emitNotification = ({ type, dedupeKey }) => {
  const existing = state.notifications.find((row) => row.dedupeKey === dedupeKey);
  if (existing) return { inserted: false, notification: existing };
  if (!repeatableTypes.has(type) && state.notifications.some((row) => row.type === type)) {
    const error = new Error(`duplicate key value violates notifications_user_order_type_unique: ${type}`);
    error.code = '23505';
    throw error;
  }
  const notification = { id: `notification-${++notificationSequence}`, type, dedupeKey };
  state.notifications.push(notification);
  state.emailJobs.push({ notificationId: notification.id });
  state.webPushJobs.push({ notificationId: notification.id, subscriptionId: 'subscription-1' });
  return { inserted: true, notification };
};

const rejectReceipt = ({ receiptId, submittedAt }) => {
  const receipt = state.receipts.get(receiptId);
  if (!receipt || receipt.status !== 'submitted') return { rejected: false, replay: true };
  receipt.status = 'rejected';
  state.paymentStatus = 'rejected';
  const result = emitNotification({
    type: 'payment_receipt_rejected',
    dedupeKey: `payment_receipt_rejected:order:customer:${submittedAt}`,
  });
  return { rejected: true, ...result };
};

state.receipts.set('receipt-1', { status: 'submitted' });
const firstRejection = rejectReceipt({ receiptId: 'receipt-1', submittedAt: '2026-08-29T09:00:00Z' });
assert.equal(firstRejection.inserted, true, 'first receipt rejection emits a notification');
assert.equal(state.emailJobs.length, 1, 'first receipt rejection enqueues one email job');

state.receipts.set('receipt-2', { status: 'submitted' });
assert.doesNotThrow(() => rejectReceipt({ receiptId: 'receipt-2', submittedAt: '2026-08-29T10:00:00Z' }), 'a replacement receipt rejection must not fail with 23505');
const rejectionNotifications = state.notifications.filter((row) => row.type === 'payment_receipt_rejected');
assert.equal(rejectionNotifications.length, 2, 'replacement receipt rejection emits a second notification');
assert.notEqual(rejectionNotifications[0].id, rejectionNotifications[1].id, 'replacement receipt notification is distinct');
assert.equal(state.emailJobs.length, 2, 'replacement receipt rejection enqueues a second notification-scoped email job');
assert.equal(state.webPushJobs.length, 2, 'each distinct notification preserves existing Web Push fan-out');
assert.equal(state.paymentStatus, 'rejected', 'second rejection commits the order payment state instead of rolling the transaction back');
assert.equal(state.receipts.get('receipt-2').status, 'rejected', 'second receipt status commits instead of rolling back');

const replay = rejectReceipt({ receiptId: 'receipt-2', submittedAt: '2026-08-29T10:00:00Z' });
assert.deepEqual(replay, { rejected: false, replay: true }, 'replaying the same rejection produces no new event');
assert.equal(emitNotification({ type: 'payment_receipt_rejected', dedupeKey: rejectionNotifications[1].dedupeKey }).inserted, false, 'same receipt dedupe key cannot spam notifications');
assert.equal(state.emailJobs.length, 2, 'a replay creates no second email job for the same notification');
assert.equal(state.webPushJobs.length, 2, 'a replay creates no second Web Push job for the same notification');

assert.equal(emitNotification({ type: 'final_amount_updated', dedupeKey: 'final_amount_updated:order:correction-1' }).inserted, true, 'first genuine correction inserts');
assert.equal(emitNotification({ type: 'final_amount_updated', dedupeKey: 'final_amount_updated:order:correction-2' }).inserted, true, 'second genuine correction inserts');
assert.equal(emitNotification({ type: 'final_amount_updated', dedupeKey: 'final_amount_updated:order:correction-2' }).inserted, false, 'replayed/no-op correction inserts nothing');
for (const type of ['price_finalised', 'payment_confirmed', 'order_delivered']) {
  assert.equal(emitNotification({ type, dedupeKey: `${type}:order` }).inserted, true, `${type} first event inserts`);
  assert.throws(
    () => emitNotification({ type, dedupeKey: `${type}:order:duplicate` }),
    { code: '23505' },
    `${type} remains one per customer/order/type`,
  );
}

console.log('Repeatable notification checks passed (receipt rejection retry safety, dedupe, email/Web Push uniqueness, final-amount repeatability, protected event uniqueness, and committed second rejection).');
