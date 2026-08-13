import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Env = Record<string, string>;
type TestUser = { id: string; email: string; password: string };
type OrderRow = {
  id: number;
  user_id: string;
  full_name: string;
  phone_number: string;
  email_address: string;
  apartment: string;
  house_unit: string;
  pickup_location: string;
  delivery_point_name: string | null;
  delivery_method: string | null;
  order_notes: string | null;
  item_options: unknown;
  order_items: unknown;
  order_summary: unknown;
  subtotal: number | string;
  delivery_fee: number | string;
  total: number | string;
};

function loadTestEnv(): Env {
  const env: Env = {};
  const content = fs.readFileSync('.env.test', 'utf8');
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    env[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
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

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const createdUsers: TestUser[] = [];
const createdOrderIds: number[] = [];
let failures = 0;

function pass(message: string) { console.log(`PASS: ${message}`); }
function fail(message: string) { failures += 1; console.log(`FAIL: ${message}`); }
function check(condition: unknown, message: string) { condition ? pass(message) : fail(message); }
function orders(client: SupabaseClient) { return client.schema('public').from('Orders'); }

async function createUser(label: string, runId: string): Promise<TestUser> {
  const email = `${label}.checkout-${runId.toLowerCase()}@example.com`;
  const password = `CheckoutE2E!${randomBytes(18).toString('base64url')}`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { test_run_id: runId } });
  if (error || !data.user) throw new Error(`create ${label} failed: ${error?.message ?? 'no user returned'}`);
  const user = { id: data.user.id, email, password };
  createdUsers.push(user);
  const { error: roleError } = await service.from('user_roles').upsert({ id: user.id, role: 'customer' });
  if (roleError) throw new Error(`customer role assignment failed: ${roleError.message}`);
  return user;
}

async function signIn(user: TestUser): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session) throw new Error(`sign in failed: ${error?.message ?? 'no session'}`);
  return client;
}

/** Mirrors CheckoutPage + OrderContext.toRow. user_id is deliberately omitted. */
function checkoutPayload(runId: string, deliveryPoint: { name: string; delivery_fee: number | string; delivery_method: string }) {
  const deliveryFee = Number(deliveryPoint.delivery_fee);
  const fixed = {
    productId: `e2e-fixed-${runId}`, name: 'E2E Fixed Fish', image: '', price: 12.5, costPrice: 7,
    unit: 'pack', quantity: 2, preparation: 'cleaned', pricingType: 'fixed', grossProfit: 11,
  };
  const perKg = {
    productId: `e2e-kg-${runId}`, name: 'E2E Weight Prawns', image: '', price: 30, costPrice: 18,
    unit: 'kg', quantity: 1, estimatedWeight: 0.5, preparation: 'deveined', pricingType: 'per_kg',
  };
  const combo = {
    productId: `e2e-combo-${runId}`, comboId: `e2e-combo-${runId}`, name: 'E2E Family Combo', image: '',
    price: 20, unit: 'combo', quantity: 1, isCombo: true,
    comboItems: [
      { productId: `e2e-combo-fish-${runId}`, name: 'E2E Combo Fish', image: '', price: 10, unit: 'pack', quantity: 1, preparation: 'cut4', pricingType: 'fixed', label: 'E2E Combo Fish x1' },
      { productId: `e2e-combo-prawn-${runId}`, name: 'E2E Combo Prawns', image: '', price: 30, unit: 'kg', quantity: 1, quantityValue: 0.5, sellingUnit: 'kg', preparation: 'cleaned', pricingType: 'per_kg', label: 'E2E Combo Prawns 0.5kg' },
    ],
  };
  const items = [fixed, perKg, combo];
  const subtotal = 12.5 * 2 + 30 * 0.5 + 20;
  const total = subtotal + deliveryFee;
  const now = new Date().toISOString();
  const orderRef = `E2E-CHECKOUT-${runId}`;
  return {
    full_name: 'E2E Checkout Customer', phone_number: '0123456789', email_address: `checkout-${runId.toLowerCase()}@example.com`,
    street_address: '', postcode: '', city: '', state: 'Selangor', apartment: 'E2E Apartment', house_unit: 'E2E-12-34',
    pickup_location: deliveryPoint.name, delivery_point_name: deliveryPoint.name, delivery_method: deliveryPoint.delivery_method,
    order_notes: `Checkout E2E ${runId}`,
    item_options: items.map(({ productId, name, preparation }) => ({ productId, name, preparation: preparation ?? null })),
    order_items: items,
    delivery_slot: 'Wednesday',
    order_summary: { status: 'confirmed', deliveryDate: now.slice(0, 10), deliveryWindow: '10:00 AM–12:00 PM', statusTimeline: [{ status: 'Order Confirmed', time: now, done: true }], orderRef },
    subtotal, delivery_fee: deliveryFee, total, gross_profit: 17,
  };
}

async function cleanup() {
  const deletedOrders = createdOrderIds.length
    ? await service.schema('public').from('Orders').delete().in('id', createdOrderIds)
    : { error: null };
  if (deletedOrders.error) fail(`cleanup orders: ${deletedOrders.error.message}`);
  else console.log(`Cleanup deleted ${createdOrderIds.length}/${createdOrderIds.length} test orders.`);
  let deletedUsers = 0;
  for (const user of createdUsers) {
    const { error } = await service.auth.admin.deleteUser(user.id);
    if (error) fail(`cleanup user ${user.email}: ${error.message}`); else deletedUsers += 1;
  }
  console.log(`Cleanup deleted ${deletedUsers}/${createdUsers.length} test users.`);
}

