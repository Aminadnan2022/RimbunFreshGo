import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const registered = readFileSync(resolve(root, 'src/pages/OrderTrackingPage.tsx'), 'utf8');
const guest = readFileSync(resolve(root, 'src/pages/GuestOrderTrackingPage.tsx'), 'utf8');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20261208000002_hide_instant_lalamove_batch_tracking.sql'),
  'utf8',
);

for (const source of [registered, guest]) {
  assert.match(source, /method_code[^\n]*=== 'instant_customer_lalamove'/s);
  assert.match(source, /Lalamove tracking link will appear here after the delivery has been booked/);
}

assert.match(registered, /isInstantLalamove\s*\? \{ data: null, error: null \}\s*: await supabase\.rpc\(\s*'get_sales_order_canonical_delivery_tracking'/s);
assert.match(registered, /isInstantLalamove\s*\? \{ data: null, error: null \}\s*: await supabase\.rpc\(\s*'get_sales_order_canonical_rider_tracking'/s);
assert.match(registered, /stage !== 'supplierDispatch'[\s\S]*stage !== 'arrivedHub'[\s\S]*stage !== 'readyForRider'/);
assert.match(registered, /!isInstantLalamove && riderName/);
assert.match(registered, /lalamoveTrackingUrl: isInstantLalamove\s*\? null/s);

assert.match(guest, /isInstantLalamove\s*\? \['Order received', 'Payment confirmed', 'Preparing'\]/s);
assert.doesNotMatch(
  guest.match(/isInstantLalamove\s*\? \[([^\]]+)\]/s)?.[1] ?? '',
  /Supplier dispatch|FreshGo hub|rider/i,
);

assert.match(migration, /v_order_id := public\.authorize_guest_sales_order/);
assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = public, pg_temp/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_guest_sales_order\(text,text\) FROM PUBLIC, anon/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_guest_sales_order\(text,text\) TO authenticated/);

for (const field of [
  'supplierDispatchStartedAt',
  'supplierDispatchCompletedAt',
  'trackingUrl',
  'readyForRiderAt',
  'deliveryStartedAt',
  'deliveredAt',
  'deliveryStatus',
  'riderName',
  'riderPhone',
  'riderWhatsapp',
]) {
  assert.match(
    migration,
    new RegExp(`'${field}', CASE WHEN o\\.delivery_snapshot ->> 'method_code' = 'instant_customer_lalamove' THEN NULL`),
    `${field} must be null for instant customer Lalamove delivery`,
  );
}

console.log('Lalamove tracking branching checks passed for registered, guest, and guest RPC security/output guards.');
