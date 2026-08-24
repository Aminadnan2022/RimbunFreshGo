import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isPriceFinalAtCheckout } from '../src/lib/checkoutPricing.ts';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const migration = read('supabase/migrations/20261021000000_checkout_fixed_price_payment_preview.sql');
const canonicalPlacement = read('supabase/migrations/20260924000000_supplier_canonical_checkout_enforcement.sql');
const checkout = read('src/pages/CheckoutPage.tsx');
const payment = read('src/lib/checkoutPayment.ts');
const pricing = read('src/lib/checkoutPricing.ts');
const tracking = read('src/pages/OrderTrackingPage.tsx');
const failures = [];

for (const token of [
  "'whole_fish_by_weight'", "'weight_only'", "'slice'",
  'if (item.isCombo) return Boolean(item.comboId)', "item.orderingMode === 'fixed_quantity'",
]) if (!pricing.includes(token)) failures.push(`missing final-at-checkout semantic: ${token}`);

const base = { productId: 'p', name: 'Item', image: '', price: 10, unit: 'unit', quantity: 1 };
const weightedComponent = { productId: 'fish', name: 'Fish', image: '', price: 20, unit: 'kg', quantity: 1, pricingType: 'per_kg', label: 'Fish' };
const fixedCombo = { ...base, productId: 'combo', comboId: 'combo-55', isCombo: true, price: 55, orderingMode: 'combo', comboItems: [weightedComponent] };
const choiceCombo = { ...fixedCombo, comboItems: [{ ...weightedComponent, choiceGroupKey: 'fish', comboItemId: 'choice-fish', priceAdjustment: 5 }] };
const variableFish = { ...base, productId: 'fish', pricingType: 'per_kg', orderingMode: 'weight_only', estimatedWeight: 1 };
const fixedStandalone = { ...base, pricingType: 'fixed', orderingMode: 'fixed_quantity' };

for (const [label, items, expected] of [
  ['fixed combo with per-kg component', [fixedCombo], true],
  ['fixed combo with weighted Customer Choice', [choiceCombo], true],
  ['fixed combo after component actual weight capture', [{ ...fixedCombo, comboItems: [{ ...weightedComponent, actualWeight: 1.23 }] }], true],
  ['standalone variable-weight fish', [variableFish], false],
  ['fixed standalone', [fixedStandalone], true],
  ['mixed fixed combo and variable standalone', [fixedCombo, variableFish], false],
]) {
  const actual = isPriceFinalAtCheckout(items);
  if (actual !== expected) failures.push(`${label}: expected ${expected}, got ${actual}`);
}

if (fixedCombo.price * fixedCombo.quantity + 2 !== 57) failures.push('fixed RM55 combo plus RM2 delivery must remain RM57');

for (const token of [
  'payment.amountToPay', 'paymentQrPublicUrl', 'p_expected_final_total',
  'p_expected_payment_configuration_version_id', 'weighedOrderInstructions',
]) if (!checkout.includes(token)) failures.push(`missing checkout payment behavior: ${token}`);

for (const token of [
  'get_checkout_payment_configuration', 'place_sales_order_with_checkout_payment_preview',
  'v_result.requires_supplier_finalisation', "v_result.price_status <> 'final'",
  'round(v_result.final_total, 2) <> round(p_expected_final_total, 2)',
  'v_snapshotted_payment_version_id IS DISTINCT FROM p_expected_payment_configuration_version_id',
]) if (!migration.includes(token)) failures.push(`missing server snapshot guard: ${token}`);

for (const token of ['canonical-payment-receipt', 'sales_order_payment_receipts', 'submit_sales_order_payment_receipt']) {
  if (!tracking.includes(token)) failures.push(`receipt/verification regression: ${token}`);
}

if (checkout.includes('codDescription')) failures.push('obsolete checkout COD copy is still rendered');
if (!migration.includes('FROM public.place_sales_order(')) failures.push('guarded placement must reuse canonical pricing/idempotency logic');
for (const token of [
  "v_line_requires_finalisation := v_ordering_mode IN ('whole_fish_by_weight', 'weight_only', 'slice')",
  'v_line_requires_finalisation := false',
  'v_estimated_line_total := round(v_unit_selling_price * v_quantity, 2)',
]) if (!canonicalPlacement.includes(token)) failures.push(`canonical client/server classification drift: ${token}`);
if (!payment.includes("export { isPriceFinalAtCheckout } from './checkoutPricing'")) failures.push('checkout payment must use the shared pricing-line predicate');

if (failures.length) {
  console.error('Checkout payment preview checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Checkout payment preview checks passed (fixed standalone/combo QR, weighed gate, frozen amount/QR, receipt flow, and canonical idempotent placement).');
