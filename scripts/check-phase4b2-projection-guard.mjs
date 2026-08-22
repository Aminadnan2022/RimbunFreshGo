import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const migration = read('supabase/migrations/20260919000000_phase4b2_place_order_projection_guard.sql');
const finalisation = read('supabase/migrations/20260917900000_phase4b0_combo_component_finalisation.sql');
const failures = [];

// A/E. place_sales_order activates order_creation for its controlled updates,
// and clears it immediately after (no leak into later statements).
const placeOrderBody = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.place_sales_order('));
const orderCreationSets = placeOrderBody.match(/set_config\('freshgo\.canonical_operation', 'order_creation', true\)/g) ?? [];
const orderCreationClears = placeOrderBody.match(/set_config\('freshgo\.canonical_operation', '', true\)/g) ?? [];
if (orderCreationSets.length !== 2) failures.push(`expected exactly 2 order_creation activations in place_sales_order, found ${orderCreationSets.length}`);
if (orderCreationClears.length !== 2) failures.push(`expected exactly 2 canonical_operation clears in place_sales_order, found ${orderCreationClears.length}`);

// B. place_sales_order must no longer use price_finalisation for its own
// creation-time projection updates.
if (placeOrderBody.includes("set_config('freshgo.canonical_operation', 'price_finalisation', true)")) {
  failures.push('place_sales_order must not activate price_finalisation for creation-time work');
}

// C/D. Mutation guard must explicitly branch on order_creation, restricted to
// the exact fields place_sales_order actually sets on each table.
for (const token of [
  "TG_TABLE_NAME = 'sales_orders' AND v_operation = 'order_creation'",
  "TG_TABLE_NAME = 'sales_order_lines' AND v_operation = 'order_creation'",
]) {
  if (!migration.includes(token)) failures.push(`missing order_creation guard branch: ${token}`);
}
const ordersOrderCreationBlock = migration.slice(
  migration.indexOf("TG_TABLE_NAME = 'sales_orders' AND v_operation = 'order_creation'"),
  migration.indexOf('RETURN NEW;', migration.indexOf("TG_TABLE_NAME = 'sales_orders' AND v_operation = 'order_creation'")),
);
for (const field of ['requires_supplier_finalisation', 'price_status', 'estimated_subtotal', 'estimated_total', 'final_subtotal', 'final_total', 'price_finalised_at', 'subtotal', 'total']) {
  if (!ordersOrderCreationBlock.includes(field)) failures.push(`order_creation guard missing allowed sales_orders field: ${field}`);
}
if (/payment_status|paid_at|paid_by/.test(ordersOrderCreationBlock)) {
  failures.push('order_creation guard must not exempt payment_status/paid_at/paid_by on sales_orders');
}
const linesOrderCreationBlock = migration.slice(
  migration.indexOf("TG_TABLE_NAME = 'sales_order_lines' AND v_operation = 'order_creation'"),
  migration.indexOf('RETURN NEW;', migration.indexOf("TG_TABLE_NAME = 'sales_order_lines' AND v_operation = 'order_creation'")),
);
if (!linesOrderCreationBlock.includes('final_supplier_cost')) failures.push('order_creation guard must allow sales_order_lines.final_supplier_cost');
if (/unit_selling_price|unit_cost_price|product_version_id|product_snapshot|quantity/.test(linesOrderCreationBlock)) {
  failures.push('order_creation guard must not exempt frozen commercial/lineage fields on sales_order_lines');
}

// F. price_finalisation semantics on sales_order_lines/units/components remain
// unchanged (still present, still restricted to their own field sets).
for (const token of [
  "TG_TABLE_NAME = 'sales_order_lines' AND v_operation = 'price_finalisation'",
  "TG_TABLE_NAME = 'sales_order_line_units' AND v_operation = 'price_finalisation'",
  "TG_TABLE_NAME = 'sales_order_line_components' AND v_operation = 'price_finalisation'",
  "TG_TABLE_NAME = 'sales_order_line_component_units' AND v_operation = 'price_finalisation'",
]) {
  if (!migration.includes(token)) failures.push(`price_finalisation guard branch must remain unchanged: ${token}`);
}

// G. finalize_sales_order_pricing (applied Phase 4A migration) still uses
// price_finalisation exclusively and was not touched by this migration.
if (!finalisation.includes("PERFORM set_config('freshgo.canonical_operation', 'price_finalisation', true);")) {
  failures.push('finalize_sales_order_pricing must still activate price_finalisation');
}
if (migration.includes('DROP FUNCTION IF EXISTS public.finalize_sales_order_pricing')) {
  failures.push('this migration must not touch finalize_sales_order_pricing');
}

// price_status transition guard: estimated -> final allowed under BOTH
// price_finalisation and order_creation; payment_status rules untouched.
const transitionFn = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.phase4a_validate_order_transitions()'),
  migration.indexOf('CREATE OR REPLACE FUNCTION public.place_sales_order('),
);
if (!transitionFn.includes("v_operation IN ('price_finalisation', 'order_creation')")) {
  failures.push('price_status transition guard must accept order_creation for the estimated -> final transition');
}
if (!transitionFn.includes("v_operation = 'receipt_submission'") || !transitionFn.includes("v_operation = 'payment_confirmation'")) {
  failures.push('payment_status transition rules must remain unchanged');
}

// H/I. PUBLIC execution stays revoked; authenticated retains execution.
if (!migration.includes('REVOKE EXECUTE ON FUNCTION public.place_sales_order(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;')) {
  failures.push('missing REVOKE EXECUTE FROM PUBLIC on the corrected place_sales_order');
}
if (!migration.includes('GRANT EXECUTE ON FUNCTION public.place_sales_order(jsonb, jsonb, jsonb, jsonb) TO authenticated;')) {
  failures.push('missing GRANT EXECUTE TO authenticated on the corrected place_sales_order');
}

// J. Frontend RPC signature (name + parameter list + shape) is unchanged, so
// canonicalCheckout.ts does not need to change because of this fix.
if (!/CREATE OR REPLACE FUNCTION public\.place_sales_order\(\s*p_customer_snapshot jsonb,\s*p_delivery_request jsonb,\s*p_items jsonb,\s*p_preparation_answers jsonb DEFAULT '\[\]'::jsonb\s*\)/.test(migration)) {
  failures.push('place_sales_order signature must remain unchanged for the existing frontend contract');
}

if (failures.length) {
  console.error('Phase 4B.2 projection guard checks failed:');
  failures.forEach((x) => console.error(`- ${x}`));
  process.exit(1);
}
console.log('Phase 4B.2 projection guard checks passed (order_creation scoping, price_finalisation isolation, transition guard, privileges, unchanged RPC signature).');
