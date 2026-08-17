import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const checkout = read('src/pages/CheckoutPage.tsx');
const preparation = read('src/lib/checkoutPreparation.ts');
const canonical = read('src/lib/canonicalCheckout.ts');
const failures = [];

// A. Fixed chicken physical-unit answer must use the same key at storage and
// validation time (0-based unit index appended to target.key).
for (const token of [
  "return `${target.key}:${unit ?? 'line'}`;",
]) {
  if (!preparation.includes(token)) failures.push(`missing canonical answerKey format: ${token}`);
}

// B. requiredMissing must re-check the same key format for physical_unit
// questions using the target's own quantity, not a hardcoded count.
if (!preparation.includes("q.selection_scope === 'physical_unit'") || !preparation.includes('answerKey(target, unit)')) {
  failures.push('requiredMissing must validate physical_unit answers via answerKey(target, unit)');
}

// C. The stale "Please answer all required preparation questions" banner must
// auto-clear once the current answers satisfy requiredMissing, instead of
// only being cleared inside the Continue button's click handler.
if (!checkout.includes('!requiredMissing(targets, answers)') || !checkout.includes("prepError === t('checkout.preparationRequired')")) {
  failures.push('CheckoutPage must reactively clear the stale preparation-required banner once answers satisfy requiredMissing');
}
if (!/useEffect\(\(\) => \{[\s\S]{0,300}!requiredMissing\(targets, answers\)[\s\S]{0,120}setPrepError\(null\);/.test(checkout)) {
  failures.push('missing reactive effect clearing prepError when validation passes');
}

// D. canonicalCheckout must still emit 1-based unit_number/line_number and the
// exact question_code for a physical_unit answer, reading the same 0-based
// storage key produced by checkoutPreparation's answerKey.
for (const token of [
  "const units = target.questionnaire.questions.some((question) => question.selection_scope === 'physical_unit')",
  'Array.from({ length: target.quantity }, (_, index) => index + 1)',
  "answers[`${target.key}:${unitNumber - 1}`]",
  'unit_number: unitNumber',
  'question_code: question.code',
]) {
  if (!canonical.includes(token)) failures.push(`missing canonical preparation-answer mapping: ${token}`);
}

if (failures.length) {
  console.error('Checkout preparation validation checks failed:');
  failures.forEach((x) => console.error(`- ${x}`));
  process.exit(1);
}
console.log('Checkout preparation validation checks passed (consistent answer keys, reactive required-question banner, unchanged canonical unit_number mapping).');
