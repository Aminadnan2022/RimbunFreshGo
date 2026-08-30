import fs from 'fs';
import { randomBytes } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Role = 'admin' | 'supplier' | 'customer';

type TestUser = { id: string; email: string; password: string; role: Role };

function loadTestEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const content = fs.readFileSync('.env.test', 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }

  return env;
}

const env = loadTestEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = env.TEST_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY or TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test');
}

if (/production|prod/i.test(SUPABASE_URL)) {
  throw new Error(`Safety stop: Supabase URL looks like production: ${SUPABASE_URL}`);
}

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function userClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let failures = 0;
const createdUsers: TestUser[] = [];
let testOrderId: number | null = null;

function pass(message: string) { console.log(`PASS: ${message}`); }
function fail(message: string) { failures++; console.log(`FAIL: ${message}`); }

async function createUser(role: Role, runId: string): Promise<TestUser> {
  const email = `${role}.supplier-${runId.toLowerCase()}@example.com`;
  const password = `SupplierE2E!${randomBytes(18).toString('base64url')}`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { test_run_id: runId, role, privacy_notice_accepted: true, marketing_opt_in: false, privacy_policy_version: '2026-08-25' } });
  if (error || !data.user) throw new Error(`create ${role} failed: ${error?.message ?? 'no user returned'}`);

  const user = { id: data.user.id, email, password, role };
  createdUsers.push(user);
  const { error: roleError } = await service.from('user_roles').upsert({ id: user.id, role });
  if (roleError) throw new Error(`user_roles upsert for ${role} failed: ${roleError.message}`);

  console.log(`created ${role}: id=${user.id} email=${user.email}`);
  return user;
}

async function signIn(user: TestUser): Promise<SupabaseClient> {
  const client = userClient();
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session || !data.user) throw new Error(`signIn(${user.role}) failed: ${error?.message ?? 'no session'}`);
  pass(`signIn(${user.role}) -> authenticated`);
  return client;
}

// Mirrors OrderContext.toRow's required checkout shape. user_id is deliberately
// omitted: the customer INSERT policy/default must bind it to auth.uid().
function buildTestOrder(runId: string) {
  const now = new Date().toISOString();
  return {
    full_name: 'E2E Supplier RLS Customer', phone_number: '0100000000',
    email_address: `customer-${runId.toLowerCase()}@example.com`, street_address: '',
    postcode: '', city: '', state: 'Selangor', apartment: 'E2E Apartment',
    house_unit: 'E2E-01-01', pickup_location: 'E2E Test Location',
    delivery_point_name: 'E2E Test Location', delivery_method: '',
    order_notes: `Supplier RLS test ${runId}`,
    item_options: [{ productId: 'e2e-weight-product', name: 'E2E Weight Product', preparation: null }],
    order_items: [{ productId: 'e2e-weight-product', name: 'E2E Weight Product', price: 10, costPrice: 4, quantity: 1, pricingType: 'per_kg', estimatedWeight: 1 }],
    delivery_slot: 'E2E TEST',
    order_summary: { status: 'confirmed', deliveryDate: now.slice(0, 10), deliveryWindow: 'E2E TEST', statusTimeline: [{ status: 'confirmed', time: now, done: true }], orderRef: `E2E-SUPPLIER-${runId}` },
    subtotal: 10, delivery_fee: 0, total: 10, gross_profit: 6,
  };
}

async function cleanup() {
  console.log('\n==== CLEANUP TEST DATA ====');
  if (testOrderId !== null) {
    const { error } = await service.from('Orders').delete().eq('id', testOrderId);
    console.log(error ? `Order cleanup warning: ${error.message}` : `Order cleanup: ${testOrderId}`);
  }
  let deleted = 0;
  for (const user of createdUsers) {
    const { error } = await service.auth.admin.deleteUser(user.id);
    if (error) console.log(`User cleanup warning (${user.role}): ${error.message}`); else deleted++;
  }
  console.log(`Cleanup deleted ${deleted}/${createdUsers.length} test users.`);
}

