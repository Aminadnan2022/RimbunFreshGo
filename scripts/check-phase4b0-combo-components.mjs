import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const componentMigration = read('supabase/migrations/20260917750000_phase4b0_combo_order_components.sql');
const placeOrder = read('supabase/migrations/20260918000000_phase4b1_place_sales_order.sql');
const failures = [];

// A. Combo with chicken + fish: component table must freeze product identity
// independently of the parent commercial line (no revenue fields on component).
for (const token of ['CREATE TABLE public.sales_order_line_components', 'product_id text NOT NULL', 'product_version_id uuid NOT NULL']) {
  if (!componentMigration.includes(token)) failures.push(`missing component identity column: ${token}`);
}
const componentTableDdl = componentMigration.slice(
  componentMigration.indexOf('CREATE TABLE public.sales_order_line_components'),
  componentMigration.indexOf('CREATE INDEX sales_order_line_components_line_idx'),
);
if (/\bunit_selling_price\b|\bline_total\b/.test(componentTableDdl)) {
  failures.push('sales_order_line_components must not carry parent revenue fields (unit_selling_price/line_total)');
}

// B/C. Preparation on chicken and fish components: answers table must gain
// component-scoped nullable columns without removing existing scopes.
for (const token of [
  'ADD COLUMN sales_order_line_component_id',
  'ADD COLUMN sales_order_line_component_unit_id',
  'sales_order_preparation_answers_scope_exclusive_check',
]) {
  if (!componentMigration.includes(token)) failures.push(`missing preparation-answer scope extension: ${token}`);
}

// D. Multiple fish units inside a combo component.
if (!componentMigration.includes('CREATE TABLE public.sales_order_line_component_units')) {
  failures.push('missing sales_order_line_component_units table for per-fish combo components');
}

// E. Historical combo version lineage: components reference the immutable
// combo_version_item, not a live combo_items row.
if (!componentMigration.includes('combo_version_item_id uuid NOT NULL REFERENCES public.combo_version_items(id)')) {
  failures.push('sales_order_line_components must freeze combo_version_item_id, not live combo_items');
}

// F. Component supplier cost frozen fields.
for (const token of ['unit_cost_price', 'estimated_supplier_cost', 'final_supplier_cost', 'supplier_id']) {
  if (!componentMigration.includes(token)) failures.push(`missing component cost field: ${token}`);
}

// G. Parent combo revenue unchanged: place_sales_order must still price the
// combo line from combo_versions.selling_price, not from component costs.
if (!placeOrder.includes('v_unit_selling_price := v_combo_version.selling_price;')) {
  failures.push('parent combo line revenue must remain combo_versions.selling_price');
}

// H. Answers cannot target the wrong component/unit: exclusivity + FK-scoped
// lookups (not client-trusted ids) must be present.
if (!componentMigration.includes('v_component.sales_order_line_id <> NEW.sales_order_line_id')) {
  failures.push('preparation validation trigger must verify component belongs to the referenced line');
}
if (!placeOrder.includes('WHERE c.sales_order_line_id = v_line_ids[v_answer_line] AND c.component_number = v_answer_component')) {
  failures.push('place_sales_order must resolve components by server-side lookup, not client-supplied ids');
}

// Immutability: only actual_weight_kg / final_supplier_cost / finalised_at
// may change on components, and only under price_finalisation.
if (!componentMigration.includes("TG_TABLE_NAME = 'sales_order_line_components' AND v_operation = 'price_finalisation'")) {
  failures.push('missing operation-scoped immutability guard for sales_order_line_components');
}
if (!componentMigration.includes("TG_TABLE_NAME = 'sales_order_line_component_units' AND v_operation = 'price_finalisation'")) {
  failures.push('missing operation-scoped immutability guard for sales_order_line_component_units');
}

if (failures.length) {
  console.error('Phase 4B.0 combo component checks failed:');
  failures.forEach((x) => console.error(`- ${x}`));
  process.exit(1);
}
console.log('Phase 4B.0 combo component checks passed (component identity, preparation scope, cost freeze, lineage, immutability).');
