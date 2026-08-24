import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20261019000000_secure_historical_business_daily_writes.sql');
const data = read('src/data/historicalBusinessDaily.ts');
const page = read('src/pages/AdminHistoricalDataPage.tsx');
const failures = [];

for (const action of ['create', 'update', 'delete']) {
  if (!migration.includes(`admin_${action}_historical_business_daily`)) failures.push(`Missing admin ${action} RPC.`);
  if (!data.includes(`.rpc('admin_${action}_historical_business_daily'`)) failures.push(`UI data layer does not use ${action} RPC.`);
}
if (!/REVOKE INSERT, UPDATE, DELETE[\s\S]+FROM authenticated/i.test(migration)) failures.push('Direct authenticated DML is not revoked.');
if ((migration.match(/IF NOT public\.is_admin\(\)/g) ?? []).length !== 3) failures.push('Every mutation RPC must enforce is_admin().');
if ((migration.match(/SECURITY DEFINER/g) ?? []).length !== 3) failures.push('Every mutation RPC must be SECURITY DEFINER.');
if (/\.from\('historical_business_daily'\)\.(insert|update|delete)/.test(data)) failures.push('Historical data layer still writes directly to the table.');
for (const code of ['23505', '23514']) if (!page.includes(`'${code}'`)) failures.push(`UI does not map PostgreSQL error ${code}.`);

if (failures.length) {
  console.error('Admin Previous Data regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Admin Previous Data RPC/security/error regression passed.');
}
