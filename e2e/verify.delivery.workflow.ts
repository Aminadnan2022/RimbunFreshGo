import fs from 'fs';
import { randomBytes } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Role = 'admin' | 'customer' | 'supplier' | 'delivery_rider';
type TestUser = { id: string; email: string; password: string; role: Role };
type WorkflowRow = {
  id: number;
  user_id: string;
  packing_started_at: string | null;
  packing_completed_at: string | null;
  supplier_dispatch_started_at: string | null;
  supplier_dispatch_completed_at: string | null;
  ready_for_rider_at: string | null;
  delivery_status: string | null;
  delivered_at: string | null;
  delivered_by: string | null;
  lalamove_tracking_url: string | null;
  booking_reference: string | null;
};

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
  const email = `${role}.workflow-${runId.toLowerCase()}@example.com`;
  const password = `WorkflowE2E!${randomBytes(18).toString('base64url')}`;
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

// Mirrors OrderContext.toRow's required checkout shape. user_id is deliberately
// omitted so the customer INSERT policy/default binds it to auth.uid().
function buildTestOrder(runId: string) {
  const now = new Date().toISOString();
  return {
    full_name: 'E2E Delivery Workflow Customer', phone_number: '0100000000',
    email_address: `customer-${runId.toLowerCase()}@example.com`, street_address: '',
    postcode: '', city: '', state: 'Selangor', apartment: 'E2E Apartment',
    house_unit: 'E2E-01-01', pickup_location: 'E2E Test Location',
    delivery_point_name: 'E2E Test Location', delivery_method: '',
    order_notes: `Delivery workflow test ${runId}`,
    item_options: [{ productId: 'e2e-workflow-product', name: 'E2E Workflow Product', preparation: null }],
    order_items: [{ productId: 'e2e-workflow-product', name: 'E2E Workflow Product', price: 10, costPrice: 4, quantity: 1, pricingType: 'fixed_quantity' }],
    delivery_slot: 'E2E TEST',
    order_summary: { status: 'confirmed', deliveryDate: now.slice(0, 10), deliveryWindow: 'E2E TEST', statusTimeline: [{ status: 'confirmed', time: now, done: true }], orderRef: `E2E-WORKFLOW-${runId}` },
    subtotal: 10, delivery_fee: 0, total: 10, gross_profit: 6,
  };
}

