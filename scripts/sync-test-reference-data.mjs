/**
 * Copies allow-listed, non-transactional reference data from Production to TEST.
 * Production calls are GET-only. TEST is refused unless its exact project ref is
 * jypujsyiecgcjtjrqjfx; Production is always refused as a write target.
 */
import { readFileSync } from 'node:fs';

const TEST_REF = 'jypujsyiecgcjtjrqjfx';
const PROD_REF = 'zcfpdmjjmihhvtuwngii';
const ALLOWLIST = [
  { table: 'Product', conflict: 'id' },
  { table: 'combos', conflict: 'id' },
  { table: 'combo_items', conflict: 'id' },
  { table: 'delivery_points', conflict: 'id' },
  { table: 'site_settings', conflict: 'key' },
];

function readEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) out[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}
function ref(url) { return new URL(url).hostname.split('.')[0]; }
function targetKey(env) { return env.TEST_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY; }
function sourceKey(env) { return env.SUPABASE_SERVICE_ROLE_KEY || env.TEST_SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY; }
async function request(url, token, init) {
  const response = await fetch(url, { ...init, headers: { apikey: token, Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${new URL(url).pathname}: ${response.status} ${await response.text()}`);
  return response;
}

const test = readEnv('.env.test');
const production = readEnv('.env.production.backup');
if (ref(test.VITE_SUPABASE_URL) !== TEST_REF) throw new Error('Refusing: TEST target is not jypujsyiecgcjtjrqjfx.');
if (ref(production.VITE_SUPABASE_URL) !== PROD_REF) throw new Error('Refusing: production source is not zcfpdmjjmihhvtuwngii.');
if (!targetKey(test) || !sourceKey(production)) throw new Error('A TEST service-role key and Production read key are required locally.');

for (const { table, conflict } of ALLOWLIST) {
  const encoded = encodeURIComponent(table);
  const source = await request(`${production.VITE_SUPABASE_URL}/rest/v1/${encoded}?select=*`, sourceKey(production), { method: 'GET' });
  const rows = await source.json();
  if (!rows.length) { console.log(`${table}: 0 rows (nothing to sync)`); continue; }
  await request(`${test.VITE_SUPABASE_URL}/rest/v1/${encoded}?on_conflict=${encodeURIComponent(conflict)}`, targetKey(test), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  console.log(`${table}: upserted ${rows.length} safe reference row(s)`);
}
