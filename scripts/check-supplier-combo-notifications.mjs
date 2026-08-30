import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  'supabase/migrations/20261126000000_combo_supplier_notifications.sql',
  'utf8',
);
const notificationFoundation = await readFile(
  'supabase/migrations/20261104000000_notification_phase1.sql',
  'utf8',
);
const webPushFoundation = await readFile(
  'supabase/migrations/20261113000000_web_push_foundation.sql',
  'utf8',
);
const emailFoundation = await readFile(
  'supabase/migrations/20261114000000_transactional_email_foundation.sql',
  'utf8',
);

for (const marker of [
  'SELECT DISTINCT su.user_id',
  'FROM public.sales_order_lines l',
  'JOIN public.sales_order_line_components c',
  'ON c.sales_order_line_id = l.id',
  'owned_supplier.supplier_id = su.supplier_id',
  'WHERE su.active',
  'AFTER UPDATE OF requires_supplier_finalisation ON public.sales_orders',
  'OLD.requires_supplier_finalisation IS DISTINCT FROM true',
  'NEW.requires_supplier_finalisation = true',
  "NEW.status <> 'cancelled'",
]) {
  assert.ok(migration.includes(marker), `Missing combo supplier notification guard: ${marker}`);
}

const finalisationTrigger = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.notification_after_supplier_finalisation_required()'),
  migration.indexOf('DROP TRIGGER IF EXISTS trg_notification_supplier_finalisation_required'),
);
for (const forbiddenInference of [
  'ordering_mode',
  'procurement',
  'actual_weight',
  'estimated_weight',
  'sales_order_line_components',
]) {
  assert.equal(
    finalisationTrigger.includes(forbiddenInference),
    false,
    `Weighing notification must not infer customer-price finalisation from ${forbiddenInference}.`,
  );
}

assert.match(
  migration,
  /SELECT l\.supplier_id[\s\S]*?UNION[\s\S]*?SELECT c\.supplier_id/,
  'Supplier ownership must be the union of direct lines and combo components.',
);
assert.doesNotMatch(
  migration,
  /unit_cost_price|supplier_cost|margin|gross_profit|cost_price|receipt|payment_status/i,
  'Supplier notification repair must not expose financial/payment data.',
);

// Model the SQL recipient rule with representative ownership snapshots. The
// user-level Set mirrors SELECT DISTINCT and the notification dedupe key.
const activeMappings = [
  { supplierId: 101, userId: 'supplier-user-a', active: true },
  { supplierId: 202, userId: 'supplier-user-b', active: true },
  { supplierId: 303, userId: 'unrelated-user', active: true },
  { supplierId: 404, userId: 'inactive-user', active: false },
];

function recipients({ directSupplierIds = [], componentSupplierIds = [] }) {
  const ownedSupplierIds = new Set([...directSupplierIds, ...componentSupplierIds]);
  return [...new Set(
    activeMappings
      .filter((mapping) => mapping.active && ownedSupplierIds.has(mapping.supplierId))
      .map((mapping) => mapping.userId),
  )].sort();
}

function supplierNotifications({
  directSupplierIds = [],
  componentSupplierIds = [],
  requiresSupplierFinalisation = false,
  paymentBecamePaid = false,
  statusBecameCancelled = false,
}) {
  const owners = recipients({ directSupplierIds, componentSupplierIds });
  const events = [];
  if (requiresSupplierFinalisation) events.push('order_requires_weighing');
  if (paymentBecamePaid) events.push('order_paid_ready_to_prepare');
  if (statusBecameCancelled) events.push('order_cancelled');
  return events.flatMap((event) => owners.map((userId) => `${event}:${userId}`));
}

