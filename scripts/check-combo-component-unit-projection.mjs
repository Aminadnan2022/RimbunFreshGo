import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const failures = [];
const migration = read('supabase/migrations/20261026000000_fix_customer_choice_component_unit_projection.sql');
const physicalUnits = read('supabase/migrations/20260920000000_phase4b2_preparation_physical_units.sql');
const idempotency = read('supabase/migrations/20261016000000_canonical_checkout_idempotency.sql');
const staging = read('supabase/migrations/20261022000000_checkout_payment_receipt_staging.sql');

for (const token of [
  'CREATE OR REPLACE FUNCTION public.place_sales_order_unkeyed_internal(',
  "ci.choice_group_key IS NULL",
  "selected->>'combo_item_id' = ci.id::text",
  "selected->>'combo_item_id' = ci.source_combo_item_id::text",
  'row_number() OVER (ORDER BY selected_items.display_order)::integer',
  'v_combo_item.projected_component_number',
  'RETURNING id INTO v_component_id',
  'IF v_component_id IS NULL THEN',
]) if (!migration.includes(token)) failures.push(`missing deterministic projection safeguard: ${token}`);

const canonicalPlacement = migration.split('CREATE OR REPLACE FUNCTION public.phase4b2_materialize_component_preparation_units()')[0];
if (canonicalPlacement.includes('INSERT INTO public.sales_order_line_component_units')) {
  failures.push('canonical placement still creates component units before the AFTER INSERT materializer owns the resolved component PK');
}
if (!physicalUnits.includes('AFTER INSERT ON public.sales_order_line_components')) {
  failures.push('component physical-unit AFTER INSERT trigger is missing');
}
for (const token of [
  'NEW.id,',
  "v_version.ordering_mode <> 'whole_fish_by_weight'",
  'phase4b2_has_physical_unit_preparation(v_version.preparation_schema_version_id)',
  'ON CONFLICT (sales_order_line_component_id, unit_number) DO NOTHING',
]) if (!migration.includes(token)) failures.push(`physical-unit materializer invariant missing: ${token}`);

// Manual regression recipe: fixed Chicken, selected Selar 1kg, fixed Udang
// 0.5kg, fixed Siakap per piece, plus one unselected Customer Choice option.
const recipe = [
  { id: 'chicken-v1', order: 0, group: null, physical: true },
  { id: 'tenggiri-v1', source: 'tenggiri-live', order: 1, group: 'fish', physical: true },
  { id: 'selar-v1', source: 'selar-live', order: 2, group: 'fish', physical: true },
  { id: 'udang-v1', order: 3, group: null, physical: false },
  { id: 'siakap-v1', order: 4, group: null, physical: true },
];
const selections = [{ choice_group_key: 'fish', combo_item_id: 'selar-v1' }];
const projected = recipe
  .filter((item) => item.group === null || selections.some((selected) =>
    selected.choice_group_key === item.group &&
    (selected.combo_item_id === item.id || selected.combo_item_id === item.source)))
  .sort((a, b) => a.order - b.order)
  .map((item, index) => ({ ...item, componentNumber: index + 1, componentId: `component-${index + 1}` }));
const units = projected.filter((item) => item.physical).map((item) => ({
  salesOrderLineComponentId: item.componentId,
  componentNumber: item.componentNumber,
  unitNumber: 1,
}));
const answers = units.map((unit) => ({
  componentId: projected.find((item) => item.componentNumber === unit.componentNumber)?.componentId,
  unitId: `${unit.salesOrderLineComponentId}-unit-${unit.unitNumber}`,
}));

if (projected.some((item) => !item.componentId)) failures.push('projected component has a null id');
if (units.some((unit) => !unit.salesOrderLineComponentId)) failures.push('physical unit has a null component FK');
if (projected.map((item) => item.id).join(',') !== 'chicken-v1,selar-v1,udang-v1,siakap-v1') {
  failures.push('fixed plus selected-only Customer Choice projection is incorrect');
}
if (projected.some((item) => item.id === 'tenggiri-v1')) failures.push('unselected alternative was projected');
if (answers.some((answer) => !answer.componentId || !answer.unitId)) failures.push('preparation answer did not resolve to the projected component/unit');

for (const token of ['pg_advisory_xact_lock', 'INSERT INTO public.sales_order_checkout_idempotency', 'IF FOUND THEN']) {
  if (!idempotency.includes(token)) failures.push(`idempotent retry/atomic rollback safeguard missing: ${token}`);
}
for (const token of ['FROM public.place_sales_order(', 'consumed_sales_order_id', 'INSERT INTO public.sales_order_payment_receipts']) {
  if (!staging.includes(token)) failures.push(`staged receipt transaction safeguard missing: ${token}`);
}

if (failures.length) {
  console.error(`Combo component-unit projection checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Combo component-unit projection checks passed (manual recipe, selected-only dense projection, resolved component/unit ids, preparation mapping, atomic rollback, staged receipt, and idempotent retry).');
