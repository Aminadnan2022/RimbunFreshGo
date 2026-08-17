import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const migration = read('supabase/migrations/20260917500000_phase4b0_catalog_completeness.sql');
const failures = [];

// A. Must be additive/idempotent: guarded by NOT EXISTS, no destructive DML.
for (const token of ['NOT EXISTS', "status = 'published'"]) {
  if (!migration.includes(token)) failures.push(`missing idempotency guard: ${token}`);
}
for (const token of ['DELETE FROM', 'DROP TABLE', 'TRUNCATE']) {
  if (migration.includes(token)) failures.push(`must not contain destructive statement: ${token}`);
}
if (migration.includes('UPDATE public.product_versions') || migration.includes('UPDATE public.combo_versions')) {
  failures.push('must not rewrite existing product_versions/combo_versions rows');
}

// B. Preparation-schema assignment must follow live checkout rules, not invent one.
for (const token of [
  "WHEN p.category = 'chicken' AND COALESCE(p.ordering_mode, '') <> 'slice'",
  "WHEN p.category = 'fish' AND COALESCE(p.ordering_mode, '') <> 'slice'",
  "code = 'chicken-preparation'",
  "code = 'fish-preparation'",
]) {
  if (!migration.includes(token)) failures.push(`missing category/slice-aware schema assignment: ${token}`);
}

// C. Combo backfill must resolve component product_version_id and fail loudly if incomplete.
for (const token of ['combo_version_items', 'product_version_id IS NULL', 'RAISE EXCEPTION']) {
  if (!migration.includes(token)) failures.push(`missing combo lineage safeguard: ${token}`);
}

// D. Privilege fix must be least-privilege (SELECT only, no write grants added here).
if (!migration.includes('GRANT SELECT ON TABLE')) failures.push('missing service_role SELECT grant for catalog tables');
if (/GRANT\s+(INSERT|UPDATE|DELETE)/i.test(migration)) failures.push('Phase 4B.0 must not grant catalog write privileges');

if (failures.length) {
  console.error('Phase 4B.0 catalog completeness checks failed:');
  failures.forEach((x) => console.error(`- ${x}`));
  process.exit(1);
}
console.log('Phase 4B.0 catalog completeness checks passed (idempotent backfill, live-rule schema assignment, combo lineage safeguard, least-privilege grants).');