const fixedComboOnly = {
  componentSupplierIds: [101, 101],
  // Components may be operationally weighted, but the fixed combo does not
  // transition the authoritative customer-price finalisation flag.
  requiresSupplierFinalisation: false,
};
assert.deepEqual(
  supplierNotifications(fixedComboOnly),
  [],
  'A fixed-price combo-only order must not emit order_requires_weighing.',
);
assert.deepEqual(
  supplierNotifications({ ...fixedComboOnly, paymentBecamePaid: true }),
  ['order_paid_ready_to_prepare:supplier-user-a'],
  'A paid fixed-price combo must notify its owning supplier exactly once.',
);
assert.deepEqual(
  supplierNotifications({ ...fixedComboOnly, statusBecameCancelled: true }),
  ['order_cancelled:supplier-user-a'],
  'A cancelled combo-only order must notify its owning supplier exactly once.',
);
assert.deepEqual(
  supplierNotifications({ directSupplierIds: [101], requiresSupplierFinalisation: true }),
  ['order_requires_weighing:supplier-user-a'],
  'A standalone weighted direct order must retain one weighing notification.',
);
assert.deepEqual(
  supplierNotifications({
    directSupplierIds: [101],
    componentSupplierIds: [101, 202, 202],
    requiresSupplierFinalisation: true,
  }),
  [
    'order_requires_weighing:supplier-user-a',
    'order_requires_weighing:supplier-user-b',
  ],
  'Existing order-wide weighing semantics must include every active owner on a mixed order, once each.',
);
assert.deepEqual(
  supplierNotifications({ componentSupplierIds: [101, 202, 202], paymentBecamePaid: true }),
  [
    'order_paid_ready_to_prepare:supplier-user-a',
    'order_paid_ready_to_prepare:supplier-user-b',
  ],
  'A paid two-supplier combo must notify each owning supplier once.',
);
assert.deepEqual(
  supplierNotifications({ componentSupplierIds: [101, 202, 202], statusBecameCancelled: true }),
  ['order_cancelled:supplier-user-a', 'order_cancelled:supplier-user-b'],
  'A cancelled two-supplier combo must notify each owning supplier once.',
);
assert.deepEqual(
  supplierNotifications({ componentSupplierIds: [404], paymentBecamePaid: true }),
  [],
  'Inactive supplier mappings must receive no supplier events.',
);

assert.deepEqual(
  recipients({ componentSupplierIds: [101] }),
  ['supplier-user-a'],
  'Combo-only owner must receive the supplier notification.',
);
assert.deepEqual(
  recipients({ directSupplierIds: [101], componentSupplierIds: [101, 101] }),
  ['supplier-user-a'],
  'One supplier owning direct and combo work must receive one notification.',
);
assert.deepEqual(
  recipients({ componentSupplierIds: [101, 202, 202] }),
  ['supplier-user-a', 'supplier-user-b'],
  'Each supplier in a multi-supplier combo must receive one notification.',
);
assert.equal(
  recipients({ componentSupplierIds: [101, 202] }).includes('unrelated-user'),
  false,
  'An unrelated supplier must receive no notification.',
);
assert.deepEqual(
  recipients({ directSupplierIds: [202] }),
  ['supplier-user-b'],
  'Existing direct-line supplier notification behavior must remain unchanged.',
);
assert.equal(
  recipients({ componentSupplierIds: [404] }).includes('inactive-user'),
  false,
  'Inactive supplier-user mappings must not receive notifications.',
);

// The existing per-user notification key remains the single idempotency root.
const dedupeExpression = "p_event_type || ':' || p_sales_order_id::text || ':' || r.user_id::text || ':' || p_key_suffix";
assert.ok(migration.includes(dedupeExpression), 'Existing per-user notification dedupe key changed.');
assert.ok(notificationFoundation.includes('ON CONFLICT (dedupe_key) DO NOTHING'));
assert.ok(webPushFoundation.includes('UNIQUE (notification_id, subscription_id)'));
assert.ok(webPushFoundation.includes('ON CONFLICT (notification_id, subscription_id) DO NOTHING'));
assert.ok(emailFoundation.includes('CONSTRAINT transactional_email_jobs_notification_key UNIQUE (notification_id)'));
assert.ok(emailFoundation.includes("NEW.recipient_role = 'customer'"), 'Supplier notifications must not enqueue transactional customer email.');

console.log('Supplier combo notification regression coverage passed.');
