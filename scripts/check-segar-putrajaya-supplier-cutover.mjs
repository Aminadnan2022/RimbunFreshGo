import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const migrationPath = resolve(
  root,
  'supabase/migrations/20261127000000_standardize_operational_supplier_to_segar_putrajaya.sql',
);
const migration = readFileSync(migrationPath, 'utf8');
const failures = [];

const required = [
  "to_regclass('public.supplier_users') IS NULL",
  'LOCK TABLE public.suppliers IN SHARE ROW EXCLUSIVE MODE',
  "WHERE name = 'Segar Putrajaya'",
  "lower(btrim(name)) = lower('Segar Putrajaya')",
  'v_normalized_count > 1',
  'v_normalized_count = 1 AND v_exact_count = 0',
  'INSERT INTO public.suppliers (name)',
  "VALUES ('Segar Putrajaya')",
  'v_is_active IS DISTINCT FROM true',
  'Phase B must be a later migration containing an explicit reviewed VALUES',
  'Zero-cost rows are not price evidence',
];

for (const token of required) {
  if (!migration.includes(token)) failures.push(`migration is missing safeguard: ${token}`);
}

const forbiddenWriteTables = [
  'supplier_price_history',
  'supplier_users',
  'supplier_profiles',
  'Product',
  'sales_orders',
  'sales_order_lines',
  'sales_order_line_components',
  'sales_order_fulfilments',
  'supplier_delivery_batches',
  'supplier_delivery_batch_orders',
  'product_versions',
  'combo_versions',
  'combo_version_items',
];

for (const table of forbiddenWriteTables) {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const writePattern = new RegExp(
    `(?:UPDATE|INSERT\\s+INTO|DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?)\\s+(?:public\\.)?"?${escaped}"?`,
    'iu',
  );
  if (writePattern.test(migration)) failures.push(`Phase A must not write ${table}`);
}

if (/\b(?:DELETE|TRUNCATE)\b/iu.test(migration)) {
  failures.push('Phase A must not delete or truncate data');
}
if (/UPDATE\s+(?:public\.)?suppliers[\s\S]{0,500}?\bSET\b/iu.test(migration)) {
  failures.push('Phase A must not rename, reactivate, or otherwise update an existing supplier');
}
if (/\b(?:cost_price|cost_supplier_name|vendor_id|vendor_name)\s*=/iu.test(migration)) {
  failures.push('Phase A must not assign cost or Product vendor fields');
}
if (!/INSERT\s+INTO\s+public\.suppliers\s*\(name\)\s*VALUES\s*\('Segar Putrajaya'\)/iu.test(migration)) {
  failures.push('Phase A may only establish Segar Putrajaya through an explicit supplier-directory insert');
}

if (failures.length) {
  console.error('Segar Putrajaya Phase A checks failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Static Segar Putrajaya Phase A checks passed.');

const databaseUrl = process.env.FRESHGO_LOCAL_DATABASE_URL;
if (!databaseUrl) {
  console.log('Local post-Phase-A audit skipped (set FRESHGO_LOCAL_DATABASE_URL to a loopback PostgreSQL URL).');
  process.exit(0);
}

let parsed;
try {
  parsed = new URL(databaseUrl);
} catch {
  console.error('FRESHGO_LOCAL_DATABASE_URL is not a valid PostgreSQL URL.');
  process.exit(1);
}

if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
  console.error('Refusing database audit: FRESHGO_LOCAL_DATABASE_URL must use a loopback host.');
  process.exit(1);
}

const auditSql = String.raw`
WITH identity AS (
  SELECT count(*) FILTER (WHERE name = 'Segar Putrajaya' AND is_active) AS exact_active,
         count(*) FILTER (
           WHERE lower(btrim(name)) = lower('Segar Putrajaya')
         ) AS normalized_total
    FROM public.suppliers
), canonical_schema AS (
  SELECT to_regclass('public.supplier_users') IS NOT NULL AS ready
)
SELECT (i.exact_active = 1 AND i.normalized_total = 1 AND c.ready)::int
  FROM identity i CROSS JOIN canonical_schema c;
`;

const result = spawnSync('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', auditSql], {
  encoding: 'utf8',
  windowsHide: true,
});
if (result.error) {
  console.error(`Local database audit could not start psql: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(result.stderr.trim() || 'Local database audit failed.');
  process.exit(result.status ?? 1);
}
if (result.stdout.trim() !== '1') {
  console.error('Local database does not satisfy the post-Phase-A identity/schema invariant.');
  process.exit(1);
}
console.log('Local post-Phase-A identity/schema invariant passed.');
