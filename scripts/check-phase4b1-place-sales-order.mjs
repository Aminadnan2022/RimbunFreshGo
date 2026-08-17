import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const migration = read('supabase/migrations/20260918000000_phase4b1_place_sales_order.sql');
const failures = [];

// A. Atomicity / no partial writes: single function body, no intermediate COMMIT.
if (migration.includes('COMMIT;')) failures.push('migration must not COMMIT mid-transaction inside place_sales_order');
if (!migration.includes('CREATE OR REPLACE FUNCTION public.place_sales_order(')) failures.push('missing place_sales_order RPC');
if (!migration.includes('SECURITY DEFINER')) failures.push('place_sales_order must be SECURITY DEFINER');
if (!migration.includes("SET search_path = public, pg_temp")) failures.push('missing safe search_path');

// B. Anti-spoof: customer identity only from auth.uid(), no customer_id param.
if (!migration.includes('v_customer_id uuid := auth.uid()')) failures.push('customer identity must come from auth.uid(), not client input');
if (migration.includes('p_customer_id')) failures.push('place_sales_order must not accept a client-supplied customer id');
if (migration.includes('p_payment_status') || migration.includes('p_price_status')) failures.push('place_sales_order must not accept client-supplied payment/price status');

// C. Money resolved server-side, never trusted from client.
for (const token of [
  'FROM public.selling_price_history',
  'FROM public.supplier_price_history',
  'FROM public.product_versions',
  'FROM public.combo_versions',
  'FROM public.delivery_method_versions',
]) {
  if (!migration.includes(token)) failures.push(`missing canonical resolution: ${token}`);
}
if (migration.includes("(v_item ->> 'unit_selling_price')") || migration.includes("(v_item ->> 'price')")) {
  failures.push('place_sales_order must not read a client-supplied selling price');
}
if (migration.includes("(p_delivery_request ->> 'fee'") || migration.includes("(p_delivery_request ->> 'delivery_fee'")) {
  failures.push('place_sales_order must not read a client-supplied delivery fee');
}

// D. Required-question / atomic rollback safeguards.
for (const token of ['RAISE EXCEPTION', 'required preparation answer', 'required per-unit preparation answer']) {
  if (!migration.includes(token)) failures.push(`missing validation safeguard: ${token}`);
}

// E. Physical units only for whole_fish_by_weight.
if (!migration.includes("v_ordering_mode = 'whole_fish_by_weight'")) failures.push('physical units must be scoped to whole_fish_by_weight only');

// F. Mixed-cart / finalisation semantics.
if (!migration.includes("v_ordering_mode IN ('whole_fish_by_weight', 'weight_only', 'slice')")) {
  failures.push("missing requires-finalisation ordering-mode check");
}
if (!migration.includes('v_order_requires_finalisation := true')) failures.push('missing order-level requires_supplier_finalisation propagation');

// G. Legacy Orders must not be touched (actual SQL usage, not prose comments).
if (/\b(FROM|INTO|UPDATE|JOIN)\s+"?public"?\."?Orders"?\b/i.test(migration) || migration.includes("from('Orders')")) {
  failures.push('place_sales_order must not read/write legacy public."Orders"');
}

// H. Privilege boundary: PUBLIC revoked, authenticated granted.
if (!migration.includes('REVOKE EXECUTE ON FUNCTION public.place_sales_order(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;')) {
  failures.push('missing REVOKE EXECUTE FROM PUBLIC on place_sales_order');
}
if (!migration.includes('GRANT EXECUTE ON FUNCTION public.place_sales_order(jsonb, jsonb, jsonb, jsonb) TO authenticated;')) {
  failures.push('missing GRANT EXECUTE TO authenticated on place_sales_order');
}

// I. Combo components must be created, priced, and preparation-capable —
// not silently ignored.
for (const token of [
  'sales_order_line_components',
  'combo_version_items',
  'component_number',
  'sales_order_line_component_units',
]) {
  if (!migration.includes(token)) failures.push(`missing combo component handling: ${token}`);
}

if (failures.length) {
  console.error('Phase 4B.1 place_sales_order checks failed:');
  failures.forEach((x) => console.error(`- ${x}`));
  process.exit(1);
}
console.log('Phase 4B.1 place_sales_order checks passed (atomicity, anti-spoof, canonical price/version resolution, and legacy isolation).');
