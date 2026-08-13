import fs from 'fs';
import { randomBytes } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Role = 'admin' | 'customer' | 'delivery_rider';
type TestUser = { id: string; email: string; password: string; role: Role };

function loadTestEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const content = fs.readFileSync('.env.test', 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
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

// Supabase's public-schema client sends this mixed-case identifier as public."Orders".
function orders(client: SupabaseClient) {
  return client.schema('public').from('Orders');
}

let failures = 0;
const createdUsers: TestUser[] = [];
let testOrderId: number | null = null;

function pass(message: string) { console.log(`PASS: ${message}`); }
function fail(message: string) { failures++; console.log(`FAIL: ${message}`); }

async function createUser(role: Role, runId: string): Promise<TestUser> {
  const email = `${role}.rider-${runId.toLowerCase()}@example.com`;
  const password = `RiderE2E!${randomBytes(18).toString('base64url')}`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
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

function buildTestOrder(runId: string) {
  const now = new Date().toISOString();
  return {
    full_name: 'E2E Rider RLS Customer', phone_number: '0100000000',
    email_address: `customer-${runId.toLowerCase()}@example.com`, street_address: '',
    postcode: '', city: '', state: 'Selangor', apartment: 'E2E Apartment',
    house_unit: 'E2E-01-01', pickup_location: 'E2E Test Location',
    delivery_point_name: 'E2E Test Location', delivery_method: '',
    order_notes: `Rider RLS test ${runId}`,
    item_options: [{ productId: 'e2e-rider-product', name: 'E2E Rider Product', preparation: null }],
    order_items: [{ productId: 'e2e-rider-product', name: 'E2E Rider Product', price: 10, costPrice: 4, quantity: 1, pricingType: 'fixed_quantity' }],
    delivery_slot: 'E2E TEST',
    order_summary: { status: 'confirmed', deliveryDate: now.slice(0, 10), deliveryWindow: 'E2E TEST', statusTimeline: [{ status: 'confirmed', time: now, done: true }], orderRef: `E2E-RIDER-${runId}` },
    subtotal: 10, delivery_fee: 0, total: 10, gross_profit: 6,
  };
}

async function cleanup() {
  console.log('\n==== CLEANUP TEST DATA ====');
  if (testOrderId !== null) {
    const { error } = await orders(service).delete().eq('id', testOrderId);
    console.log(error ? `Order cleanup warning: ${error.message}` : `Order cleanup: ${testOrderId}`);
  }

  let deleted = 0;
  for (const user of createdUsers) {
    const { error } = await service.auth.admin.deleteUser(user.id);
    if (error) console.log(`User cleanup warning (${user.role}): ${error.message}`); else deleted++;
  }
  console.log(`Cleanup deleted ${deleted}/${createdUsers.length} test users.`);
}

function denied(error: { message: string } | null, data: unknown[] | null, action: string) {
  if (error) pass(`rider direct ${action} denied: ${error.message}`);
  else if (!data || data.length === 0) pass(`rider direct ${action} denied (0 rows affected by RLS)`);
  else fail(`rider direct ${action} was ALLOWED (rider policy is too permissive)`);
}

async function main() {
  const runId = `${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
  console.log('==== RIDER ORDERS RLS VERIFICATION ====');
  console.log(`url=${SUPABASE_URL}`);
  console.log(`runId=E2E-RIDER-${runId}`);

  try {
    console.log('\n==== [1/8] CREATE TEST USERS ====');
    const customer = await createUser('customer', runId);
    const rider = await createUser('delivery_rider', runId);
    const admin = await createUser('admin', runId);
    const customerClient = await signIn(customer);
    const riderClient = await signIn(rider);
    const adminClient = await signIn(admin);

    console.log('\n==== [2/8] CUSTOMER INSERTS OWN ORDER ====');
    const { data: inserted, error: insertError } = await orders(customerClient).insert(buildTestOrder(runId)).select('id,user_id').single();
    if (insertError || !inserted) {
      fail(`customer INSERT own order failed: ${insertError?.message ?? 'no row returned'}`);
      return;
    }
    testOrderId = Number(inserted.id);
    if (inserted.user_id === customer.id) pass(`customer INSERT auto-bound user_id to auth.uid() (order=${testOrderId})`);
    else fail(`order user_id mismatch: expected ${customer.id}, got ${inserted.user_id}`);

    console.log('\n==== [3/8] RIDER CAN SELECT ====');
    const { data: riderRead, error: riderReadError } = await orders(riderClient).select('id,user_id').eq('id', testOrderId).maybeSingle();
    if (riderReadError || !riderRead) fail(`rider SELECT failed: ${riderReadError?.message ?? 'no row returned'}`);
    else pass('rider can SELECT customer test order');

    console.log('\n==== [4/8] RIDER DIRECT UPDATE IS DENIED ====');
    const { data: riderUpdate, error: riderUpdateError } = await orders(riderClient)
      .update({ delivery_status: 'out_for_delivery' }).eq('id', testOrderId).select('id');
    denied(riderUpdateError, riderUpdate, 'UPDATE Orders');

    console.log('\n==== [5/8] RIDER DIRECT DELETE IS DENIED ====');
    const { data: riderDelete, error: riderDeleteError } = await orders(riderClient).delete().eq('id', testOrderId).select('id');
    denied(riderDeleteError, riderDelete, 'DELETE Orders');

    console.log('\n==== [6/8] CUSTOMER CAN STILL SELECT OWN ORDER ====');
    const { data: customerRead, error: customerReadError } = await orders(customerClient).select('id,user_id').eq('id', testOrderId).maybeSingle();
    if (customerReadError || !customerRead) fail(`customer SELECT own order failed: ${customerReadError?.message ?? 'no row returned'}`);
    else pass('customer can still SELECT own test order');

    console.log('\n==== [7/8] RIDER SECURITY DEFINER RPC WORKFLOW ====');
    // Preconditions are defined in 20260817000000_order_based_rider_workflow.sql.
    // Only this disposable row is prepared by the service-role client.
    const { error: prepareError } = await orders(service).update({
      supplier_dispatch_started_at: new Date().toISOString(),
      supplier_dispatch_completed_at: null,
      ready_for_rider_at: null,
      delivery_status: 'pending',
      delivered_at: null,
      delivered_by: null,
    }).eq('id', testOrderId);
    if (prepareError) {
      fail(`could not prepare test order for rider RPCs: ${prepareError.message}`);
    } else {
      const receive = await riderClient.rpc('rider_receive_order_at_hub', { p_order_id: testOrderId });
      if (receive.error) fail(`rider_receive_order_at_hub failed: ${receive.error.message}`);
      else pass('rider_receive_order_at_hub exists and accepts the test order');

      const start = await riderClient.rpc('rider_start_order_delivery', { p_order_id: testOrderId });
      if (start.error) fail(`rider_start_order_delivery failed: ${start.error.message}`);
      else pass('rider_start_order_delivery exists and accepts the test order');

      const delivered = await riderClient.rpc('rider_update_delivery_status', { p_order_id: testOrderId, p_status: 'delivered' });
      if (delivered.error) fail(`rider_update_delivery_status failed: ${delivered.error.message}`);
      else pass('rider_update_delivery_status exists and accepts the test order');
    }

    console.log('\n==== [8/8] ADMIN CAN SELECT + DELETE ====');
    const { data: adminRead, error: adminReadError } = await orders(adminClient).select('id').eq('id', testOrderId).maybeSingle();
    if (adminReadError || !adminRead) fail(`admin SELECT failed: ${adminReadError?.message ?? 'no row returned'}`);
    else pass('admin can SELECT test order');
    const { data: adminDelete, error: adminDeleteError } = await orders(adminClient).delete().eq('id', testOrderId).select('id');
    if (adminDeleteError || !adminDelete || adminDelete.length === 0) fail(`admin DELETE failed: ${adminDeleteError?.message ?? '0 rows affected by RLS'}`);
    else { pass('admin can DELETE test order'); testOrderId = null; }

    console.log('\n==== RESULT ====');
    if (failures === 0) console.log('FAILURES: 0\nALL RIDER ORDERS RLS CHECKS PASS');
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
