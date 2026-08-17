import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const migration = read('supabase/migrations/20260920000000_phase4b2_preparation_physical_units.sql');
const placeOrder = read('supabase/migrations/20260918000000_phase4b1_place_sales_order.sql');
const tests = [];

for (const token of [
  'phase4b2_has_physical_unit_preparation',
  'sales_order_lines_materialize_preparation_units',
  'sales_order_line_components_materialize_preparation_units',
  "selection_scope = 'physical_unit'",
  'NEW.quantity <> trunc(NEW.quantity)',
  'ON CONFLICT (sales_order_line_id, unit_number) DO NOTHING',
  'ON CONFLICT (sales_order_line_component_id, unit_number) DO NOTHING',
]) {
  if (!migration.includes(token)) tests.push(`missing physical-unit safeguard: ${token}`);
}
if (!migration.includes("v_version.ordering_mode = 'whole_fish_by_weight'")) tests.push('whole-fish duplicate protection is missing');
if (!migration.includes('actual_weight_kg, unit_snapshot')) tests.push('actual weight must remain NULL for preparation-only units');
if (!placeOrder.includes("IF v_ordering_mode = 'whole_fish_by_weight' THEN")) tests.push('existing whole-fish unit creation branch was not preserved');
if (migration.includes("SET price_status = 'estimated'") || migration.includes('payment_status')) tests.push('preparation-unit migration must not alter pricing/payment semantics');

for (const token of [
  'record_sales_order_line_unit_actual_weight',
  'record_sales_order_line_component_unit_actual_weight',
  "v_line.ordering_mode <> 'whole_fish_by_weight'",
  "v_component.ordering_mode <> 'whole_fish_by_weight'",
  'Actual unit weight is only allowed for whole_fish_by_weight lines.',
  'Actual component unit weight is only allowed for whole_fish_by_weight components.',
  'is_supplier_for_sales_order_line(v_line.id)',
  'is_supplier_for_sales_order_line_component(v_component.id)',
  'REVOKE EXECUTE ON FUNCTION public.record_sales_order_line_unit_actual_weight(uuid, numeric) FROM PUBLIC',
  'GRANT EXECUTE ON FUNCTION public.record_sales_order_line_unit_actual_weight(uuid, numeric) TO authenticated',
  'REVOKE EXECUTE ON FUNCTION public.record_sales_order_line_component_unit_actual_weight(uuid, numeric) FROM PUBLIC',
  'GRANT EXECUTE ON FUNCTION public.record_sales_order_line_component_unit_actual_weight(uuid, numeric) TO authenticated',
]) {
  if (!migration.includes(token)) tests.push(`missing weight-entry security safeguard: ${token}`);
}

if (tests.length) {
  console.error('Phase 4B.2 preparation physical-unit checks failed:');
  tests.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Phase 4B.2 preparation physical-unit checks passed (fixed preparation units, whole-fish preservation, combo units, quantity validation, and unchanged pricing semantics).');