async function main() {
  const runId = `${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
  const customer = await createUser('customer', runId);
  const otherCustomer = await createUser('other-customer', runId);
  const customerClient = await signIn(customer);

  // The first query is the exact checkout path. A service-role read below is
  // setup-only, so the remainder can still verify the customer order snapshot
  // if a stale test database is missing the expected delivery-point policy.
  const { data: customerDeliveryPoint, error: deliveryPointError } = await customerClient
    .from('delivery_points').select('name,delivery_fee,delivery_method').eq('active', true).order('display_order').limit(1).maybeSingle();
  check(!deliveryPointError && Boolean(customerDeliveryPoint), 'authenticated customer can read an active delivery point through the checkout API path');
  let serviceDeliveryPoint: typeof customerDeliveryPoint = null;
  let serviceDeliveryPointError: Error | null = null;
  if (!customerDeliveryPoint) {
    ({ data: serviceDeliveryPoint, error: serviceDeliveryPointError } = await service
      .from('delivery_points').select('name,delivery_fee,delivery_method').eq('active', true).order('display_order').limit(1).maybeSingle());
  }
  const deliveryPoint = customerDeliveryPoint ?? serviceDeliveryPoint;
  if (serviceDeliveryPointError || !deliveryPoint) throw new Error(`active delivery point unavailable: ${serviceDeliveryPointError?.message ?? deliveryPointError?.message ?? 'none found'}`);

  const payload = checkoutPayload(runId, deliveryPoint);
  const { data: inserted, error: insertError } = await orders(customerClient).insert(payload).select('id').single();
  if (insertError || !inserted) throw new Error(`checkout order insert failed: ${insertError?.message ?? 'no row returned'}`);
  createdOrderIds.push(inserted.id);
  pass('authenticated customer creates an order with the checkout payload');

  const { data: row, error: readError } = await orders(customerClient)
    .select('id,user_id,full_name,phone_number,email_address,apartment,house_unit,pickup_location,delivery_point_name,delivery_method,order_notes,item_options,order_items,order_summary,subtotal,delivery_fee,total')
    .eq('id', inserted.id).single();
  if (readError || !row) throw new Error(`checkout order read failed: ${readError?.message ?? 'no row returned'}`);
  const order = row as OrderRow;
  const items = order.order_items as Array<Record<string, unknown>>;
  const options = order.item_options as Array<Record<string, unknown>>;
  const summary = order.order_summary as Record<string, unknown>;

  check(order.user_id === customer.id, 'user_id is auto-bound to auth.uid() when omitted from the checkout payload');
  check(Number(order.subtotal) === payload.subtotal && Number(order.delivery_fee) === payload.delivery_fee && Number(order.total) === payload.total, 'subtotal + delivery_fee = total snapshot');
  check(order.delivery_point_name === deliveryPoint.name && order.pickup_location === deliveryPoint.name && order.delivery_method === deliveryPoint.delivery_method, 'delivery point, pickup fallback, method and fee are snapshotted');
  check(order.full_name === payload.full_name && order.phone_number === payload.phone_number && order.email_address === payload.email_address && order.apartment === payload.apartment && order.house_unit === payload.house_unit && order.order_notes === payload.order_notes, 'customer and delivery fields are snapshotted');
  check(items.length === 3 && items[0].pricingType === 'fixed' && items[0].quantity === 2, 'fixed-price item snapshot is preserved');
  check(items[1].pricingType === 'per_kg' && items[1].estimatedWeight === 0.5, 'per-kg estimated-weight item snapshot is preserved');
  check(items[2].isCombo === true && Array.isArray(items[2].comboItems) && (items[2].comboItems as unknown[]).length === 2, 'combo snapshot is preserved');
  check(options.length === 3 && options[0].preparation === 'cleaned' && options[1].preparation === 'deveined', 'item_options preparation snapshots are preserved');
  check(summary.orderRef === payload.order_summary.orderRef && summary.status === 'confirmed' && summary.deliveryWindow === '10:00 AM–12:00 PM', 'order_summary snapshot is preserved');

  const forgedPayload = { ...payload, order_summary: { ...payload.order_summary, orderRef: `${payload.order_summary.orderRef}-FORGED` }, user_id: otherCustomer.id };
  const { error: forgedError } = await orders(customerClient).insert(forgedPayload);
  check(Boolean(forgedError), 'customer cannot create an order for another user');

  console.log('INFO: required checkout fields (name, valid phone/email, house unit, delivery point and delivery day) are enforced in CheckoutPage.validate(). This DB/API test does not claim server-side validation for UI-only requirements; browser coverage is required for that gap.');
}

main()
  .catch((error) => { failures += 1; console.error(`FATAL: ${error instanceof Error ? error.message : String(error)}`); })
  .finally(async () => {
    await cleanup();
    console.log(`FAILURES: ${failures}`);
    console.log(failures === 0 ? 'ALL CHECKOUT / CUSTOMER ORDERING CHECKS PASS' : 'CHECKOUT / CUSTOMER ORDERING CHECKS FAILED');
    if (failures > 0) process.exitCode = 1;
  });
