import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20261015000000_update_dispatched_supplier_tracking_url.sql'),
  'utf8',
);
const failures = [];

for (const token of [
  'CREATE OR REPLACE FUNCTION public.admin_update_canonical_supplier_delivery_batch_tracking_url',
  'IF NOT public.is_admin() THEN',
  "v_tracking_url NOT LIKE 'https://%'",
  "IF v_status <> 'dispatched' THEN",
  'tracking_url = v_tracking_url',
  'updated_at = now()',
  'REVOKE EXECUTE',
  'GRANT EXECUTE',
]) {
  if (!migration.includes(token)) failures.push(`missing required safeguard: ${token}`);
}

if (/SET\s+(?:status|dispatched_at|dispatched_by|arrived_hub_at|arrived_hub_by|transport_provider|booking_reference)\s*=/i.test(migration)) {
  failures.push('tracking update must not alter lifecycle, transport, or booking fields');
}

if (failures.length) {
  console.error('Canonical supplier tracking update checks failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Canonical supplier tracking update checks passed (admin-only, HTTPS, dispatched-only, lifecycle preserved).');
