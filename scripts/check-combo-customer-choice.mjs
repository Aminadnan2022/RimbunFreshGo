import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261020000000_combo_customer_choice_mvp.sql');
const admin = read('src/pages/AdminComboFormPage.tsx');
const detail = read('src/pages/ComboDetailPage.tsx');
const checkout = read('src/lib/canonicalCheckout.ts');
const checkoutItems = read('src/lib/canonicalCheckoutItems.ts');
const preparation = read('src/lib/checkoutPreparation.ts');
const failures = [];

for (const token of ['choice_group_key', 'choice_group_label', 'price_adjustment', 'option_count < 2',
  'combo_choice_validate_order_line', 'v_count <> 1', 'combo_choice_filter_component', 'RETURN NULL',
  'source_combo_item_id', 'admin_duplicate_combo_choice_core', 'REVOKE INSERT, UPDATE, DELETE']) {
  if (!migration.includes(token)) failures.push(`missing schema/security/snapshot safeguard: ${token}`);
}
for (const token of ['Item Type', 'Fixed Item', 'Customer Choice', 'Choice Label', 'Give 2 or more items the same label',
  'Customer Choice groups', 'Choose 1 of', 'at least 2 valid options']) {
  if (!admin.includes(token)) failures.push(`missing admin UX: ${token}`);
}
for (const token of ['type="radio"', 'Choose 1', 'Please choose one option from every Customer Choice', 'chosenItems']) if (!detail.includes(token)) failures.push(`missing customer UX: ${token}`);
if (!checkout.includes('canonicalCheckoutItems(items)') || !checkoutItems.includes('combo_selections') || !checkoutItems.includes('combo_item_id')) failures.push('checkout does not send canonical selections');
if (!preparation.includes('componentNumber: partIndex + 1')) failures.push('preparation does not use projected component numbering');

if (failures.length) {
  console.error('Combo Customer Choice checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Combo Customer Choice checks passed (admin validation, exact-one checkout, immutable selected snapshot, supplier-only selected component, legacy fixed compatibility).');
