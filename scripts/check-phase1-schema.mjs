import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migrations = [
  '20260903000000_phase1_versioned_catalog_and_preparation.sql',
  '20260903000001_phase1_immutable_order_snapshots.sql',
].map((name) => readFileSync(resolve(root, 'supabase', 'migrations', name), 'utf8'));
const sql = migrations.join('\n');
const requiredTables = [
  'preparation_schemas', 'preparation_schema_versions', 'preparation_questions',
  'preparation_question_options', 'product_versions', 'combo_versions',
  'combo_version_items', 'sales_orders', 'sales_order_lines',
  'sales_order_line_units', 'sales_order_preparation_answers',
  'sales_order_events', 'sales_order_adjustments',
];
const failures = [];

for (const table of requiredTables) {
  if (!new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`, 'i').test(sql)) {
    failures.push(`Missing required Phase 1 table: ${table}`);
  }
}
for (const forbidden of ['DROP TABLE', 'TRUNCATE ', 'DELETE FROM public."Orders"', 'ALTER TABLE public."Orders"']) {
  if (sql.toUpperCase().includes(forbidden)) failures.push(`Non-additive statement found: ${forbidden}`);
}
for (const required of [
  'tstzrange', 'phase1_assert_no_version_overlap', 'phase1_prevent_snapshot_mutation',
  'phase1_validate_preparation_answer', 'ENABLE ROW LEVEL SECURITY',
]) {
  if (!sql.includes(required)) failures.push(`Missing foundation: ${required}`);
}

if (failures.length) {
  console.error('Phase 1 schema check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Phase 1 schema check passed (${requiredTables.length} additive tables).`);
}
