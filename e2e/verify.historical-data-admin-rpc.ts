import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const envValue = (name: string) => readFileSync('.env.test', 'utf8').split(/\r?\n/)
  .find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
const url = envValue('VITE_SUPABASE_URL');
const anonKey = envValue('VITE_SUPABASE_ANON_KEY');
const serviceKey = envValue('TEST_SUPABASE_SERVICE_ROLE_KEY');
if (!url || !anonKey || !serviceKey) throw new Error('Missing Supabase E2E credentials.');
if (!url.includes('jypujsyiecgcjtjrqjfx')) throw new Error('Safety stop: Previous Data test is limited to jypujsyiecgcjtjrqjfx.');

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const users: string[] = [];
let failures = 0;
const check = (ok: boolean, message: string) => ok ? console.log(`PASS: ${message}`) : (failures++, console.error(`FAIL: ${message}`));

async function clientFor(role: 'admin' | 'customer'): Promise<SupabaseClient> {
  const email = `history-${role}-${Date.now()}-${randomBytes(3).toString('hex')}@example.com`;
  const password = `Test-${randomBytes(18).toString('base64url')}!`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { privacy_notice_accepted: true, marketing_opt_in: false, privacy_policy_version: '2026-08-25' } });
  if (created.error || !created.data.user) throw new Error(created.error?.message ?? 'User creation failed');
  users.push(created.data.user.id);
  const roleResult = await service.from('user_roles').upsert({ id: created.data.user.id, role });
  if (roleResult.error) throw roleResult.error;
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return client;
}

async function main() {
  const admin = await clientFor('admin');
  const customer = await clientFor('customer');
  const date = `2099-12-${String(10 + Math.floor(Math.random() * 10)).padStart(2, '0')}`;
  const args = { p_business_date: date, p_order_count: 5, p_revenue_amount: 500, p_supplier_cost_amount: 470,
    p_delivery_income_amount: 0, p_gross_profit_amount: 30, p_notes: 'e2e' };

  const denied = await customer.rpc('admin_create_historical_business_daily', args);
  check(denied.error?.code === '42501', 'non-admin RPC mutation is denied');
  const direct = await admin.from('historical_business_daily').insert({ business_date: date, order_count: 1 });
  check(direct.error?.code === '42501', 'authenticated admin has no direct table INSERT');

  const created = await admin.rpc('admin_create_historical_business_daily', args);
  if (created.error || !created.data) throw new Error(created.error?.message ?? 'Admin create returned no id');
  const id = Number(created.data);
  check(true, 'admin create succeeds');
  const duplicate = await admin.rpc('admin_create_historical_business_daily', args);
  check(duplicate.error?.code === '23505', 'duplicate date returns unique-constraint code');
  const updated = await admin.rpc('admin_update_historical_business_daily', { ...args, p_id: id, p_order_count: 6 });
  check(!updated.error, 'admin update succeeds');
  const row = await service.from('historical_business_daily').select('order_count').eq('id', id).single();
  check(row.data?.order_count === 6, 'update persisted exact report value');
  const deleted = await admin.rpc('admin_delete_historical_business_daily', { p_id: id });
  check(!deleted.error, 'admin delete succeeds');
  const remaining = await service.from('historical_business_daily').select('id').eq('id', id).maybeSingle();
  check(remaining.data === null, 'delete removed the entry');
}

main().catch((error) => { failures++; console.error(error); }).finally(async () => {
  await Promise.all(users.map((id) => service.auth.admin.deleteUser(id)));
  if (failures) process.exitCode = 1;
});
