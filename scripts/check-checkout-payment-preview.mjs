import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const migration = read('supabase/migrations/20261021000000_checkout_fixed_price_payment_preview.sql');
const checkout = read('src/pages/CheckoutPage.tsx');
const payment = read('src/lib/checkoutPayment.ts');
const tracking = read('src/pages/OrderTrackingPage.tsx');
const failures = [];

for (const token of [
  "'whole_fish_by_weight'", "'weight_only'", "'slice'",
  "component.pricingType === 'fixed'", "item.orderingMode === 'fixed_quantity'",
]) if (!payment.includes(token)) failures.push(`missing final-at-checkout semantic: ${token}`);

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

if (failures.length) {
  console.error('Checkout payment preview checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Checkout payment preview checks passed (fixed standalone/combo QR, weighed gate, frozen amount/QR, receipt flow, and canonical idempotent placement).');
