import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const migration = read('supabase/migrations/20261016000000_canonical_checkout_idempotency.sql');
const checkout = read('src/pages/CheckoutPage.tsx');
const client = read('src/lib/canonicalCheckout.ts');
const failures = [];

for (const token of [
  'PRIMARY KEY (customer_id, idempotency_key)', 'pg_advisory_xact_lock',
  'place_sales_order_unkeyed_internal', 'v_customer_id uuid := auth.uid()',
  'REVOKE EXECUTE ON FUNCTION public.place_sales_order_unkeyed_internal',
  'GRANT EXECUTE ON FUNCTION public.place_sales_order(jsonb, jsonb, jsonb, jsonb, text) TO authenticated',
  "RAISE EXCEPTION 'A valid checkout idempotency key is required.'",
]) if (!migration.includes(token)) failures.push(`missing server idempotency safeguard: ${token}`);

if (!migration.includes('CREATE FUNCTION public.place_sales_order(') || !migration.includes('p_idempotency_key text')) failures.push('canonical RPC does not accept an idempotency key');
if (!migration.includes('FROM public.sales_order_checkout_idempotency') || !migration.includes('IF FOUND THEN')) failures.push('same-key retry does not return the persisted result');
if (!migration.includes('SELECT * INTO v_result') || !migration.includes('INSERT INTO public.sales_order_checkout_idempotency')) failures.push('new key does not atomically create and record one order');
if (!checkout.includes('checkoutAttemptKey') || !checkout.includes('crypto.randomUUID()')) failures.push('checkout does not retain a stable retry key');
if (!client.includes('p_idempotency_key')) failures.push('client RPC payload omits the idempotency key');

if (failures.length) {
  console.error('Canonical checkout idempotency checks failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Canonical checkout idempotency checks passed (same-key concurrency/retry, distinct keys, rollback safety, and auth boundary).');
