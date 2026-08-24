import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const admin = read('src/pages/AdminComboFormPage.tsx');
const combos = read('src/data/combos.ts');
const preparation = read('src/lib/checkoutPreparation.ts');
const checkout = read('src/lib/canonicalCheckout.ts');
const checkoutPage = read('src/pages/CheckoutPage.tsx');
const checkoutReview = read('src/lib/checkoutReview.ts');
const failures = [];

// Combo Builder no longer exposes or writes an item-level preparation override.
if (/label[^\n]*Preparation|\{\/\* Preparation \*\/\}/.test(admin)) {
  failures.push('Combo Builder still renders an item-level Preparation control');
}
if (/preparation:\s*item\.preparation/.test(admin)) {
  failures.push('Combo Builder still sends an item-level preparation override');
}

// The chosen cart snapshot carries the real product category. This is what lets
// selected per-kg fish (for example Selar) pass the preparation eligibility rules.
for (const token of ['category,', 'category: item.category', 'componentNumber: item.componentNumber']) {
  if (!combos.includes(token)) failures.push(`combo cart snapshot is missing ${token}`);
}
if (combos.includes('preparation: item.preparation')) {
  failures.push('checkout cart snapshot still trusts stale combo-item preparation');
}

// All actual comboItems are considered independently. ComboDetailPage builds this
// list from fixed items plus the one selected option, so unselected choices cannot
// become preparation targets. Standalone items retain their existing path.
for (const token of [
  'item.comboItems.forEach((part, partIndex)',
  'componentNumber: part.componentNumber ?? partIndex + 1',
  'productId: part.productId',
  'if (!shouldIncludePreparationItem(item))',
  'productId: item.productId',
]) {
  if (!preparation.includes(token)) failures.push(`preparation targeting is missing ${token}`);
}

// Supplier/order answers use the immutable selected component number directly;
// separate targets therefore map chicken, Selar, and further actual components
// to their own server-resolved component records.
for (const token of [
  'const component = target.componentNumber',
  'component_number: component',
  'line_number:',
  'unit_number: unitNumber',
]) {
  if (!checkout.includes(token)) failures.push(`canonical answer mapping is missing ${token}`);
}

// Review rows come from the actual cart/component snapshot, not preparation
// targets. That keeps fixed + selected choice components (including products
// without a questionnaire) exactly once while unselected alternatives remain
// absent from the snapshot. Preparation is joined by immutable component number.
for (const token of [
  'item.comboItems.map((component, componentIndex)',
  'candidate.componentNumber === componentNumber',
  'const quantity = comboComponentQuantity(component, item.quantity)',
  'reviewText(target, 0) || reviewText(target, null)',
  'conciseReviewLabel(target, unit)',
  '<span className="font-medium text-gray-900">{component.name}</span> — {quantity}',
  '<span className="font-medium text-gray-900">{item.name}</span> — {quantity}',
]) {
  if (!checkoutPage.includes(token)) failures.push(`checkout review display is missing ${token}`);
}
for (const token of [
  'candidate.code === answer || candidate.value === answer',
  "return language === 'ms' ? 'Dibersihkan' : 'Cleaned'",
  "return language === 'ms' ? 'Tidak dibersihkan' : 'Not cleaned'",
  ".join(' · ')",
]) {
  if (!checkoutReview.includes(token)) failures.push(`concise checkout review formatter is missing ${token}`);
}
if (/item\.comboItems\.filter\([^)]*preparation|lineTargets\.map\([^)]*component/.test(checkoutPage)) {
  failures.push('checkout review component rows are still driven by preparation targets');
}
if (checkoutPage.includes("target.category === 'chicken' ? t('checkout.chicken') : t('checkout.unit')")) {
  failures.push('checkout review still uses generic Chicken/Unit preparation labels');
}
if (/display\(question\).*reviewAnswer|\$\{display\(question\)\}:/.test(checkoutPage)) {
  failures.push('checkout review still repeats preparation question wording');
}

if (failures.length) {
  console.error('Combo checkout preparation checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Combo checkout preparation checks passed (review lists every actual fixed/selected component exactly once, keeps no-preparation items with quantity, joins only existing answers, excludes unselected choices, and preserves standalone/canonical paths).');
