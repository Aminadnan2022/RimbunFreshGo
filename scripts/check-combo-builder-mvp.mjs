import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migration = readFileSync(resolve(root, 'supabase/migrations/20261017000000_combo_builder_lifecycle.sql'), 'utf8');
const data = readFileSync(resolve(root, 'src/data/combos.ts'), 'utf8');
const form = readFileSync(resolve(root, 'src/pages/AdminComboFormPage.tsx'), 'utf8');
const list = readFileSync(resolve(root, 'src/pages/AdminComboListPage.tsx'), 'utf8');
const failures = [];

for (const token of [
  "CHECK (lifecycle_status IN ('draft', 'active', 'inactive'))",
  "lifecycle_status = 'active'",
  'combo_builder_require_active_combo',
  'admin_set_combo_lifecycle',
  'combo_version_items',
  'product_version_id',
  'FOR UPDATE',
]) if (!migration.includes(token)) failures.push(`missing lifecycle/canonical safeguard: ${token}`);

if (/UPDATE public\.combo_versions/i.test(migration) || /DELETE FROM public\.combo_versions/i.test(migration)) {
  failures.push('migration must not mutate or delete immutable canonical combo versions');
}
if (!data.includes("lifecycle_status: 'draft'") || !data.includes('active: false') || !data.includes('featured: false')) {
  failures.push('duplicate/create path must start hidden and unfeatured');
}
if (!data.includes('setComboLifecycle') || !form.includes('await setComboLifecycle')) {
  failures.push('editor must publish lifecycle through the canonical lifecycle RPC');
}
if (!list.includes("combo.lifecycle_status === 'draft'") || !list.includes("key: 'duplicate'")) {
  failures.push('admin list must expose draft state and duplicate action');
}

if (failures.length) {
  console.error('Combo Builder MVP checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Combo Builder MVP checks passed: duplicate/source isolation, lifecycle visibility, and canonical activation safeguards are present.');
