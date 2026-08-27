import { readFile } from 'node:fs/promises';

const migration = await readFile('supabase/migrations/20261104000000_notification_phase1.sql', 'utf8');
const supplierFinalisationRepair = await readFile('supabase/migrations/20261116000000_prevent_duplicate_price_finalised_fallback.sql', 'utf8');
const client = await readFile('src/data/notifications.ts', 'utf8');
const required = [
  'notifications_dedupe_key_unique', 'notifications_recipient_select', 'notification_prevent_mutation',
  'order_requires_weighing', 'payment_receipt_submitted', 'order_payment_submitted', 'price_finalised',
  'payment_confirmed', 'payment_receipt_rejected', 'order_paid_ready_to_prepare', 'order_ready_for_dispatch',
  'supplier_batch_dispatched', 'supplier_batch_arrived_hub', 'delivery_assigned', 'out_for_delivery',
  'order_delivered', 'order_cancelled', 'canonical_supplier_delivery_batch_orders',
];
for (const item of required) {
  if (!migration.includes(item)) throw new Error(`Notification regression guard missing: ${item}`);
}
if (!migration.includes("NEW.payment_status = 'paid'")) throw new Error('Payment confirmation must be driven by paid state.');
if (!/NEW\.price_status = 'final'\r?\n     AND NEW\.requires_supplier_finalisation/.test(migration)) throw new Error('Deferred finalisation guard missing.');
if (!client.includes(".is('read_at', null)")) throw new Error('Read marking must only update unread rows.');
if (!/CREATE TRIGGER trg_notification_discard_legacy_fallback\r?\nBEFORE INSERT ON public\.notifications/.test(supplierFinalisationRepair)) {
  throw new Error('Legacy fallback notifications must be discarded before uniqueness checks.');
}
if (!supplierFinalisationRepair.includes("NEW.dedupe_key LIKE 'legacy-write:%'")) {
  throw new Error('Supplier finalisation repair must remain scoped to legacy fallback notifications.');
}
console.log('Notification Phase 1 structural regressions passed.');