async function main() {
  const runId = `${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
  console.log('==== SUPPLIER ORDERS RLS VERIFICATION ====');
  console.log(`url=${SUPABASE_URL}`);
  console.log(`runId=E2E-SUPPLIER-${runId}`);

  try {
    console.log('\n==== [1/7] CREATE TEST USERS ====');
    const supplier = await createUser('supplier', runId);
    const customer = await createUser('customer', runId);
    const admin = await createUser('admin', runId);
    const supplierClient = await signIn(supplier);
    const customerClient = await signIn(customer);
    const adminClient = await signIn(admin);

    console.log('\n==== [2/7] CUSTOMER INSERTS OWN ORDER ====');
    const { data: inserted, error: insertError } = await customerClient.from('Orders').insert(buildTestOrder(runId)).select('id,user_id').single();
    if (insertError || !inserted) {
      fail(`customer INSERT own order failed: ${insertError?.message ?? 'no row returned'}`);
      return;
    }
    testOrderId = Number(inserted.id);
    if (inserted.user_id === customer.id) pass(`customer INSERT auto-bound user_id to auth.uid() (order=${testOrderId})`);
    else fail(`order user_id mismatch: expected ${customer.id}, got ${inserted.user_id}`);

    console.log('\n==== [3/7] SUPPLIER AND CUSTOMER CAN READ ====');
    const { data: supplierRead, error: supplierReadError } = await supplierClient.from('Orders').select('id,user_id').eq('id', testOrderId).maybeSingle();
    if (supplierReadError || !supplierRead) fail(`supplier SELECT failed: ${supplierReadError?.message ?? 'no row returned'}`);
    else pass('supplier can SELECT customer test order');
    const { data: customerRead, error: customerReadError } = await customerClient.from('Orders').select('id,user_id').eq('id', testOrderId).maybeSingle();
    if (customerReadError || !customerRead) fail(`customer SELECT own order failed: ${customerReadError?.message ?? 'no row returned'}`);
    else pass('customer can still SELECT own order');

    console.log('\n==== [4/7] SUPPLIER CAN UPDATE APP WORKFLOW FIELDS ====');
    const workflowUpdate = {
      supplier_weights: { '0': 1.25 }, total: 12.5,
      order_items: [{ productId: 'e2e-weight-product', name: 'E2E Weight Product', price: 10, costPrice: 4, quantity: 1, pricingType: 'per_kg', estimatedWeight: 1.25, actualWeight: 1.25 }],
      gross_profit: 7.5, payment_status: 'Ready To Pay',
      updated_at: new Date().toISOString(), updated_by: supplier.id,
    };
    const { data: supplierUpdate, error: supplierUpdateError } = await supplierClient.from('Orders').update(workflowUpdate).eq('id', testOrderId).select('id,supplier_weights,total,order_items,gross_profit,payment_status,updated_at,updated_by');
    if (supplierUpdateError || !supplierUpdate || supplierUpdate.length === 0) {
      fail(`supplier workflow UPDATE failed: ${supplierUpdateError?.message ?? '0 rows affected by RLS'}`);
    } else {
      const row = supplierUpdate[0] as { supplier_weights?: Record<string, number>; payment_status?: string; updated_by?: string | null };
      if (row.supplier_weights?.['0'] === 1.25 && row.payment_status === 'Ready To Pay' && row.updated_by === supplier.id) pass('supplier can UPDATE supplier_weights, total, order_items, gross_profit, payment_status, updated_at, and updated_by');
      else fail('supplier UPDATE returned a row but did not retain the expected workflow values');
    }

    console.log('\n==== [5/7] SUPPLIER CANNOT DELETE ====');
    const { data: supplierDelete, error: supplierDeleteError } = await supplierClient.from('Orders').delete().eq('id', testOrderId).select('id');
    if (supplierDeleteError) pass(`supplier DELETE denied: ${supplierDeleteError.message}`);
    else if (!supplierDelete || supplierDelete.length === 0) pass('supplier DELETE denied (0 rows affected by RLS)');
    else fail('supplier DELETE was ALLOWED (supplier policy is too permissive)');

    console.log('\n==== [6/7] CUSTOMER CANNOT UPDATE SUPPLIER FIELDS ====');
    const { data: customerUpdate, error: customerUpdateError } = await customerClient.from('Orders').update({ supplier_weights: { '0': 99 }, payment_status: 'Paid' }).eq('id', testOrderId).select('id');
    if (customerUpdateError) pass(`customer supplier-field UPDATE denied: ${customerUpdateError.message}`);
    else if (!customerUpdate || customerUpdate.length === 0) pass('customer supplier-field UPDATE denied (0 rows affected by RLS)');
    else fail('customer supplier-field UPDATE was ALLOWED');

    console.log('\n==== [7/7] ADMIN CAN READ + DELETE ====');
    const { data: adminRead, error: adminReadError } = await adminClient.from('Orders').select('id').eq('id', testOrderId).maybeSingle();
    if (adminReadError || !adminRead) fail(`admin SELECT failed: ${adminReadError?.message ?? 'no row returned'}`);
    else pass('admin can SELECT test order');
    const { data: adminDelete, error: adminDeleteError } = await adminClient.from('Orders').delete().eq('id', testOrderId).select('id');
    if (adminDeleteError || !adminDelete || adminDelete.length === 0) fail(`admin DELETE failed: ${adminDeleteError?.message ?? '0 rows affected by RLS'}`);
    else { pass('admin can DELETE test order'); testOrderId = null; }

    console.log('\n==== RESULT ====');
    if (failures === 0) console.log('FAILURES: 0\nALL SUPPLIER ORDERS RLS CHECKS PASS');
    else { console.log(`FAILURES: ${failures}`); process.exitCode = 1; }
  } finally {
    await cleanup();
  }
}

main().catch(async (error) => {
  console.error('\nFATAL ERROR');
  console.error(error);
  process.exitCode = 1;
  await cleanup();
});
