import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migration = readFileSync(resolve(root, 'supabase/migrations/20261017000000_combo_builder_lifecycle.sql'), 'utf8');
const adminWrites = readFileSync(resolve(root, 'supabase/migrations/20261018000000_combo_builder_admin_write_rpcs.sql'), 'utf8');
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
if (!adminWrites.includes("'draft'") || !adminWrites.includes('false, false') || !adminWrites.includes('admin_duplicate_combo')) {
  failures.push('duplicate must start hidden and unfeatured through an admin-only RPC');
}
if (!data.includes('setComboLifecycle') || !form.includes('await setComboLifecycle')) {
  failures.push('editor must publish lifecycle through the canonical lifecycle RPC');
}
if (!list.includes("combo.lifecycle_status === 'draft'") || !list.includes("key: 'duplicate'")) {
  failures.push('admin list must expose draft state and duplicate action');
}
for (const token of [
  'const saved = await toggleComboActive',
  'c.id === id ? saved : c',
  'lifecyclePendingIds.has(combo.id)',
]) if (!list.includes(token)) failures.push(`admin lifecycle UI must reconcile and lock the affected row: ${token}`);
for (const token of [
  "lifecycle_status: active ? 'active' : 'inactive'",
  'await load();',
  'bulkLifecyclePartialFailure',
]) if (!list.includes(token)) failures.push(`bulk lifecycle UI must reconcile lifecycle status and report partial failures: ${token}`);
if (!data.includes("Promise<DbCombo>") || !data.includes("fetchComboById(id)")) {
  failures.push('lifecycle caller must refetch the affected combo after a successful RPC');
}
for (const token of ['Promise.allSettled', 'successfulIds', 'failedIds']) {
  if (!data.includes(token)) failures.push(`bulk lifecycle writes must retain per-combo outcomes: ${token}`);
}
for (const token of [
  'SECURITY DEFINER',
  'IF NOT public.is_admin()',
  'REVOKE INSERT, UPDATE, DELETE ON TABLE public.combos, public.combo_items FROM authenticated',
  'admin_save_combo',
  'admin_set_combo_presentation',
]) if (!adminWrites.includes(token)) failures.push(`missing admin-write security guard: ${token}`);
if (!data.includes("rpc('admin_duplicate_combo'") || data.includes('return createCombo({')) {
  failures.push('client duplicate must use the server-side admin RPC, not direct table inserts');
}

if (failures.length) {
  console.error('Combo Builder MVP checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Combo Builder MVP checks passed: duplicate/source isolation, lifecycle visibility, and canonical activation safeguards are present.');
