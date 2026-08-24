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
const comboQuantityMigration = read('supabase/migrations/20261029000000_scale_combo_preparation_units_by_ordered_quantity.sql');
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
  'componentNumber: partIndex + 1',
  'productId: part.productId',
  'if (!shouldIncludePreparationItem(item))',
  'productId: item.productId',
  'quantity: part.quantity * item.quantity',
  'comboQuantity: item.quantity',
  'unitsPerCombo: part.quantity',
]) {
  if (!preparation.includes(token)) failures.push(`preparation targeting is missing ${token}`);
}
for (const token of [
  'const lineTargets = targets.filter((target) => target.lineKey === `line-${lineIndex}`)',
  'Array.from({ length: item.quantity }, (_, comboIndex)',
  '{comboLabel} #{comboIndex + 1}',
  'const answerUnit = comboIndex * unitsPerCombo + componentUnit',
  'const destination = answerKey(target, comboIndex * unitsPerCombo + componentUnit)',
]) {
  if (!checkoutPage.includes(token)) failures.push(`per-combo preparation layout is missing ${token}`);
}

// Supplier/order answers use the selected projected component number directly;
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

// Review is grouped by each ordered combo. Every card is driven by the actual
// component snapshot, including components without a preparation questionnaire.
for (const token of [
  'Array.from({ length: item.quantity }, (_, comboIndex)',
  'item.comboItems!.map((component, componentIndex)',
  'candidate.componentNumber === componentNumber',
  'const answerUnit = comboIndex * unitsPerCombo + componentUnit',
  'reviewText(target, answerUnit) || reviewText(target, null)',
  '{comboLabel} #{comboIndex + 1}',
  '<span className="font-medium text-gray-900">{component.name}</span> — {quantity}',
  '<span className="font-medium text-gray-900">{item.name}</span> — {quantity}',
]) {
  if (!checkoutPage.includes(token)) failures.push(`checkout review display is missing ${token}`);
}
for (const token of [
  'SELECT quantity INTO v_combo_quantity',
  'v_unit_count := (NEW.quantity * v_combo_quantity)::integer',
  "'combo_unit_number'",
  "'component_unit_number'",
]) {
  if (!comboQuantityMigration.includes(token)) failures.push(`combo quantity preparation migration is missing ${token}`);
}
for (const token of ['target.comboQuantity && target.comboQuantity > 1', "language === 'ms' ? 'Kombo' : 'Combo'", 'Math.floor(unit / unitsPerCombo) + 1']) {
  if (!checkoutReview.includes(token)) failures.push(`per-combo review label is missing ${token}`);
}
if (checkoutPage.includes('const usefulQuantity =')) {
  failures.push('checkout review still hides physical quantity when preparation exists');
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

console.log('Combo checkout preparation checks passed (per-ordered-combo units and labels, actual component review, canonical answer mapping, and server unit materialisation).');
