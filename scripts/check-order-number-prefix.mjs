import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20261031000000_change_new_order_number_prefix_to_fg.sql'),
  'utf8',
);

const failures = [];
for (const token of [
  'CREATE OR REPLACE FUNCTION public.phase4b1_generate_order_number()',
  "SELECT 'FG-'",
  "nextval('public.sales_order_number_seq')",
  "GRANT EXECUTE ON FUNCTION public.phase4b1_generate_order_number() TO authenticated",
]) {
  if (!migration.includes(token)) failures.push(`missing new-order prefix safeguard: ${token}`);
}

if (/UPDATE\s+public\.sales_orders/i.test(migration)) {
  failures.push('migration must not rewrite existing order numbers');
}

if (failures.length) {
  console.error('Order number prefix checks failed:\n- ' + failures.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('Order number prefix checks passed (new orders use FG, the shared sequence remains continuous, and existing order references are untouched).');
}
