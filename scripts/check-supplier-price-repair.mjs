import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migrations = resolve(root, 'supabase/migrations');
const files = readdirSync(migrations).filter((file) => file.endsWith('.sql'));
const timestamps = new Map();
const failures = [];

for (const file of files) {
  const timestamp = file.match(/^(\d{14})_/u)?.[1];
  if (!timestamp) continue;
  const previous = timestamps.get(timestamp);
  if (previous) failures.push(`duplicate migration timestamp ${timestamp}: ${previous}, ${file}`);
  else timestamps.set(timestamp, file);
}

const repairFile = '20261010000000_supplier_price_history_supplier_id_repair.sql';
const repair = readFileSync(resolve(migrations, repairFile), 'utf8');
for (const token of [
  'AND h.is_active = true',
  'AND h.supplier_id IS NULL',
  "btrim(COALESCE(h.supplier_name, '')) <> ''",
  'AND resolved.resolved_supplier_id IS NOT NULL',
  'AND h.cost_price = p_cost_price',
  'AND v_supplier_id IS NOT NULL',
]) {
  if (!repair.includes(token)) failures.push(`supplier-price repair missing safeguard: ${token}`);
}

if (failures.length) {
  console.error('Supplier-price repair checks failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Supplier-price repair checks passed (unique migration version and strict canonical linkage safeguards).');
