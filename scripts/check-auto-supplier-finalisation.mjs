import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20261012000000_auto_finalize_supplier_weighed_orders.sql'),
  'utf8',
);
const failures = [];

for (const token of [
  'CREATE OR REPLACE FUNCTION public.phase4c6_finalize_if_measurements_complete',
  'CREATE OR REPLACE FUNCTION public.record_sales_order_line_unit_actual_weight',
  'PERFORM public.phase4c6_finalize_if_measurements_complete(v_line.sales_order_id);',
  "v_line.ordering_mode <> 'whole_fish_by_weight'",
  'v_order.price_status = \'final\' THEN RETURN;',
  'round(v_line.unit_selling_price * v_actual_weight, 2)',
  'round(v_component.unit_cost_price * v_actual_weight, 2)',
  "SET price_status = 'final'",
  'JOIN public.supplier_users su ON su.supplier_id = l.supplier_id',
  'JOIN public.supplier_users su ON su.supplier_id = c.supplier_id',
]) {
  if (!migration.includes(token)) failures.push(`missing required safeguard: ${token}`);
}

if (/supplier_price_history|selling_price_history|FROM\s+public\."Product"/i.test(migration)) {
  failures.push('finalisation must use frozen checkout snapshots, not current catalog prices');
}

if (!migration.includes("v_unit_present < v_unit_count")) {
  failures.push('whole-fish finalisation must reject a missing physical-unit weight');
}

if (failures.length) {
  console.error('Automatic supplier finalisation checks failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Automatic supplier finalisation checks passed (complete measurements, frozen rates, ownership, and canonical final totals).');
