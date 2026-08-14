import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migration = readFileSync(resolve(root, 'supabase/migrations/20260904000000_phase2_product_preparation_configuration.sql'), 'utf8');
const page = readFileSync(resolve(root, 'src/pages/AdminPreparationConfigurationsPage.tsx'), 'utf8');
const failures = [];

for (const column of ['name_ms', 'description_ms', 'title_ms', 'label_ms', 'help_text_ms']) {
  if (!migration.includes(column)) failures.push(`Missing multilingual Phase 2 field: ${column}`);
}
for (const requirement of [
  'phase2_validate_published_product_preparation',
  'publish_preparation_schema_version',
  'get_published_product_preparation_questionnaire',
  "A published product version must reference a published preparation schema version",
]) if (!migration.includes(requirement)) failures.push(`Missing Phase 2 safeguard: ${requirement}`);
for (const preset of ['cut_size', "'24'", 'clean_gut', 'two_parts', 'butterfly']) {
  if (!page.includes(preset)) failures.push(`Missing expected admin questionnaire configuration: ${preset}`);
}
for (const behavior of ['replaceDraftQuestions', 'publishPreparationVersion', 'assignPublishedSchema', "preparationConfig.preview"]) {
  if (!page.includes(behavior)) failures.push(`Missing admin configuration behavior: ${behavior}`);
}
if (page.includes('CheckoutPage') || page.includes('preparation_options')) failures.push('Phase 2 UI must not alter legacy checkout preparation behavior.');

if (failures.length) {
  console.error('Phase 2 preparation checks failed:'); failures.forEach((x) => console.error(`- ${x}`)); process.exitCode = 1;
} else console.log('Phase 2 preparation checks passed (admin drafts, publishing, published storefront projection, and legacy-flow isolation).');
