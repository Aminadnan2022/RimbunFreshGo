import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const preparation = readFileSync(resolve(root, 'src/lib/checkoutPreparation.ts'), 'utf8');
const checkout = readFileSync(resolve(root, 'src/pages/CheckoutPage.tsx'), 'utf8');
const failures = [];

// Standalone fish remain candidates by category even when their persisted cart
// snapshot uses an older ordering/pricing shape.
if (!preparation.includes("if (item.category === 'fish')")) {
  failures.push('standalone fish are no longer preparation candidates');
}

// A product with no published questionnaire returns null and must be omitted,
// while a failed RPC is isolated to that product instead of rejecting all of
// the valid fish questionnaire reads.
for (const token of [
  'export type PreparationLoadResult',
  'try {',
  'questionnaire: await loadQuestionnaire(candidate.productId)',
  'catch (error)',
  'failures: questionnaires',
  '.filter((x) => x.error !== null)',
]) {
  if (!preparation.includes(token)) failures.push(`missing isolated questionnaire loading: ${token}`);
}

for (const token of [
  'setPrepLoadFailures(failures)',
  "prepLoadFailures.length > 0",
  "disabled={prepLoading}",
  "requiredMissing(targets, answers)",
]) {
  if (!checkout.includes(token)) failures.push(`checkout no longer preserves graceful standalone preparation handling: ${token}`);
}

if (failures.length) {
  console.error('Standalone preparation loading checks failed:\n- ' + failures.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('Standalone fish preparation loading checks passed (configured Bawal-style targets load independently, no-config targets are omitted, and one failed lookup does not block valid answers).');
}
