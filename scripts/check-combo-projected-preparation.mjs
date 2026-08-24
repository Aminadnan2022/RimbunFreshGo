import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalCheckoutItems } from '../src/lib/canonicalCheckoutItems.ts';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const failures = [];

const comboItems = [
  { productId: 'chicken', comboItemId: 'current-chicken', componentNumber: 1, name: 'Whole Broiler Chicken', image: '', price: 1, unit: 'bird', category: 'chicken', quantity: 1, quantityValue: 1, sellingUnit: 'piece', label: 'Chicken' },
  { productId: 'selar', comboItemId: 'current-selar', componentNumber: 4, name: 'Selar', image: '', price: 1, unit: 'kg', category: 'fish', quantity: 1, quantityValue: 1, sellingUnit: 'kg', label: 'Selar', choiceGroupKey: 'fish' },
  { productId: 'udang-a', comboItemId: 'current-udang', componentNumber: 6, name: 'Udang A', image: '', price: 1, unit: 'kg', category: 'prawns', quantity: 1, quantityValue: 0.5, sellingUnit: 'kg', label: 'Udang A' },
  { productId: 'siakap', comboItemId: 'current-siakap', componentNumber: 7, name: 'Siakap', image: '', price: 1, unit: 'fish', category: 'fish', quantity: 1, quantityValue: 1, sellingUnit: 'piece', label: 'Siakap' },
];
const item = { productId: 'combo', comboId: 'combo', isCombo: true, name: 'Fixed combo', image: '', price: 50, unit: 'combo', quantity: 1, comboItems };
const projected = canonicalCheckoutItems([item])[0];
const expectedComponents = [
  { component_number: 1, combo_item_id: 'current-chicken', product_id: 'chicken' },
  { component_number: 2, combo_item_id: 'current-selar', product_id: 'selar' },
  { component_number: 3, combo_item_id: 'current-udang', product_id: 'udang-a' },
  { component_number: 4, combo_item_id: 'current-siakap', product_id: 'siakap' },
];
if (JSON.stringify(projected.combo_components) !== JSON.stringify(expectedComponents)) {
  failures.push('actual selected/fixed components are not serialized as contiguous 1..N projection identities');
}
if (JSON.stringify(projected.combo_selections) !== JSON.stringify([{ choice_group_key: 'fish', combo_item_id: 'current-selar' }])) {
  failures.push('selected Selar is not the only projected Customer Choice selection');
}

const questionnaire = (code) => ({
  product_version_id: `pv-${code}`,
  preparation_schema_version_id: `schema-${code}`,
  questions: [{ id: `q-${code}`, code, label: code, label_ms: code, help_text: '', help_text_ms: '', answer_type: 'single_select', selection_scope: 'line', required: true, options: [] }],
});
const targets = [
  { key: 'line-0-combo-0', lineKey: 'line-0', componentNumber: 1, productId: 'chicken', name: 'Chicken', category: 'chicken', quantity: 1, questionnaire: questionnaire('cut') },
  { key: 'line-0-combo-1', lineKey: 'line-0', componentNumber: 2, productId: 'selar', name: 'Selar', category: 'fish', quantity: 1, questionnaire: questionnaire('clean') },
  { key: 'line-0-combo-3', lineKey: 'line-0', componentNumber: 4, productId: 'siakap', name: 'Siakap', category: 'fish', quantity: 1, questionnaire: questionnaire('slice') },
];
const answers = {
  'line-0-combo-0:line': { cut: 'cut12' },
  'line-0-combo-1:line': { clean: 'cleaned' },
  'line-0-combo-3:line': { slice: 'cut2' },
};
const answerRows = targets.flatMap((target) => target.questionnaire.questions.map((question) => ({
  component_number: target.componentNumber,
  option_code: answers[`${target.key}:line`]?.[question.code],
})));
if (JSON.stringify(answerRows.map(({ component_number, option_code }) => [component_number, option_code])) !== JSON.stringify([[1, 'cut12'], [2, 'cleaned'], [4, 'cut2']])) {
  failures.push('preparation answers do not map Chicken/Selar/Siakap to projected components 1/2/4');
}
if (answerRows.some((row) => ![1, 2, 4].includes(row.component_number))) {
  failures.push('preparation answer references a component absent from the actual projection');
}

let staleRejected = false;
try {
  canonicalCheckoutItems([{ ...item, comboItems: [{ ...comboItems[0], comboItemId: undefined }] }]);
} catch (error) {
  staleRejected = String(error).includes('Refresh and reselect');
}
if (!staleRejected) failures.push('stale cart component identity is not rejected clearly');

const migration = read('supabase/migrations/20261024000000_combo_projected_component_numbering.sql');
for (const token of [
  'NEW.component_number := v_projected_number',
  `v_expected->>'product_id' IS DISTINCT FROM v_choice.product_id`,
  `v_expected->>'combo_item_id' = v_choice.source_combo_item_id::text`,
  'RETURN NULL;',
  'choose exactly one option for Customer Choice',
  'Refresh and reselect it before placing the order',
]) if (!migration.includes(token)) failures.push(`projected-component server safeguard missing: ${token}`);

const canonicalPlacement = read('supabase/migrations/20260924000000_supplier_canonical_checkout_enforcement.sql');
if (!canonicalPlacement.includes('component % does not exist on this order.')) {
  failures.push('server no longer rejects truly invalid preparation component references');
}
const canonicalClient = read('src/lib/canonicalCheckout.ts');
if (!canonicalClient.includes('const component = target.componentNumber') || !canonicalClient.includes('component_number: component')) {
  failures.push('canonical preparation serialization no longer uses the projected target number');
}
const staging = read('supabase/migrations/20261022000000_checkout_payment_receipt_staging.sql');
if (!staging.includes('consumed_sales_order_id') || !staging.includes('FROM public.place_sales_order(')) {
  failures.push('staged receipt/idempotent canonical placement path is not preserved');
}

if (failures.length) {
  console.error('Combo projected preparation checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Combo projected preparation checks passed (contiguous actual components, stable identities, Chicken/Selar/Siakap mapping, stale-cart rejection, strict invalid-reference guard, and staged/idempotent placement invariants).');
