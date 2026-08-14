import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migrationsDir = resolve(root, 'supabase', 'migrations');
const databaseTypesPath = resolve(root, 'src', 'types', 'database.ts');
const checkoutPath = resolve(root, 'src', 'pages', 'CheckoutPage.tsx');

const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const duplicateVersions = migrations.reduce((duplicates, name, index) => {
  const version = name.slice(0, 14);
  if (index > 0 && migrations[index - 1].slice(0, 14) === version) duplicates.add(version);
  return duplicates;
}, new Set());

const migration = readFileSync(
  resolve(migrationsDir, '20260902000000_add_customer_profile_checkout_fields.sql'),
  'utf8',
);
const databaseTypes = readFileSync(databaseTypesPath, 'utf8');
const checkout = readFileSync(checkoutPath, 'utf8');
const failures = [];

if (duplicateVersions.size > 0) {
  failures.push(`Duplicate migration versions: ${[...duplicateVersions].join(', ')}`);
}
for (const column of ['email_address', 'notes']) {
  if (!new RegExp(`ADD COLUMN IF NOT EXISTS ${column} text`, 'i').test(migration)) {
    failures.push(`Compatibility migration does not add customer_profiles.${column}.`);
  }
  if (!new RegExp(`\\b${column}: string \\| null;`).test(databaseTypes)) {
    failures.push(`Database type does not expose customer_profiles.${column}.`);
  }
}
if (!checkout.includes(".select('full_name, phone, apartment, house_unit, pickup_location, notes')")) {
  failures.push('Checkout customer_profiles select is not the single valid Supabase select shape.');
}

if (failures.length > 0) {
  console.error('Schema drift check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Schema drift check passed (${migrations.length} uniquely versioned migrations).`);
}
