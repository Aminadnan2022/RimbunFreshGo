import assert from 'node:assert/strict';
import { concisePreparationAnswer, concisePreparationText, estimatedWholeFishDetails, orderedQuantityText } from '../src/lib/checkoutReview.ts';
import type { PreparationQuestion, PreparationTarget } from '../src/lib/checkoutPreparation.ts';

const question = (overrides: Partial<PreparationQuestion>): PreparationQuestion => ({
  id: 'question',
  code: 'question',
  label: 'Question',
  label_ms: '',
  help_text: '',
  help_text_ms: '',
  answer_type: 'single_select',
  selection_scope: 'physical_unit',
  required: true,
  options: [],
  ...overrides,
});

const clean = question({
  code: 'clean_fish',
  label: 'Clean the fish?',
  options: [
    { id: 'yes', code: 'yes', label: 'Yes', label_ms: 'Ya', value: true },
    { id: 'no', code: 'no', label: 'No', label_ms: 'Tidak', value: false },
  ],
});
const cut = question({
  code: 'fish_cutting',
  label: 'Fish cutting',
  options: [{ id: 'no-cut', code: 'no_cut', label: 'Do not cut', label_ms: 'Jangan potong', value: 'no_cut' }],
});
const chicken = question({
  code: 'chicken_cutting',
  label: 'Chicken cutting',
  options: [{ id: 'cut-20', code: 'cut_20', label: 'Cut into 20', label_ms: 'Potong 20', value: 'cut_20' }],
});

assert.deepEqual(concisePreparationAnswer(clean, true, 'en'), ['Cleaned']);
assert.deepEqual(concisePreparationAnswer(clean, false, 'en'), ['Not cleaned']);
assert.deepEqual(concisePreparationAnswer(chicken, 'cut_20', 'en'), ['Cut into 20']);

const target: PreparationTarget = {
  key: 'line-0-combo-1',
  lineKey: 'line-0',
  componentNumber: 2,
  productId: 'selar',
  name: 'Selar (Oxeye Scad)',
  category: 'fish',
  quantity: 1,
  questionnaire: {
    product_version_id: 'product-version',
    preparation_schema_version_id: 'schema-version',
    questions: [clean, cut],
  },
};
const answers = {
  'line-0-combo-1:0': { clean_fish: true, fish_cutting: 'no_cut' },
};

assert.equal(concisePreparationText(target, answers, 0, 'en'), 'Cleaned · Do not cut');
assert.equal((`Selar (Oxeye Scad) — ${concisePreparationText(target, answers, 0, 'en')}`).match(/Selar/g)?.length, 1);
assert.equal(concisePreparationText(target, {}, 0, 'en'), '');

const selar = { quantity: 1, quantityValue: 1, sellingUnit: 'kg', pricingType: 'per_kg' as const, unit: 'kg' };
const siakap = { quantity: 1, quantityValue: 1, sellingUnit: 'kg', pricingType: 'per_kg' as const, unit: 'kg' };
const prawns = { quantity: 1, quantityValue: 0.5, sellingUnit: 'kg', pricingType: 'per_kg' as const, unit: 'kg' };
const wholeFish = { quantity: 1, quantityValue: 1, sellingUnit: 'piece', pricingType: 'fixed' as const, unit: 'per ekor' };
const chickenPiece = { quantity: 1, quantityValue: 1, sellingUnit: 'piece', pricingType: 'fixed' as const, unit: 'per bird' };
const estimatedWholeFish = { quantity: 1, unit: 'per ekor', orderingMode: 'whole_fish_by_weight' as const, estimatedWeight: 0.8 };
const twoEstimatedWholeFish = { quantity: 2, unit: 'per ekor', orderingMode: 'whole_fish_by_weight' as const, estimatedWeight: 1.2, price: 27 };

assert.equal(orderedQuantityText(selar), '1kg');
assert.equal(orderedQuantityText(siakap), '1kg');
assert.equal(orderedQuantityText(prawns), '0.5kg');
assert.equal(orderedQuantityText(wholeFish), '1 ekor');
assert.equal(orderedQuantityText(chickenPiece), '1 bird');
assert.equal(orderedQuantityText(estimatedWholeFish), '0.8kg');
assert.deepEqual(estimatedWholeFishDetails(twoEstimatedWholeFish), { weightKg: 0.6, estimatedPrice: 16.2 });
assert.equal(estimatedWholeFishDetails({ quantity: 1, orderingMode: 'fixed_quantity', estimatedWeight: 0.6, price: 27 }), null);
assert.equal([orderedQuantityText(selar), concisePreparationText(target, answers, 0, 'en')].filter(Boolean).join(' · '), '1kg · Cleaned · Do not cut');
assert.equal([orderedQuantityText(selar), concisePreparationText(target, {}, 0, 'en')].filter(Boolean).join(' · '), '1kg');

console.log('Checkout review formatting checks passed (snapshot quantity with/without preparation, physical units, concise actions, and no duplicate product name).');
