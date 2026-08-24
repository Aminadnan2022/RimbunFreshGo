import assert from 'node:assert/strict';
import { concisePreparationAnswer, concisePreparationText } from '../src/lib/checkoutReview.ts';
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

console.log('Checkout review formatting checks passed (concise action phrases, combined selections, and no duplicate product name).');