async function readOrder(client: SupabaseClient, label: string): Promise<WorkflowRow | null> {
  if (testOrderId === null) {
    fail(`${label}: test order ID is unavailable`);
    return null;
  }

  const { data, error } = await orders(client)
    .select('id,user_id,packing_started_at,packing_completed_at,supplier_dispatch_started_at,supplier_dispatch_completed_at,ready_for_rider_at,delivery_status,delivered_at,delivered_by,lalamove_tracking_url,booking_reference')
    .eq('id', testOrderId)
    .maybeSingle();
  if (error || !data) {
    fail(`${label}: could not read test order: ${error?.message ?? 'no row returned'}`);
    return null;
  }
  return data as WorkflowRow;
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

async function main() {
  const runId = `${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
  console.log('==== DELIVERY / RIDER WORKFLOW VERIFICATION ====');
  console.log(`url=${SUPABASE_URL}`);
  console.log(`runId=E2E-WORKFLOW-${runId}`);

  try {
    console.log('\n==== [1/7] CREATE TEST USERS ====');
    const customer = await createUser('customer', runId);
    const supplier = await createUser('supplier', runId);
    const rider = await createUser('delivery_rider', runId);
    const admin = await createUser('admin', runId);
    const customerClient = await signIn(customer);
    const supplierClient = await signIn(supplier);
    const riderClient = await signIn(rider);
    const adminClient = await signIn(admin);

    console.log('\n==== [2/7] CUSTOMER CREATES TEMPORARY ORDER ====');
    const { data: inserted, error: insertError } = await orders(customerClient)
      .insert(buildTestOrder(runId))
      .select('id,user_id')
      .single();
    if (insertError || !inserted) {
      fail(`customer INSERT own order failed: ${insertError?.message ?? 'no row returned'}`);
      return;
    }
    testOrderId = Number(inserted.id);
    if (inserted.user_id === customer.id) pass(`customer INSERT auto-bound user_id to auth.uid() (order=${testOrderId})`);
    else fail(`order user_id mismatch: expected ${customer.id}, got ${inserted.user_id}`);

    console.log('\n==== [3/7] SUPPLIER DISPATCHES ORDER ====');
    // These two direct updates are the current supplier application implementation
    // (src/data/deliveryBatches.ts). The booking RPC is the production dispatch step.
    const startedAt = new Date().toISOString();
    const { data: packingStarted, error: packingStartError } = await orders(supplierClient)
      .update({ packing_started_at: startedAt, updated_at: startedAt })
      .eq('id', testOrderId)
      .select('id,packing_started_at');
    if (packingStartError || !packingStarted?.[0]?.packing_started_at) {
      fail(`supplier start packing failed: ${packingStartError?.message ?? '0 rows affected by RLS'}`);
      return;
    }
    pass('supplier can start packing through the current application update path');

    const completedAt = new Date().toISOString();
    const { data: packingCompleted, error: packingCompleteError } = await orders(supplierClient)
      .update({ packing_completed_at: completedAt, updated_at: completedAt })
      .eq('id', testOrderId)
      .select('id,packing_completed_at');
    if (packingCompleteError || !packingCompleted?.[0]?.packing_completed_at) {
      fail(`supplier complete packing failed: ${packingCompleteError?.message ?? '0 rows affected by RLS'}`);
      return;
    }
    pass('supplier can complete packing through the current application update path');

    const trackingUrl = `https://example.com/e2e/lalamove/${runId}`;
    const bookingReference = `E2E-${runId}`;
    const { error: dispatchError } = await supplierClient.rpc('supplier_book_lalamove_order', {
      p_order_id: testOrderId,
      p_tracking_url: trackingUrl,
      p_booking_reference: bookingReference,
    });
    if (dispatchError) {
      fail(`supplier_book_lalamove_order failed: ${dispatchError.message}`);
      return;
    }

    const dispatched = await readOrder(supplierClient, 'supplier dispatch verification');
    if (!dispatched) return;
    if (dispatched.supplier_dispatch_started_at && dispatched.lalamove_tracking_url === trackingUrl && dispatched.booking_reference === bookingReference && !dispatched.supplier_dispatch_completed_at) {
      pass('supplier dispatch sets tracking details and supplier_dispatch_started_at');
    } else {
      fail('supplier dispatch did not leave the order in the expected incoming-shipment state');
      return;
    }

    console.log('\n==== [4/7] RIDER RECEIVES ORDER AT HUB ====');
    const { data: incoming, error: incomingError } = await orders(riderClient)
      .select('id')
      .eq('id', testOrderId)
      .not('supplier_dispatch_started_at', 'is', null)
      .is('supplier_dispatch_completed_at', null)
      .maybeSingle();
    if (incomingError || !incoming) {
      fail(`rider cannot see dispatched order in Incoming Shipments: ${incomingError?.message ?? 'no row returned'}`);
      return;
    }
    pass('rider can see the dispatched order in Incoming Shipments');

    const { error: receiveError } = await riderClient.rpc('rider_receive_order_at_hub', { p_order_id: testOrderId });
    if (receiveError) {
      fail(`rider_receive_order_at_hub failed: ${receiveError.message}`);
      return;
    }
    const received = await readOrder(riderClient, 'rider receive-at-hub verification');
    if (!received) return;
    if (received.supplier_dispatch_completed_at && received.ready_for_rider_at) pass('rider receive-at-hub sets supplier_dispatch_completed_at and ready_for_rider_at');
    else {
      fail('rider receive-at-hub did not set the required timestamps');
      return;
    }

    console.log('\n==== [5/7] RIDER STARTS DELIVERY ====');
    const { error: startError } = await riderClient.rpc('rider_start_order_delivery', { p_order_id: testOrderId });
    if (startError) {
      fail(`rider_start_order_delivery failed: ${startError.message}`);
      return;
    }
    const started = await readOrder(riderClient, 'rider start-delivery verification');
    if (!started) return;
    if (started.delivery_status === 'out_for_delivery') pass("rider start delivery sets delivery_status to 'out_for_delivery'");
    else {
      fail(`rider start delivery returned delivery_status=${String(started.delivery_status)}`);
      return;
    }

    console.log('\n==== [6/7] RIDER MARKS ORDER DELIVERED ====');
    const { error: deliveredError } = await riderClient.rpc('rider_update_delivery_status', {
      p_order_id: testOrderId,
      p_status: 'delivered',
    });
    if (deliveredError) {
      fail(`rider_update_delivery_status(delivered) failed: ${deliveredError.message}`);
      return;
    }
    const delivered = await readOrder(riderClient, 'rider delivered verification');
    if (!delivered) return;
    if (delivered.delivery_status === 'delivered' && delivered.delivered_at && delivered.delivered_by === rider.id) pass("rider delivery sets delivery_status='delivered', delivered_at, and delivered_by");
    else fail('rider delivery did not retain the expected delivered state');

    console.log('\n==== [7/7] ADMIN VERIFIES FINAL STATE ====');
    const adminRow = await readOrder(adminClient, 'admin final-state verification');
    if (adminRow && adminRow.delivery_status === 'delivered' && adminRow.delivered_at && adminRow.ready_for_rider_at && adminRow.supplier_dispatch_started_at && adminRow.supplier_dispatch_completed_at) {
      pass('admin can read the completed end-to-end workflow state');
    } else if (adminRow) {
      fail('admin read the order but the final workflow state is incomplete');
    }

    console.log('\n==== RESULT ====');
    if (failures === 0) console.log('FAILURES: 0\nALL DELIVERY / RIDER WORKFLOW CHECKS PASS');
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
