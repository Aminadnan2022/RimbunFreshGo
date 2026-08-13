import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Role = 'customer' | 'supplier';
type TestUser = { id: string; email: string; password: string; role: Role };
type Combo = { id: string; name: string; price: number | string };
type FinancialOrder = {
  id: number;
  user_id: string;
  subtotal: number | string;
  delivery_fee: number | string;
  total: number | string;
  revenue?: number | string;
  supplier_cost?: number | string;
  gross_profit: number | string;
  profit_margin_percent?: number | string;
  frozen_total?: number | string;
  payment_status: string;
  supplier_weights: Record<string, number> | null;
  order_items: Array<Record<string, unknown>>;
};

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
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const serviceKey = env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error('Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, or TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test');
if (/production|prod/i.test(url)) throw new Error(`Safety stop: Supabase URL looks like production: ${url}`);

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const users: TestUser[] = [];
const orderIds: number[] = [];
let failures = 0;

const money = (value: number | string | null | undefined) => Math.round(Number(value ?? 0) * 100) / 100;
const equalMoney = (actual: number | string | null | undefined, expected: number) => money(actual) === money(expected);
const pass = (message: string) => console.log(`PASS: ${message}`);
const fail = (message: string) => { failures += 1; console.log(`FAIL: ${message}`); };
const check = (condition: unknown, message: string) => condition ? pass(message) : fail(message);

async function createUser(role: Role, runId: string): Promise<TestUser> {
  const email = `${role}.pricing-${runId.toLowerCase()}@example.com`;
  const password = `PricingE2E!${randomBytes(18).toString('base64url')}`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { test_run_id: runId } });
  if (error || !data.user) throw new Error(`create ${role} failed: ${error?.message ?? 'no user'}`);
  const user = { id: data.user.id, email, password, role };
  users.push(user);
  const { error: roleError } = await service.from('user_roles').upsert({ id: user.id, role });
  if (roleError) throw new Error(`assign ${role} role failed: ${roleError.message}`);
  return user;
}

async function signIn(user: TestUser): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error || !data.session) throw new Error(`sign in ${user.role} failed: ${error?.message ?? 'no session'}`);
  return client;
}

function payload(runId: string, combo: Combo, deliveryFee: number) {
  const now = new Date().toISOString();
  const comboPrice = money(combo.price);
  // Mirrors CartContext / buildComboCartItem / OrderContext. Slice revenue is
  // intentionally absent from checkout subtotal until the supplier weighs it.
  const items = [
    { productId: `e2e-fixed-${runId}`, name: 'E2E Fixed', price: 10, costPrice: 4, unit: 'pack', quantity: 2, pricingType: 'fixed' },
    { productId: `e2e-kg-${runId}`, name: 'E2E Per Kg', price: 30, costPrice: 18, unit: 'kg', quantity: 1, estimatedWeight: 0.5, pricingType: 'per_kg' },
    { productId: `e2e-slice-${runId}`, name: 'E2E Slice', price: 40, costPrice: 24, unit: 'kg', quantity: 3, sliceQuantity: 3, estimatedWeight: 0.25, pricingType: 'slice' },
    { productId: combo.id, comboId: combo.id, name: combo.name, price: comboPrice, unit: 'combo', quantity: 1, isCombo: true,
      comboItems: [{ productId: `e2e-combo-part-${runId}`, name: 'E2E Combo Part', price: 99, unit: 'pack', quantity: 1, pricingType: 'fixed', label: 'E2E Combo Part' }] },
  ];
  const subtotal = 20 + 15 + comboPrice;
  return {
    full_name: 'E2E Pricing Customer', phone_number: '0123456789', email_address: `pricing-${runId.toLowerCase()}@example.com`,
    street_address: '', postcode: '', city: '', state: 'Selangor', apartment: 'E2E Apartment', house_unit: 'E2E-08-08',
    pickup_location: 'E2E Pricing Location', delivery_point_name: 'E2E Pricing Location', delivery_method: 'pickup', order_notes: `Pricing E2E ${runId}`,
    item_options: items.map(({ productId, name }) => ({ productId, name, preparation: null })), order_items: items, delivery_slot: 'E2E TEST',
    order_summary: { status: 'confirmed', deliveryDate: now.slice(0, 10), deliveryWindow: 'E2E TEST', statusTimeline: [], orderRef: `E2E-PRICING-${runId}` },
    subtotal, delivery_fee: deliveryFee, total: subtotal + deliveryFee, gross_profit: 0,
  };
}

