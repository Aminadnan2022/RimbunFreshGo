import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalCheckoutItems } from '../src/lib/canonicalCheckoutItems.ts';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const failures = [];

const selected = canonicalCheckoutItems([{
  productId: 'combo-1', comboId: 'combo-1', isCombo: true, name: 'Choice combo', image: '',
  price: 50, unit: 'combo', quantity: 1,
  comboItems: [
    { productId: 'fixed', comboItemId: 'fixed-id', componentNumber: 1, name: 'Fixed', image: '', price: 1, unit: 'item', quantity: 1, quantityValue: 1, sellingUnit: 'piece', label: 'Fixed' },
    { productId: 'fish-b', comboItemId: 'choice-b', componentNumber: 3, name: 'Fish B', image: '', price: 1, unit: 'item', quantity: 1, quantityValue: 1, sellingUnit: 'piece', label: 'Fish B', choiceGroupKey: 'fish' },
  ],
}]);
if (JSON.stringify(selected[0].combo_selections) !== JSON.stringify([{ choice_group_key: 'fish', combo_item_id: 'choice-b' }])) {
  failures.push('canonical p_items does not contain exactly the selected Customer Choice option');
}

const none = canonicalCheckoutItems([{ productId: 'combo-1', comboId: 'combo-1', isCombo: true, name: '', image: '', price: 1, unit: 'combo', quantity: 1, comboItems: [] }]);
if ((none[0].combo_selections ?? []).length !== 0) failures.push('empty selection was invented by the client');

const two = canonicalCheckoutItems([{ ...selected[0], productId: 'combo-1', comboId: 'combo-1', isCombo: true, name: '', image: '', price: 1, unit: 'combo', comboItems: [
  { ...selected[0], productId: 'a', comboItemId: 'a', name: 'A', image: '', price: 1, unit: 'item', quantity: 1, quantityValue: 1, sellingUnit: 'piece', label: 'A', choiceGroupKey: 'fish' },
  { ...selected[0], productId: 'b', comboItemId: 'b', name: 'B', image: '', price: 1, unit: 'item', quantity: 1, quantityValue: 1, sellingUnit: 'piece', label: 'B', choiceGroupKey: 'fish' },
] }]);
if ((two[0].combo_selections ?? []).length !== 2) failures.push('client payload hid a duplicate group selection from the server guard');

const migration = read('supabase/migrations/20261023000000_combo_choice_current_item_resolution.sql');
for (const token of [
  'IF v_count <> 1 THEN',
  "ci.id::text = selected->>'combo_item_id'",
  'ci.combo_id = cv.combo_id',
  'ci.choice_group_key = cvi.choice_group_key',
  'ci.product_id = cvi.product_id',
  'RETURN NULL;',
]) if (!migration.includes(token)) failures.push(`server resolution safeguard missing: ${token}`);

const checkout = read('src/pages/CheckoutPage.tsx');
if (!checkout.includes('ensureCheckoutAttemptKey()')) failures.push('receipt staging and placement do not share the checkout identity');
if (!checkout.includes('buildCanonicalPlaceOrderRequest({ idempotencyKey, customer: details, items: cart.items')) failures.push('placement no longer builds from persisted cart selections');

const staging = read('supabase/migrations/20261022000000_checkout_payment_receipt_staging.sql');
for (const token of ['FROM public.place_sales_order(', 'FOR UPDATE', 'consumed_sales_order_id', 'p_items']) {
  if (!staging.includes(token)) failures.push(`staged placement invariant missing: ${token}`);
}

if (failures.length) {
  console.error('Checkout Customer Choice staging checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Checkout Customer Choice staging checks passed (one selected option is preserved, zero/two remain visible to the exact-one server guard, current ids resolve only inside the same combo/group/product, and staged idempotency plumbing remains intact).');
