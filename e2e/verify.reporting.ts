import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── R1: REPORTING VIEW EXPOSURE VERIFIER ─────────────────────────────────────
// Asserts that anon, customer, supplier, delivery_rider AND admin cannot SELECT
// any of the 11 reporting objects (10 views + 1 materialized view).
//
// Pre-apply: every check FAILS (SELECT is ALLOWED) — expected evidence that R1
// was exploitable. Post-apply (20260831000000_reporting_views_exposure_
// remediation.sql): every check PASSES (SELECT is BLOCKED).
// The migration is applied manually via the Supabase SQL Editor; this verifier
// only reads .env.test and never writes application data.

type Role = 'admin' | 'customer' | 'supplier' | 'delivery_rider';
type TestUser = { id: string; email: string; password: string; role: Role };

function loadEnv(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const raw of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index > 0) values[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
  }
  return values;
}

const env = loadEnv();
const url = (env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const serviceKey = env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const PRODUCTION_URLS = ['https://zcfpdmjjmihhvtuwngii.supabase.co', 'https://zcfpdmjjmihhvtuwng2166.supabase.co'];
if (!url || PRODUCTION_URLS.includes(url)) throw new Error(`Safety stop: Supabase URL missing or looks like production: ${url}`);
if (!anonKey || !serviceKey) throw new Error('Missing VITE_SUPABASE_ANON_KEY or TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test');

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const users: TestUser[] = [];
let failures = 0;
let passes = 0;

type CheckResult = {
  scenario: number;
  label: string;
  role: string;
  operation: string;
  expected: string;
  actual: string;
  defect: boolean;
};
const failuresLog: CheckResult[] = [];

async function createUser(role: Role, runId: string): Promise<TestUser> {
  const email = `${role}.reporting-${runId.toLowerCase()}@example.com`;
  const password = `ReportingE2E!${randomBytes(18).toString('base64url')}`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { test_run_id: runId, role } });
  if (error || !data.user) throw new Error(`create ${role} failed: ${error?.message ?? 'no user'}`);
  const user = { id: data.user.id, email, password, role };
  users.push(user);
  const { error: roleError } = await service.from('user_roles').upsert({ id: user.id, role });
  if (roleError) throw new Error(`assign ${role} role failed: ${roleError.message}`);
  return user;
}

async function signIn(user: TestUser): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session) throw new Error(`sign in ${user.role} failed: ${error?.message ?? 'no session'}`);
  return client;
}

// 11 reporting objects from 20260821000000 (10 views + 1 materialized view).
const REPORTING_OBJECTS = [
  'vw_order_item_flat',
  'vw_sales_summary_daily',
  'vw_sales_summary_monthly',
  'vw_product_profit',
  'vw_supplier_profit',
  'vw_category_profit',
  'vw_top_products',
  'vw_top_profit_products',
  'vw_order_profit',
  'vw_dashboard_kpis',
  'mv_sales_summary_monthly',
];

async function check(
  scenario: number,
  label: string,
  role: string,
  operation: string,
  expectedBlocked: boolean,
  allowed: boolean,
  note: string | null,
): Promise<void> {
  const blocked = !allowed;
  const ok = blocked === expectedBlocked;
  const actual = blocked ? 'BLOCKED (permission denied)' : 'ALLOWED (SELECT succeeded)';
  const expected = expectedBlocked ? 'BLOCKED' : 'ALLOWED';
  if (ok) {
    passes += 1;
    console.log(`PASS [S${scenario}] ${label} (${role}) -> expected ${expected}, actual ${actual}`);
  } else {
    failures += 1;
    const defect = note !== null;
    console.log(`FAIL [S${scenario}] ${label} (${role}): ${operation} -> expected ${expected}, actual ${actual}${defect ? ` | ${note}` : ''}`);
    failuresLog.push({ scenario, label, role, operation, expected, actual, defect });
  }
}

async function cleanup(): Promise<void> {
  let deleted = 0;
  for (const user of users) {
    const { error } = await service.auth.admin.deleteUser(user.id);
    if (error) console.log(`Cleanup user ${user.email}: ${error.message}`); else deleted += 1;
  }
  console.log(`Cleanup deleted ${deleted}/${users.length} test users.`);
}

async function main(): Promise<void> {
  const runId = `${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
  console.log(`runId: ${runId}`);

  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const customer = await createUser('customer', runId);
  const supplier = await createUser('supplier', runId);
  const rider = await createUser('delivery_rider', runId);
  const admin = await createUser('admin', runId);
  const customerClient = await signIn(customer);
  const supplierClient = await signIn(supplier);
  const riderClient = await signIn(rider);
  const adminClient = await signIn(admin);

  const clients: Array<{ label: string; client: SupabaseClient }> = [
    { label: 'anon', client: anon },
    { label: 'customer', client: customerClient },
    { label: 'supplier', client: supplierClient },
    { label: 'delivery_rider', client: riderClient },
    { label: 'admin', client: adminClient },
  ];

  // 55 checks: 11 objects x 5 principals. Every SELECT must be BLOCKED; no
  // authenticated role (admin included) holds SELECT after the remediation.
  let scenario = 300;
  for (const obj of REPORTING_OBJECTS) {
    for (const { label, client } of clients) {
      const { data, error } = await client.from(obj).select('*').limit(1);
      const allowed = !error && Array.isArray(data);
      const errMsg = error ? ` (${error.code ?? ''} ${error.message})`.trim() : '';
      await check(
        scenario,
        `${label} SELECT on ${obj} is BLOCKED`,
        label,
        `SELECT ${obj} LIMIT 1`,
        true,
        allowed,
        error ? null : 'CONFIRMED DEFECT: reporting object readable without SELECT being revoked',
      );
      if (error) console.log(`INFO [S${scenario}] ${obj} ${label} error${errMsg}`);
      scenario += 1;
    }
  }
}

void main()
  .catch((error) => { failures += 1; console.error(`FATAL: ${error instanceof Error ? error.message : String(error)}`); })
  .finally(async () => {
    await cleanup();
    console.log('\n════════ PHASE 12 R1 REPORTING EXPOSURE RESULT ════════');
    console.log(`PASS count: ${passes}`);
    console.log(`FAIL count: ${failures}`);
    if (failuresLog.length) {
      console.log('\nFAILURE DETAILS:');
      for (const f of failuresLog) {
        console.log(`- [S${f.scenario}] ${f.label}`);
        console.log(`    role: ${f.role}`);
        console.log(`    operation: ${f.operation}`);
        console.log(`    expected: ${f.expected}`);
        console.log(`    actual: ${f.actual}`);
        console.log(`    genuine security/business defect: ${f.defect ? 'YES' : 'NO'}`);
      }
    }
    console.log(failures === 0 ? 'ALL REPORTING VIEWS LOCKED DOWN (anon/authenticated cannot SELECT)' : 'REPORTING VIEWS STILL EXPOSED (SELECT not revoked)');
    if (failures > 0) process.exitCode = 1;
  });
