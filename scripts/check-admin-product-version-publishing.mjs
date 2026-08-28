import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261119000000_admin_publish_product_configuration.sql');
const products = read('src/data/products.ts');

const requiredSql = [
  'admin_update_product_and_publish_configuration',
  'IF auth.uid() IS NULL OR NOT public.is_admin()',
  "SET status = 'retired', effective_to = v_now",
  "v_next_version, 'published', v_now",
  "THEN 'fish-piece-preparation'",
  "THEN 'fish-preparation'",
  'REVOKE ALL ON FUNCTION public.admin_update_product_and_publish_configuration(text, jsonb) FROM PUBLIC',
  'GRANT EXECUTE ON FUNCTION public.admin_update_product_and_publish_configuration(text, jsonb) TO authenticated',
];

const failures = requiredSql
  .filter((token) => !migration.includes(token))
  .map((token) => `migration missing: ${token}`);

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
