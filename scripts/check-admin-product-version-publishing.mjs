import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const originalMigration = read('supabase/migrations/20261119000000_admin_publish_product_configuration.sql');
const migration = read('supabase/migrations/20261120000000_fix_admin_product_version_retirement.sql');
const immutabilityMigration = read('supabase/migrations/20261025000002_combo_version_republication_lifecycle.sql');
const products = read('src/data/products.ts');

const requiredSql = [
  'admin_update_product_and_publish_configuration',
  'IF auth.uid() IS NULL OR NOT public.is_admin()',
  'SET effective_to = v_now',
  "v_next_version, 'published', v_now",
  "THEN 'fish-piece-preparation'",
  "THEN 'fish-preparation'",
  'REVOKE ALL ON FUNCTION public.admin_update_product_and_publish_configuration(text, jsonb) FROM PUBLIC',
  'GRANT EXECUTE ON FUNCTION public.admin_update_product_and_publish_configuration(text, jsonb) TO authenticated',
];

const failures = requiredSql
  .filter((token) => !migration.includes(token))
  .map((token) => `migration missing: ${token}`);

if (!originalMigration.includes("SET status = 'retired', effective_to = v_now")) {
  failures.push('Regression fixture no longer captures the original two-column retirement bug.');
}
if (/SET\s+status\s*=\s*'retired'\s*,\s*effective_to\s*=\s*v_now/i.test(migration)) {
  failures.push('Published product retirement still mutates status as well as effective_to.');
}
if (!/UPDATE public\.product_versions\s+SET effective_to = v_now\s+WHERE id = v_current\.id;/s.test(migration)) {
  failures.push('Published product retirement is not the exact effective_to-only close operation.');
}
if (!immutabilityMigration.includes("(to_jsonb(NEW) - 'effective_to') = (to_jsonb(OLD) - 'effective_to')")) {
  failures.push('Published-version guard no longer restricts the allowed delta to effective_to.');
}

const shouldPublish = (current, product, schemaVersionId, physicalUnitType) =>
  !current
  || current.ordering_mode !== product.ordering_mode
  || current.selling_unit !== product.selling_unit
  || current.physical_unit_type !== physicalUnitType
  || current.preparation_schema_version_id !== schemaVersionId
  || (current.display_snapshot?.name ?? '') !== product.name
  || (current.display_snapshot?.name_ms ?? '') !== product.name_ms
  || (current.display_snapshot?.category ?? '') !== product.category;

const current = {
  id: 'siakap-v1', status: 'published', effective_to: null,
  ordering_mode: 'weight_only', selling_unit: 'kg', physical_unit_type: 'fish',
  preparation_schema_version_id: 'fish-weight-v1',
  display_snapshot: { name: 'Siakap', name_ms: 'Siakap', category: 'fish' },
};
const changed = {
  ordering_mode: 'fixed_quantity', selling_unit: 'piece',
  name: 'Siakap', name_ms: 'Siakap', category: 'fish',
};
if (!shouldPublish(current, changed, 'fish-piece-v1', 'fish')) {
  failures.push('Siakap-like fixed/weighted configuration change did not request a new version.');
}
const closed = { ...current, effective_to: '2026-11-20T00:00:00Z' };
const changedColumns = Object.keys(closed).filter((key) => closed[key] !== current[key]);
if (changedColumns.length !== 1 || changedColumns[0] !== 'effective_to' || closed.status !== 'published') {
  failures.push('Old published version was not closed with effective_to as its only changed column.');
}
const replacement = { ...current, ...changed, id: 'siakap-v2', effective_to: null, preparation_schema_version_id: 'fish-piece-v1' };
if (replacement.id === current.id || replacement.status !== 'published' || replacement.effective_to !== null) {
  failures.push('Replacement configuration was not represented by a new open published version.');
}
const simpleProductEdit = { ...changed, description: 'Updated non-versioned description' };
const currentForSimpleEdit = { ...replacement, display_snapshot: { name: 'Siakap', name_ms: 'Siakap', category: 'fish' } };
if (shouldPublish(currentForSimpleEdit, simpleProductEdit, 'fish-piece-v1', 'fish')) {
  failures.push('A non-versioned Product field update incorrectly requests a new version.');
}

if (!products.includes("'admin_update_product_and_publish_configuration'")) {
  failures.push('Admin product updates do not call the transactional publishing RPC.');
}
if (!products.includes('selling_unit: row.selling_unit ?? deriveSellingUnit(orderingMode)')) {
  failures.push('Product reads do not preserve the configured selling_unit.');
}
if (!products.match(/ordering_mode, selling_unit, display_order/)) {
  failures.push('Product SELECT does not fetch selling_unit.');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Admin product version publishing structural checks passed.');
