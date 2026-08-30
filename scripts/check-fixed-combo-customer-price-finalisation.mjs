import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isPriceFinalAtCheckout } from '../src/lib/checkoutPricing.ts';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const migration = read('supabase/migrations/20261027000000_align_fixed_combo_customer_price_finalisation.sql');
const previewGuard = read('supabase/migrations/20261021000000_checkout_fixed_price_payment_preview.sql');
const receiptStaging = read('supabase/migrations/20261022000000_checkout_payment_receipt_staging.sql');
const correction = read('supabase/migrations/20261123000000_allow_pre_payment_weight_corrections.sql');
const comboSchema = read('supabase/migrations/20260903000000_phase1_versioned_catalog_and_preparation.sql');
const placement = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.place_sales_order('));
const failures = [];

const base = { productId: 'p', name: 'Item', image: '', price: 10, unit: 'unit', quantity: 1 };
const chicken = { ...base, productId: 'chicken', orderingMode: 'fixed_quantity', pricingType: 'fixed' };
const selar = { ...base, productId: 'selar', orderingMode: 'weight_only', pricingType: 'per_kg', estimatedWeight: 1 };
const udang = { ...base, productId: 'udang', orderingMode: 'weight_only', pricingType: 'per_kg', estimatedWeight: 0.5 };
const siakap = { ...base, productId: 'siakap', orderingMode: 'whole_fish_by_weight', pricingType: 'per_kg', quantity: 1 };
const fixedCombo = { ...base, productId: 'combo', comboId: 'combo-55', isCombo: true, price: 55, orderingMode: 'combo', comboItems: [chicken, selar, udang, siakap] };
const choiceCombo = { ...fixedCombo, comboItems: [chicken, { ...selar, choiceGroupKey: 'fish', comboItemId: 'selar-choice', priceAdjustment: 5 }, udang, siakap] };

for (const [label, items, expected] of [
  ['fixed combo with weighted operational components', [fixedCombo], true],
  ['fixed combo with known Customer Choice adjustment', [choiceCombo], true],
  ['standalone variable-weight fish', [selar], false],
  ['mixed fixed combo and variable standalone', [fixedCombo, selar], false],
]) {
  const actual = isPriceFinalAtCheckout(items);
  if (actual !== expected) failures.push(`${label}: expected ${expected}, got ${actual}`);
}

for (const token of [
  "v_line_requires_finalisation := v_ordering_mode IN ('whole_fish_by_weight', 'weight_only', 'slice')",
  'v_line_requires_finalisation := false',
  'IF NOT v_combo_requires_finalisation THEN',
  "v_price_status := 'final'",
  'phase4b2_materialize_component_preparation_units',
]) if (!migration.includes(token)) failures.push(`missing regression safeguard: ${token}`);

for (const token of [
  'selling_price numeric(12,2) NOT NULL',
  'CREATE TABLE public.combo_versions',
]) if (!comboSchema.includes(token)) failures.push(`fixed combo schema contract changed: ${token}`);
if (/combo_versions[\s\S]{0,1000}(pricing_mode|ordering_mode)/.test(comboSchema)) {
  failures.push('combo versions unexpectedly acquired a variable customer-pricing mode');
}

if (/IF v_combo_requires_finalisation THEN\s+v_order_requires_finalisation := true;/.test(placement)) {
  failures.push('weighted combo components still leak operational finalisation into customer-price finality');
}
if (!migration.includes('v_component_product_version.ordering_mode, v_component_estimated_weight')) {
  failures.push('standalone component mode is no longer retained for separate supplier-cost tracking');
}
if (!correction.includes("AND ordering_mode IN ('weight_only', 'slice', 'whole_fish_by_weight')")) {
  failures.push('standalone weighted lines no longer retain correction/finalisation semantics');
}
if (!correction.includes('IF v_previous_final_total IS DISTINCT FROM v_final_total THEN')) {
  failures.push('unchanged combo component cost could emit final_amount_updated');
}
if (!correction.includes("AND l.item_kind = 'combo'")) {
  failures.push('combo component weights are no longer isolated to aggregate supplier cost');
}
if (!previewGuard.includes("round(v_result.final_total, 2) <> round(p_expected_final_total, 2)")) {
  failures.push('exact staged-payment amount guard changed');
}
if (!previewGuard.includes('v_result.requires_supplier_finalisation')) {
  failures.push('authoritative guarded-placement finality check was bypassed');
}
for (const token of [
  'consumed_sales_order_id = v_result.sales_order_id',
  'ON CONFLICT (customer_id, idempotency_key) DO UPDATE SET',
]) if (!receiptStaging.includes(token)) failures.push(`missing staged receipt/idempotency safeguard: ${token}`);

if (failures.length) {
  console.error('Fixed combo customer-price finalisation checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Fixed combo finalisation checks passed (customer-line parity, weighted component operations, Customer Choice, mixed-cart defer, staged receipt, and idempotency).');
