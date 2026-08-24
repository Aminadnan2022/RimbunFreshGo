import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const migration = read('supabase/migrations/20261025000002_combo_version_republication_lifecycle.sql');
const data = read('src/data/combos.ts');
const form = read('src/pages/AdminComboFormPage.tsx');
const list = read('src/pages/AdminComboListPage.tsx');
const failures = [];

for (const token of [
  "to_jsonb(NEW) - 'effective_to'",
  "to_jsonb(OLD) - 'effective_to'",
  'OLD.effective_to IS NULL',
  'SET effective_to = v_published_at',
  'MAX(version_number)',
  'INSERT INTO public.combo_version_items',
  'GET DIAGNOSTICS v_published_item_count = ROW_COUNT',
  'v_published_item_count <> v_mutable_item_count',
  'Every Customer Choice needs at least 2 options before activation',
]) if (!migration.includes(token)) failures.push(`missing republication safeguard: ${token}`);

if (!data.includes('failedMessages') || !list.includes('formatComboLifecycleError')) {
  failures.push('admin activation failures are not surfaced with their server reason');
}
if (!form.includes('formatComboLifecycleError')) failures.push('combo form save/activation does not surface its server reason');

if (failures.length) {
  console.error('Combo republication lifecycle checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Combo republication lifecycle checks passed (safe period closure, new version publication, exact row counts, Customer Choice validation, and visible admin errors).');
