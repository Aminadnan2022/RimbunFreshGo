import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const migration = read('supabase/migrations/20260917900000_phase4b0_combo_component_finalisation.sql');
const placeOrder = read('supabase/migrations/20260918000000_phase4b1_place_sales_order.sql');
const automaticFinalisation = read('supabase/migrations/20261012000000_auto_finalize_supplier_weighed_orders.sql');
const failures = [];

// A/B/C/D. Component ordering-mode cost formulas must exist and use frozen rates.
for (const token of [
  "v_component.ordering_mode = 'whole_fish_by_weight'",
  'round(v_component.unit_cost_price * v_actual_weight, 2)',
  'sum(actual_weight_kg)',
]) {
  if (!migration.includes(token)) failures.push(`missing combo component cost calculation: ${token}`);
}

// E. Frozen cost rates only — must never read Product/current price/cost.
if (/FROM\s+public\."Product"|selling_price_history|supplier_price_history/i.test(migration)) {
  failures.push('finalisation must use frozen unit_cost_price/unit_selling_price only, not re-query current price/cost tables');
}

// F. Parent combo revenue unchanged: line_total is only updated for normal
// lines, never derived from component sums.
if (/UPDATE public\.sales_order_lines[\s\S]{0,200}line_total = v_combo_cost_sum/.test(migration)) {
  failures.push('combo parent line_total must never be set from component cost sum');
}
if (!migration.includes('SET final_supplier_cost = v_combo_cost_sum WHERE id = v_line.id')) {
  failures.push('combo parent must roll up final_supplier_cost (not revenue) from components');
}

// G. Mixed order: both normal-line and component finalisation loops present
// in the same atomic function (single transaction, no partial finalisation).
for (const token of ['FOR v_line IN', 'FOR v_component IN', "RAISE EXCEPTION 'Order pricing is already final."]) {
  if (!migration.includes(token)) failures.push(`missing mixed-order finalisation step: ${token}`);
}

// H. Missing weight aborts (no default/guess value).
for (const token of ['missing actual weight for one or more physical units', 'missing actual weight.']) {
  if (!migration.includes(token)) failures.push(`missing abort-on-missing-weight safeguard: ${token}`);
}

// I. Finalisation terminal: entry RPCs reject once already finalised, and the
// calculation RPC refuses to re-run once price_status is final.
for (const token of [
  'This line is already finalised.',
  'This component is already finalised.',
  "IF v_order.price_status = 'final' THEN RAISE EXCEPTION 'Order pricing is already final.'",
]) {
  if (!migration.includes(token)) failures.push(`missing terminal-state safeguard: ${token}`);
}

// J. Supplier A cannot alter Supplier B's fulfilment: every recording RPC must
// check ownership via supplier_users before allowing a write.
for (const token of [
  'is_supplier_for_sales_order_line(p_sales_order_line_id)',
  'is_supplier_for_sales_order_line(v_line.id)',
  'is_supplier_for_sales_order_line_component(p_sales_order_line_component_id)',
  'is_supplier_for_sales_order_line_component(v_component.id)',
]) {
  if (!migration.includes(token)) failures.push(`missing supplier ownership check: ${token}`);
}
if (!migration.includes('JOIN public.supplier_users su ON su.supplier_id = l.supplier_id')) {
  failures.push('missing supplier_users-based line ownership resolution');
}
if (!migration.includes('JOIN public.supplier_users su ON su.supplier_id = c.supplier_id')) {
  failures.push('missing supplier_users-based component ownership resolution');
}

// The old order-wide weight-accepting signature must be gone. The later
// automatic-finalisation migration deliberately allows an owning supplier to
// finish an order after the final measurement, while retaining the admin path.
if (!migration.includes('DROP FUNCTION IF EXISTS public.finalize_sales_order_pricing(uuid, jsonb, jsonb);')) {
  failures.push('old finalize_sales_order_pricing(uuid, jsonb, jsonb) must be dropped');
}
if (!automaticFinalisation.includes('IF NOT public.is_admin() AND NOT EXISTS (')) {
  failures.push('automatic finalisation must retain admin access and require supplier ownership');
}
if (!automaticFinalisation.includes("JOIN public.supplier_users su ON su.supplier_id = l.supplier_id")) {
  failures.push('automatic finalisation must resolve supplier ownership through supplier_users');
}

// place_sales_order must gate order-level price_status on combo component
// finalisation too, not only normal product lines.
if (!/IF v_combo_requires_finalisation THEN\s+v_order_requires_finalisation := true;/.test(placeOrder)) {
  failures.push('place_sales_order must propagate combo component finalisation requirement to order level');
}

if (failures.length) {
  console.error('Phase 4B.0 combo finalisation checks failed:');
  failures.forEach((x) => console.error(`- ${x}`));
  process.exit(1);
}
console.log('Phase 4B.0 combo finalisation checks passed (component cost formulas, frozen rates, parent revenue isolation, atomic mixed-order finalisation, terminal state, supplier isolation).');