async function readOrder(client: SupabaseClient, id: number): Promise<FinancialOrder> {
  const fields = 'id,user_id,subtotal,delivery_fee,total,revenue,supplier_cost,gross_profit,profit_margin_percent,frozen_total,payment_status,supplier_weights,order_items';
  const { data, error } = await client.from('Orders').select(fields).eq('id', id).single();
  if (error || !data) throw new Error(`read order failed: ${error?.message ?? 'no row'}`);
  return data as FinancialOrder;
}

async function cleanup() {
  if (orderIds.length) {
    const { error } = await service.from('Orders').delete().in('id', orderIds);
    error ? fail(`cleanup orders: ${error.message}`) : console.log(`Cleanup deleted ${orderIds.length}/${orderIds.length} test orders.`);
  }
  let deleted = 0;
  for (const user of users) {
    const { error } = await service.auth.admin.deleteUser(user.id);
    if (error) fail(`cleanup ${user.email}: ${error.message}`); else deleted += 1;
  }
  console.log(`Cleanup deleted ${deleted}/${users.length} test users.`);
}

async function main() {
  const runId = `${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
  const customer = await createUser('customer', runId);
  const supplier = await createUser('supplier', runId);
  const customerClient = await signIn(customer);
  const supplierClient = await signIn(supplier);
  // Read the deterministic combo through the same authenticated storefront
  // path as the app. The test service key intentionally has no combo SELECT.
  const { data: configuredCombo, error: comboError } = await customerClient.from('combos').select('id,name,price').eq('active', true).order('id').limit(1).maybeSingle();
  if (comboError || !configuredCombo) {
    fail(`authenticated checkout path cannot read an active combo fixture: ${comboError?.message ?? 'none found'}`);
    console.log('INFO: continuing combo money arithmetic with a source-compatible snapshot because the configured combo table is inaccessible.');
  } else {
    pass('authenticated checkout path can read a deterministic active combo price');
    const { error: itemsError } = await customerClient
      .from('combo_items')
      .select('id,combo_id')
      .eq('combo_id', configuredCombo.id)
      .limit(1);
    check(!itemsError, 'authenticated storefront path can read items for an active combo');
  }

  // buildComboCartItem persists the combo’s own id/name/price as a normal
  // fixed-price outer line. This fallback lets the money rule run even when
  // the test project’s combo table privilege is independently broken.
  const combo: Combo = configuredCombo ?? { id: `e2e-combo-${runId}`, name: 'E2E Combo Snapshot', price: 35 };
  const deliveryFee = 6.5;
  const orderPayload = payload(runId, combo as Combo, deliveryFee);
  const comboPrice = money(combo.price);

  const { data: inserted, error: insertError } = await customerClient.from('Orders').insert(orderPayload).select('id,user_id').single();
  if (insertError || !inserted) throw new Error(`customer checkout insert failed: ${insertError?.message ?? 'no row'}`);
  orderIds.push(inserted.id);
  check(inserted.user_id === customer.id, 'checkout order is bound to the authenticated customer');

  const initial = await readOrder(service, inserted.id);
  const initialRevenue = 20 + 15 + 10 + comboPrice;
  const initialCost = 8 + 9 + 6;
  const initialProfit = initialRevenue - initialCost;
  check(equalMoney(initial.subtotal, 35 + comboPrice) && equalMoney(initial.delivery_fee, deliveryFee) && equalMoney(initial.total, 35 + comboPrice + deliveryFee), 'fixed-price, per-kg estimate, combo price, and delivery fee form the checkout total');
  check(equalMoney(initial.revenue, initialRevenue) && equalMoney(initial.supplier_cost, initialCost) && equalMoney(initial.gross_profit, initialProfit), 'persisted initial revenue, supplier cost, and gross profit use the frozen item snapshots');
  check(equalMoney(initial.profit_margin_percent, initialProfit / initialRevenue * 100), 'persisted initial profit-margin percentage is internally consistent');
  const initialItems = initial.order_items;
  check(initialItems.length === 4 && equalMoney(initialItems[0].selling_total as number, 20) && equalMoney(initialItems[3].selling_total as number, comboPrice), 'fixed-price line and configured combo are priced deterministically from their snapshots');

  const forged = await customerClient.from('Orders').update({ supplier_weights: { '1': 99 }, supplier_cost: 0, gross_profit: 999999, revenue: 999999, profit_margin_percent: 100, payment_status: 'Paid' }).eq('id', inserted.id).select('id');
  check(Boolean(forged.error) || !forged.data?.length, 'customer cannot update supplier-controlled weights, accounting fields, or payment status');

  // Mirrors SupplierDashboardPage.saveCurrentProduct after all required per-kg
  // and slice weights have been entered. The supplier UI owns this transition.
  const weights = { '1': 0.75, '2': 0.35 };
  const finalProductRevenue = 20 + (30 * 0.75) + (40 * 0.35) + comboPrice;
  const finalCost = 8 + (18 * 0.75) + (24 * 0.35);
  const finalProfit = finalProductRevenue - finalCost;
  const finalTotal = finalProductRevenue + deliveryFee;
  const { error: supplierUpdateError } = await supplierClient.from('Orders').update({
    supplier_weights: weights, total: finalTotal, gross_profit: finalProfit, payment_status: 'Ready To Pay', updated_at: new Date().toISOString(), updated_by: supplier.id,
  }).eq('id', inserted.id);
  if (supplierUpdateError) throw new Error(`supplier weight update failed: ${supplierUpdateError.message}`);

  const final = await readOrder(service, inserted.id);
  check(final.payment_status === 'Ready To Pay' && final.supplier_weights?.['1'] === 0.75 && final.supplier_weights?.['2'] === 0.35, 'all required per-kg and slice weights transition the order to Ready To Pay');
  check(equalMoney(final.total, finalTotal) && equalMoney(final.delivery_fee, deliveryFee), 'actual supplier weights recalculate the final total while retaining delivery fee');
  check(equalMoney(final.revenue, finalProductRevenue) && equalMoney(final.supplier_cost, finalCost) && equalMoney(final.gross_profit, finalProfit), 'actual weights recalculate persisted revenue, supplier cost, and gross profit consistently');
  check(equalMoney(final.profit_margin_percent, finalProfit / finalProductRevenue * 100), 'final profit margin is based on actual weighted revenue and frozen supplier cost');
  const finalItems = final.order_items;
  check(equalMoney(finalItems[1].actual_weight as number, 0.75) && equalMoney(finalItems[1].selling_total as number, 22.5) && equalMoney(finalItems[2].actual_weight as number, 0.35) && equalMoney(finalItems[2].selling_total as number, 14), 'per-kg and slice lines persist actual weights and final line totals');
}

main()
  .catch((error) => { failures += 1; console.error(`FATAL: ${error instanceof Error ? error.message : String(error)}`); })
  .finally(async () => {
    await cleanup();
    console.log(`FAILURES: ${failures}`);
    console.log(failures === 0 ? 'ALL ORDER CALCULATION / MONEY INTEGRITY CHECKS PASS' : 'ORDER CALCULATION / MONEY INTEGRITY CHECKS FAILED');
    if (failures > 0) process.exitCode = 1;
  });
