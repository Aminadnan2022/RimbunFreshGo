import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(
  import.meta.dirname,
  '../supabase/migrations/20261028000000_qualify_checkout_receipt_placement_identifiers.sql',
), 'utf8');
const failures = [];

for (const token of [
  'CREATE OR REPLACE FUNCTION public.place_sales_order_with_checkout_payment_preview(',
  'FROM public.checkout_payment_receipt_staging AS stage',
  'FROM public.place_sales_order(',
  ') AS placed;',
  'FROM public.sales_orders AS orders',
  'FROM public.sales_order_payment_receipts AS receipts',
  'UPDATE public.sales_orders AS orders',
  "AND orders.payment_status = 'pending'",
  'UPDATE public.checkout_payment_receipt_staging AS stage',
  'stage.consumed_sales_order_id IS NULL',
  "'receipt_submitted'::text",
]) if (!migration.includes(token)) failures.push(`missing qualified active-path safeguard: ${token}`);

for (const risky of [
  /\bAND payment_status\s*=/,
  /\bWHERE id\s*=/,
  /\bAND sales_order_id\s*=/,
  /\bWHERE customer_id\s*=/,
  /\bAND idempotency_key\s*=/,
]) if (risky.test(migration)) failures.push(`unqualified active-path identifier remains: ${risky}`);

if (failures.length) {
  console.error('Checkout placement SQL identifier checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Checkout placement SQL identifier checks passed (guarded placement, staged receipt, payment transition, consumption, and idempotent retry references are qualified).');
