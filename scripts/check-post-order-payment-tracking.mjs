import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveCustomerPaymentPresentation } from '../src/lib/orderPaymentPresentation.ts';

const root = resolve(import.meta.dirname, '..');
const checkout = readFileSync(resolve(root, 'src/pages/CheckoutPage.tsx'), 'utf8');
const tracking = readFileSync(resolve(root, 'src/pages/OrderTrackingPage.tsx'), 'utf8');
const migration = readFileSync(resolve(root, 'supabase/migrations/20261028000000_qualify_checkout_receipt_placement_identifiers.sql'), 'utf8');

const submitted = resolveCustomerPaymentPresentation({ canonicalPaymentStatus: 'receipt_submitted', canonicalPriceStatus: 'final', legacyPaymentStatus: 'Ready To Pay' });
assert.deepEqual([submitted.label, submitted.awaitingVerification, submitted.showPaymentQr, submitted.allowReceiptUpload], ['Receipt Submitted', true, false, false]);

const approved = resolveCustomerPaymentPresentation({ canonicalPaymentStatus: 'paid', canonicalPriceStatus: 'final', legacyPaymentStatus: 'Paid' });
assert.deepEqual([approved.label, approved.awaitingVerification], ['Payment Confirmed', false]);

const deferredPending = resolveCustomerPaymentPresentation({ canonicalPaymentStatus: 'pending', canonicalPriceStatus: 'estimated', legacyPaymentStatus: 'Pending' });
assert.deepEqual([deferredPending.label, deferredPending.showPaymentQr, deferredPending.allowReceiptUpload], ['Awaiting Final Price', false, false]);

const deferredFinal = resolveCustomerPaymentPresentation({ canonicalPaymentStatus: 'pending', canonicalPriceStatus: 'final', legacyPaymentStatus: 'Ready To Pay' });
assert.deepEqual([deferredFinal.label, deferredFinal.showPaymentQr, deferredFinal.allowReceiptUpload], ['Ready To Pay', true, true]);

assert.match(checkout, /navigate\(`\/order\/\$\{order\.order_number\}`, \{ replace: true \}\)/, 'placement must redirect using the returned order number');
for (const token of [
  "from('sales_order_line_components')",
  "from('sales_order_line_component_units')",
  "from('sales_order_preparation_answers')",
  'Array.from({ length: content.comboQuantity }, (_, comboIndex)',
  'unit.comboUnitNumber === comboIndex + 1',
]) assert.ok(tracking.includes(token), `canonical order contents detail is missing ${token}`);
assert.match(tracking, /canonicalPayment\?\.paymentStatus/, 'tracking must prefer canonical payment state');
assert.match(tracking, /Payment Submitted/, 'tracking must name the submitted receipt stage accurately');
assert.match(tracking, /Awaiting Final Price/, 'estimated canonical prices must not be presented as awaiting payment');
assert.match(migration, /RETURN QUERY SELECT[\s\S]*'receipt_submitted'::text/, 'guarded placement must return receipt_submitted');
assert.match(migration, /consumed_sales_order_id = v_result\.sales_order_id/, 'staged receipt must remain tied to the idempotently returned order');

console.log('Post-order payment tracking checks passed (redirect, staged receipt, awaiting verification, approval, deferred payment, and idempotent result).');
