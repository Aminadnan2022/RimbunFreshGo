import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Role = 'admin' | 'customer' | 'supplier' | 'delivery_rider';
type TestUser = { id: string; email: string; password: string; role: Role };
type OrderRow = {
  id: number;
  user_id: string;
  payment_status: string;
  paid_at: string | null;
  paid_by: string | null;
  subtotal: number | string;
  delivery_fee: number | string;
  total: number | string;
  revenue: number | string;
  supplier_cost: number | string;
  gross_profit: number | string;
  profit_margin_percent: number | string;
  frozen_total: number | string;
  pricing_snapshot_timestamp: string | null;
  supplier_weights: Record<string, number> | null;
  order_items: Array<Record<string, unknown>>;
  updated_by: string | null;
  packing_started_at: string | null;
  packing_completed_at: string | null;
  supplier_dispatch_started_at: string | null;
  supplier_dispatch_completed_at: string | null;
  ready_for_rider_at: string | null;
  lalamove_tracking_url: string | null;
  delivery_status: string | null;
  delivered_at: string | null;
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
const url = (env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const serviceKey = env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const PRODUCTION_URLS = ['https://zcfpdmjjmihhvtuwngii.supabase.co', 'https://zcfpdmjjmihhvtuwng2166.supabase.co'];
if (!url || PRODUCTION_URLS.includes(url)) throw new Error(`Safety stop: Supabase URL missing or looks like production: ${url}`);
if (!anonKey || !serviceKey) throw new Error('Missing VITE_SUPABASE_ANON_KEY or TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test');

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const users: TestUser[] = [];
const orderIds: number[] = [];
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
  const email = `${role}.payment-${runId.toLowerCase()}@example.com`;
  const password = `PaymentE2E!${randomBytes(18).toString('base64url')}`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { test_run_id: runId, role, privacy_notice_accepted: true, marketing_opt_in: false, privacy_policy_version: '2026-08-25' } });
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

function checkoutItems(runId: string): Array<Record<string, unknown>> {
  return [
    { productId: `e2e-pay-fixed-${runId}`, name: 'E2E Pay Fixed', price: 10, costPrice: 4, unit: 'pack', quantity: 2, pricingType: 'fixed' },
    { productId: `e2e-pay-kg-${runId}`, name: 'E2E Pay Per Kg', price: 30, costPrice: 18, unit: 'kg', quantity: 1, estimatedWeight: 0.5, pricingType: 'per_kg' },
  ];
}

function checkoutPayload(runId: string): Record<string, unknown> {
  const now = new Date().toISOString();
  const items = checkoutItems(runId);
  return {
    full_name: 'E2E Payment Customer', phone_number: '0123456789', email_address: `payment-${runId.toLowerCase()}@example.com`,
    street_address: '', postcode: '', city: '', state: 'Selangor', apartment: 'E2E Payment Apt', house_unit: 'E2E-09-09',
    pickup_location: 'E2E Payment Location', delivery_point_name: 'E2E Payment Location', delivery_method: 'pickup',
    order_notes: `Payment E2E ${runId}`, item_options: items.map(({ productId, name }) => ({ productId, name, preparation: null })),
    order_items: items, delivery_slot: 'E2E TEST',
    order_summary: { status: 'confirmed', deliveryDate: now.slice(0, 10), deliveryWindow: 'E2E TEST', statusTimeline: [], orderRef: `E2E-PAY-${runId}` },
    subtotal: 35, delivery_fee: 6.5, total: 41.5, gross_profit: 0,
  };
}

const ORDER_FIELDS = 'id,user_id,payment_status,paid_at,paid_by,subtotal,delivery_fee,total,revenue,supplier_cost,gross_profit,profit_margin_percent,frozen_total,pricing_snapshot_timestamp,supplier_weights,order_items,updated_by,packing_started_at,packing_completed_at,supplier_dispatch_started_at,supplier_dispatch_completed_at,ready_for_rider_at,lalamove_tracking_url,delivery_status,delivered_at';

async function createOrder(customerClient: SupabaseClient, runId: string): Promise<number> {
  const { data: inserted, error } = await customerClient.from('Orders').insert(checkoutPayload(runId)).select('id,user_id').single();
  if (error || !inserted) throw new Error(`customer checkout insert failed: ${error?.message ?? 'no row'}`);
  orderIds.push(inserted.id);
  return inserted.id as number;
}

async function readOrder(id: number): Promise<OrderRow> {
  const { data, error } = await service.from('Orders').select(ORDER_FIELDS).eq('id', id).single();
  if (error || !data) throw new Error(`read order ${id} failed: ${error?.message ?? 'no row'}`);
  return data as OrderRow;
}

async function tryUpdate(client: SupabaseClient, id: number, changes: Record<string, unknown>): Promise<{ allowed: boolean; error: string | null }> {
  const { data, error } = await client.from('Orders').update(changes).eq('id', id).select('id');
  const allowed = !error && Array.isArray(data) && data.length > 0;
  return { allowed, error: error ? error.message : null };
}

async function tryInsert(client: SupabaseClient, payload: Record<string, unknown>): Promise<{ allowed: boolean; error: string | null; row: { id: number } | null }> {
  const { data, error } = await client.from('Orders').insert(payload).select('id').single();
  if (error) return { allowed: false, error: error.message, row: null };
  if (!data) return { allowed: false, error: 'no row returned', row: null };
  const row = data as unknown as { id: number };
  orderIds.push(Number(row.id));
  return { allowed: true, error: null, row };
}

const num = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100) / 100;

async function check(
  scenario: number,
  label: string,
  role: string,
  operation: string,
  expectedBlocked: boolean,
  allowed: boolean,
  defectNote: string | null,
): Promise<void> {
  const blocked = !allowed;
  const ok = blocked === expectedBlocked;
  const actual = blocked ? 'BLOCKED (error / 0 rows)' : 'ALLOWED (row mutated)';
  const expected = expectedBlocked ? 'BLOCKED' : 'ALLOWED';
  if (ok) {
    passes += 1;
    console.log(`PASS [S${scenario}] ${label} (${role}) -> expected ${expected}, actual ${actual}`);
  } else {
    failures += 1;
    const isDefect = defectNote !== null;
    console.log(`FAIL [S${scenario}] ${label} (${role}): ${operation} -> expected ${expected}, actual ${actual}${isDefect ? ` | ${defectNote}` : ''}`);
    failuresLog.push({ scenario, label, role, operation, expected, actual, defect: isDefect });
  }
}

function assertEqual(scenario: number, label: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (ok) {
    passes += 1;
    console.log(`PASS [S${scenario}] ${label} = ${String(expected)}`);
  } else {
    failures += 1;
    console.log(`FAIL [S${scenario}] ${label}: expected ${String(expected)}, got ${String(actual)}`);
    failuresLog.push({ scenario, label, role: 'n/a', operation: `read ${label}`, expected: String(expected), actual: String(actual), defect: false });
  }
}

async function adminConfirmPaid(adminClient: SupabaseClient, id: number, paid_by: string): Promise<void> {
  const { error } = await adminClient.from('Orders').update({
    payment_status: 'Paid', paid_at: new Date().toISOString(), paid_by,
  }).eq('id', id).select('id');
  if (error) throw new Error(`admin confirm payment on order ${id} failed: ${error.message}`);
}

async function cleanup(): Promise<void> {
  if (orderIds.length) {
    const { error } = await service.from('Orders').delete().in('id', orderIds);
    if (error) console.log(`Cleanup orders ERROR: ${error.message}`); else console.log(`Cleanup deleted ${orderIds.length}/${orderIds.length} test orders.`);
  }
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

  const admin = await createUser('admin', runId);
  const customer = await createUser('customer', runId);
  const supplier = await createUser('supplier', runId);
  const rider = await createUser('delivery_rider', runId);
  const customerClient = await signIn(customer);
  const supplierClient = await signIn(supplier);
  const adminClient = await signIn(admin);
  const riderClient = await signIn(rider);
  const adminUid = (await adminClient.auth.getUser()).data.user?.id;
  assertEqual(0, 'admin session resolves to the created admin user id', adminUid, admin.id);

  // orderMain: happy path + delivery regression. orderSup: supplier paid-field attacks.
  // orderBypass: supplier bypass. orderPaid / orderPaidPen: Paid-state immutability.
  const orderMain = await createOrder(customerClient, runId);
  const orderSup = await createOrder(customerClient, runId);
  const orderBypass = await createOrder(customerClient, runId);
  const orderPaid = await createOrder(customerClient, runId);
  const orderPaidPen = await createOrder(customerClient, runId);
  console.log(`created orders: main=${orderMain}, sup=${orderSup}, bypass=${orderBypass}, paid=${orderPaid}, paidPen=${orderPaidPen}`);

  for (const id of [orderMain, orderSup, orderBypass, orderPaid, orderPaidPen]) {
    const row = await readOrder(id);
    assertEqual(0, `fresh order ${id} starts Pending`, row.payment_status, 'Pending');
    assertEqual(0, `fresh order ${id} has no paid_at`, row.paid_at, null);
    assertEqual(0, `fresh order ${id} has no paid_by`, row.paid_by, null);
  }

  // ── RETAINED CUSTOMER COVERAGE (no UPDATE access) on a Pending order ──────
  const nowIso = new Date().toISOString();
  {
    const r1 = await tryUpdate(customerClient, orderMain, { payment_status: 'Paid' });
    await check(100, 'customer cannot set payment_status=Paid', 'customer', 'UPDATE Orders SET payment_status = "Paid"', true, r1.allowed, null);
    const r2 = await tryUpdate(customerClient, orderMain, { paid_at: nowIso });
    await check(101, 'customer cannot modify paid_at', 'customer', 'UPDATE Orders SET paid_at=now()', true, r2.allowed, null);
    const r3 = await tryUpdate(customerClient, orderMain, { paid_by: customer.id });
    await check(102, 'customer cannot modify paid_by', 'customer', 'UPDATE Orders SET paid_by=<customer-id>', true, r3.allowed, null);
  }

  // ── R2: CUSTOMER INSERT GUARD (adversarial INSERT coverage) ──────────────
  {
    // Payload basis mirrors the legitimate checkout shape; each case mutates a
    // fresh copy so scenarios are independent.
    const base = checkoutPayload(runId);

    // A: payment_status='Paid' on INSERT must be rejected.
    const a = await tryInsert(customerClient, { ...base, order_summary: { ...base.order_summary, orderRef: `E2E-PAY-${runId}-R2A` }, payment_status: 'Paid' });
    await check(200, 'customer INSERT payment_status=Paid is BLOCKED', 'customer', 'INSERT Orders SET payment_status = "Paid"', true, a.allowed, 'CONFIRMED DEFECT: customer INSERT can set payment_status=Paid');

    // B: payment_status='Ready To Pay' on INSERT must be rejected.
    const b = await tryInsert(customerClient, { ...base, order_summary: { ...base.order_summary, orderRef: `E2E-PAY-${runId}-R2B` }, payment_status: 'Ready To Pay' });
    await check(201, 'customer INSERT payment_status=Ready To Pay is BLOCKED', 'customer', 'INSERT Orders SET payment_status = "Ready To Pay"', true, b.allowed, 'CONFIRMED DEFECT: customer INSERT can set payment_status=Ready To Pay');

    // C: paid_at on INSERT must be rejected.
    const c = await tryInsert(customerClient, { ...base, order_summary: { ...base.order_summary, orderRef: `E2E-PAY-${runId}-R2C` }, paid_at: nowIso });
    await check(202, 'customer INSERT paid_at is BLOCKED', 'customer', 'INSERT Orders SET paid_at=now()', true, c.allowed, 'CONFIRMED DEFECT: customer INSERT can set paid_at');

    // D: paid_by on INSERT must be rejected.
    const d = await tryInsert(customerClient, { ...base, order_summary: { ...base.order_summary, orderRef: `E2E-PAY-${runId}-R2D` }, paid_by: customer.id });
    await check(203, 'customer INSERT paid_by is BLOCKED', 'customer', 'INSERT Orders SET paid_by=<customer-id>', true, d.allowed, 'CONFIRMED DEFECT: customer INSERT can set paid_by');

    // E: internally consistent money, no payment fields -> allowed, Pending/null/null.
    const e = await tryInsert(customerClient, { ...base, order_summary: { ...base.order_summary, orderRef: `E2E-PAY-${runId}-R2E` } });
    if (e.allowed && e.row) {
      const row = await readOrder(e.row.id);
      assertEqual(204, 'R2E INSERT allowed with consistent money, defaults to Pending', row.payment_status, 'Pending');
      assertEqual(204, 'R2E INSERT leaves paid_at NULL', row.paid_at, null);
      assertEqual(204, 'R2E INSERT leaves paid_by NULL', row.paid_by, null);
    } else {
      await check(204, 'customer INSERT with consistent money and no payment fields is ALLOWED', 'customer', 'INSERT Orders (checkout payload, no payment fields)', false, e.allowed, `unexpected reject: ${e.error}`);
    }

    // F: total != subtotal + delivery_fee must be rejected.
    const f = await tryInsert(customerClient, { ...base, order_summary: { ...base.order_summary, orderRef: `E2E-PAY-${runId}-R2F` }, subtotal: 35, delivery_fee: 6.5, total: 0.01 });
    await check(205, 'customer INSERT with inconsistent total (total != subtotal + delivery_fee) is BLOCKED', 'customer', 'INSERT Orders SET subtotal=35, delivery_fee=6.5, total=0.01', true, f.allowed, 'CONFIRMED DEFECT: customer INSERT can forge total');

    // G: active delivery point with an incorrect delivery_fee must be rejected.
    // Read through the customer client (the checkout path) — the service role
    // has no SELECT grant on delivery_points.
    const { data: point, error: pointError } = await customerClient
      .from('delivery_points').select('name, delivery_fee, delivery_method').eq('active', true).order('display_order').limit(1).maybeSingle();
    if (pointError) {
      await check(206, 'R2G active delivery point lookup', 'customer', 'SELECT delivery_points (active)', false, false, pointError.message);
    } else if (!point) {
      await check(206, 'R2G skipped: no active delivery point available', 'customer', 'INSERT with active delivery point fee check', false, true, null);
    } else {
      const correctFee = Number(point.delivery_fee);
      const wrongFee = correctFee + 1;
      const g = await tryInsert(customerClient, {
        ...base,
        order_summary: { ...base.order_summary, orderRef: `E2E-PAY-${runId}-R2G` },
        delivery_point_name: point.name,
        delivery_method: point.delivery_method ?? '',
        subtotal: 35, delivery_fee: wrongFee, total: 35 + wrongFee,
      });
      await check(206, 'customer INSERT with active delivery point but wrong delivery_fee is BLOCKED', 'customer', `INSERT Orders SET delivery_point_name="${point.name}", delivery_fee=${wrongFee} (authoritative ${correctFee})`, true, g.allowed, 'CONFIRMED DEFECT: customer INSERT can under-pay delivery fee for a known point');
    }

    // H: legitimate checkout-style INSERT is ALLOWED (control) and persists Pending.
    const h = await tryInsert(customerClient, { ...base, order_summary: { ...base.order_summary, orderRef: `E2E-PAY-${runId}-R2H` } });
    if (h.allowed && h.row) {
      const row = await readOrder(h.row.id);
      assertEqual(207, 'R2H legitimate checkout INSERT persists Pending', row.payment_status, 'Pending');
      assertEqual(207, 'R2H legitimate checkout INSERT keeps paid_at NULL', row.paid_at, null);
      assertEqual(207, 'R2H legitimate checkout INSERT keeps paid_by NULL', row.paid_by, null);
    } else {
      await check(207, 'legitimate checkout-style customer INSERT is ALLOWED', 'customer', 'INSERT Orders (checkout payload)', false, h.allowed, `unexpected reject: ${h.error}`);
    }

    // I: service-role INSERT of a Paid order remains ALLOWED (test seeding path).
    const i = await tryInsert(service, {
      ...base,
      order_summary: { ...base.order_summary, orderRef: `E2E-PAY-${runId}-R2I` },
      user_id: customer.id,
      payment_status: 'Paid',
      paid_at: nowIso,
      paid_by: adminUid ?? customer.id,
    });
    await check(208, 'service-role INSERT of a Paid order is ALLOWED', 'service', 'INSERT Orders SET payment_status="Paid", paid_at, paid_by (service key)', false, i.allowed, i.error ? `unexpected reject: ${i.error}` : null);
  }

  // ── LEGITIMATE SUPPLIER WORKFLOW (S8..S12) on orderMain → Ready To Pay ────
  const weights = { '1': 0.75 };
  const finalRevenue = 20 + 30 * 0.75;
  const finalCost = 8 + 18 * 0.75;
  const finalProfit = finalRevenue - finalCost;
  const finalTotal = finalRevenue + 6.5;
  {
    const { error } = await supplierClient.from('Orders').update({
      supplier_weights: weights, total: finalTotal, order_items: checkoutItems(runId),
      gross_profit: finalProfit, payment_status: 'Ready To Pay',
      updated_at: new Date().toISOString(), updated_by: supplier.id,
    }).eq('id', orderMain);
    if (error) throw new Error(`supplier legit update on orderMain failed: ${error.message}`);
    const row = await readOrder(orderMain);
    assertEqual(12, 'S12 supplier transition Pending -> Ready To Pay', row.payment_status, 'Ready To Pay');
    assertEqual(8, 'S8 supplier_weights persisted before Paid', num(row.supplier_weights?.['1'] as number), 0.75);
    assertEqual(9, 'S9 order_items persisted (recomputed) before Paid', (row.order_items ?? []).length, 2);
    assertEqual(10, 'S10 total recomputed before Paid', num(row.total), num(finalTotal));
    assertEqual(11, 'S11 gross_profit recomputed before Paid', num(row.gross_profit), num(finalProfit));
    assertEqual(12, 'S12 updated_by recorded', row.updated_by, supplier.id);
  }

  // Same supplier legit transition, so attacker tests start from Ready To Pay.
  for (const id of [orderSup, orderPaid, orderPaidPen]) {
    const { error } = await supplierClient.from('Orders').update({
      supplier_weights: weights, total: finalTotal, order_items: checkoutItems(runId),
      gross_profit: finalProfit, payment_status: 'Ready To Pay',
      updated_at: new Date().toISOString(), updated_by: supplier.id,
    }).eq('id', id);
    if (error) throw new Error(`supplier legit update on order ${id} failed: ${error.message}`);
    const row = await readOrder(id);
    assertEqual(12, `order ${id} ready to pay for subsequent tests`, row.payment_status, 'Ready To Pay');
  }

  // ── S1..S3: SUPPLIER paid-field attacks on a Ready To Pay order ──────────
  {
    const r1 = await tryUpdate(supplierClient, orderSup, { payment_status: 'Paid' });
    await check(1, 'supplier cannot set payment_status=Paid', 'supplier', 'UPDATE Orders SET payment_status = "Paid" (Ready To Pay order)', true, r1.allowed, 'CONFIRMED DEFECT: supplier_update_orders (is_supplier) allows supplier to set Paid');
    const r2 = await tryUpdate(supplierClient, orderSup, { paid_at: nowIso });
    await check(2, 'supplier cannot set paid_at', 'supplier', 'UPDATE Orders SET paid_at=now()', true, r2.allowed, 'CONFIRMED DEFECT: supplier_update_orders (is_supplier) allows supplier to write paid_at');
    const r3 = await tryUpdate(supplierClient, orderSup, { paid_by: supplier.id });
    await check(3, 'supplier cannot set paid_by', 'supplier', 'UPDATE Orders SET paid_by=<supplier-id>', true, r3.allowed, 'CONFIRMED DEFECT: supplier_update_orders (is_supplier) allows supplier to write paid_by');
  }

  // ── S4: SUPPLIER bypasses Pending -> Ready To Pay -> Paid ────────────────
  {
    const r = await tryUpdate(supplierClient, orderBypass, { payment_status: 'Paid', paid_at: nowIso, paid_by: supplier.id });
    const after = await readOrder(orderBypass);
    await check(4, 'supplier cannot bypass Pending -> Ready To Pay -> Paid', 'supplier', 'UPDATE Orders SET payment_status="Paid", paid_at, paid_by (Pending order)', true, r.allowed, after.payment_status === 'Paid' && after.paid_by === supplier.id ? 'CONFIRMED DEFECT: supplier moved a Pending order straight to Paid' : null);
  }

  // ── S13..S15, S13-preserved, admin happy path on orderMain ────────────────
  const f1 = await readOrder(orderMain);
  await adminConfirmPaid(adminClient, orderMain, adminUid!);
  console.log(`PASS [S13] admin can transition Ready To Pay -> Paid`);
  passes += 1;

  const f2 = await readOrder(orderMain);
  assertEqual(13, 'S13 admin confirmation set payment_status=Paid', f2.payment_status, 'Paid');
  {
    const paidAtMs = f2.paid_at ? new Date(f2.paid_at).getTime() : 0;
    const drift = Math.abs(Date.now() - paidAtMs);
    if (f2.paid_at && drift < 120000) { passes += 1; console.log(`PASS [S14] paid_at populated correctly (${String(f2.paid_at)}, drift ${drift}ms)`); }
    else {
      failures += 1;
      console.log(`FAIL [S14] paid_at populated correctly: got ${String(f2.paid_at)} (null or drift ${drift}ms)`);
      failuresLog.push({ scenario: 14, label: 'admin paid_at populated', role: 'admin', operation: 'UPDATE Orders SET paid_at=now()', expected: 'set (recent)', actual: String(f2.paid_at), defect: false });
    }
  }
  if (f2.paid_by && f2.paid_by === adminUid) { passes += 1; console.log(`PASS [S15] paid_by = admin auth.uid() (${f2.paid_by})`); }
  else {
    failures += 1;
    console.log(`FAIL [S15] paid_by = admin auth.uid(): expected ${String(adminUid)}, got ${String(f2.paid_by)}`);
    failuresLog.push({ scenario: 15, label: 'paid_by = auth.uid()', role: 'admin', operation: 'UPDATE Orders SET paid_by=auth.uid()', expected: String(adminUid), actual: String(f2.paid_by), defect: false });
  }
  {
    const moneyUnchanged =
      num(f2.revenue) === num(f1.revenue) && num(f2.supplier_cost) === num(f1.supplier_cost) &&
      num(f2.gross_profit) === num(f1.gross_profit) && num(f2.total) === num(f1.total) &&
      num(f2.frozen_total) === num(f1.frozen_total);
    if (moneyUnchanged) { passes += 1; console.log(`PASS [S13] financial values unchanged across admin Paid (rev=${String(f2.revenue)}, profit=${String(f2.gross_profit)})`); }
    else {
      failures += 1;
      console.log('FAIL [S13] financials changed across the Paid transition');
      failuresLog.push({ scenario: 13, label: 'financial preserved across Paid', role: 'admin', operation: 'READ Orders after Paid', expected: 'unchanged', actual: 'changed', defect: true });
    }
  }

  // ── S17/S18: delivery/dispatch regression on the PAID order ──────────────
  {
    const p1 = await supplierClient.rpc('supplier_start_packing_order', { p_order_id: orderMain });
    if (p1.error) { failures += 1; console.log(`FAIL [S17] supplier_start_packing_order on Paid order: ${p1.error.message}`); failuresLog.push({ scenario: 17, label: 'Paid order can perform supplier packing', role: 'supplier', operation: 'rpc supplier_start_packing_order', expected: 'ALLOWED', actual: `error: ${p1.error.message}`, defect: false }); }
    else {
      const row = await readOrder(orderMain);
      if (row.packing_started_at) { passes += 1; console.log('PASS [S17] Paid order: supplier_start_packing_order succeeded (packing_started_at set)'); }
      else { failures += 1; console.log('FAIL [S17] packing_started_at not set'); failuresLog.push({ scenario: 17, label: 'Paid order can perform supplier packing', role: 'supplier', operation: 'rpc supplier_start_packing_order', expected: 'set', actual: 'null', defect: false }); }
    }
    const p2 = await supplierClient.rpc('supplier_complete_packing_order', { p_order_id: orderMain });
    if (!p2.error) {
      const row = await readOrder(orderMain);
      if (row.packing_completed_at) { passes += 1; console.log('PASS [S17] Paid order: supplier_complete_packing_order succeeded'); }
      else { failures += 1; console.log('FAIL [S17] packing_completed_at not set'); failuresLog.push({ scenario: 17, label: 'Paid order packing complete', role: 'supplier', operation: 'rpc supplier_complete_packing_order', expected: 'set', actual: 'null', defect: false }); }
    } else { failures += 1; console.log(`FAIL [S17] supplier_complete_packing_order: ${p2.error.message}`); failuresLog.push({ scenario: 17, label: 'Paid order packing complete', role: 'supplier', operation: 'rpc supplier_complete_packing_order', expected: 'ALLOWED', actual: p2.error.message, defect: false }); }
    const p3 = await supplierClient.rpc('supplier_book_lalamove_order', { p_order_id: orderMain, p_tracking_url: 'https://example.com/e2e-tracking', p_booking_reference: `E2E-${runId}` });
    if (!p3.error) {
      const row = await readOrder(orderMain);
      if (row.lalamove_tracking_url && row.supplier_dispatch_started_at) { passes += 1; console.log('PASS [S17] Paid order: supplier_book_lalamove_order succeeded (dispatch started)'); }
      else { failures += 1; console.log('FAIL [S17] lalamove booking fields not set'); failuresLog.push({ scenario: 17, label: 'Paid order lalamove booking', role: 'supplier', operation: 'rpc supplier_book_lalamove_order', expected: 'set', actual: 'null', defect: false }); }
    } else { failures += 1; console.log(`FAIL [S17] supplier_book_lalamove_order: ${p3.error.message}`); failuresLog.push({ scenario: 17, label: 'Paid order lalamove booking', role: 'supplier', operation: 'rpc supplier_book_lalamove_order', expected: 'ALLOWED', actual: p3.error.message, defect: false }); }
    const p4 = await adminClient.rpc('admin_confirm_order_arrival', { p_order_id: orderMain });
    if (!p4.error) {
      const row = await readOrder(orderMain);
      if (row.supplier_dispatch_completed_at) { passes += 1; console.log('PASS [S17] Paid order: admin_confirm_order_arrival succeeded'); }
      else { failures += 1; console.log('FAIL [S17] supplier_dispatch_completed_at not set'); failuresLog.push({ scenario: 17, label: 'Paid order hub arrival', role: 'admin', operation: 'rpc admin_confirm_order_arrival', expected: 'set', actual: 'null', defect: false }); }
    } else { failures += 1; console.log(`FAIL [S17] admin_confirm_order_arrival: ${p4.error.message}`); failuresLog.push({ scenario: 17, label: 'Paid order hub arrival', role: 'admin', operation: 'rpc admin_confirm_order_arrival', expected: 'ALLOWED', actual: p4.error.message, defect: false }); }
    const p5 = await adminClient.rpc('admin_mark_order_ready_for_rider', { p_order_id: orderMain });
    if (!p5.error) {
      const row = await readOrder(orderMain);
      if (row.ready_for_rider_at) { passes += 1; console.log('PASS [S18] Paid order: admin_mark_order_ready_for_rider succeeded'); }
      else { failures += 1; console.log('FAIL [S18] ready_for_rider_at not set'); failuresLog.push({ scenario: 18, label: 'Paid order ready for rider', role: 'admin', operation: 'rpc admin_mark_order_ready_for_rider', expected: 'set', actual: 'null', defect: false }); }
    } else { failures += 1; console.log(`FAIL [S18] admin_mark_order_ready_for_rider: ${p5.error.message}`); failuresLog.push({ scenario: 18, label: 'Paid order ready for rider', role: 'admin', operation: 'rpc admin_mark_order_ready_for_rider', expected: 'ALLOWED', actual: p5.error.message, defect: false }); }
    const p6 = await riderClient.rpc('rider_update_delivery_status', { p_order_id: orderMain, p_status: 'arrived' });
    if (!p6.error) {
      const row = await readOrder(orderMain);
      if (row.delivery_status === 'arrived') { passes += 1; console.log('PASS [S18] Paid order: REAL rider rider_update_delivery_status(arrived)'); }
      else { failures += 1; console.log(`FAIL [S18] delivery_status=arrived: got ${String(row.delivery_status)}`); failuresLog.push({ scenario: 18, label: 'Paid order rider arrived', role: 'delivery_rider', operation: 'rpc rider_update_delivery_status arrived', expected: 'arrived', actual: String(row.delivery_status), defect: false }); }
    } else { failures += 1; console.log(`FAIL [S18] rider_update_delivery_status(arrived) via real rider: ${p6.error.message}`); failuresLog.push({ scenario: 18, label: 'Paid order rider arrived', role: 'delivery_rider', operation: 'rpc rider_update_delivery_status arrived', expected: 'ALLOWED', actual: p6.error.message, defect: false }); }
    const p7 = await riderClient.rpc('rider_update_delivery_status', { p_order_id: orderMain, p_status: 'delivered' });
    if (!p7.error) {
      const row = await readOrder(orderMain);
      if (row.delivery_status === 'delivered') { passes += 1; console.log('PASS [S18] Paid order: REAL rider rider_update_delivery_status(delivered)'); }
      else { failures += 1; console.log(`FAIL [S18] delivery_status=delivered: got ${String(row.delivery_status)}`); failuresLog.push({ scenario: 18, label: 'Paid order rider delivered', role: 'delivery_rider', operation: 'rpc rider_update_delivery_status delivered', expected: 'delivered', actual: String(row.delivery_status), defect: false }); }
    } else { failures += 1; console.log(`FAIL [S18] rider_update_delivery_status(delivered) via real rider: ${p7.error.message}`); failuresLog.push({ scenario: 18, label: 'Paid order rider delivered', role: 'delivery_rider', operation: 'rpc rider_update_delivery_status delivered', expected: 'ALLOWED', actual: p7.error.message, defect: false }); }
  }

  // ── Prepare orderPaid / orderPaidPen as admin-confirmed PAID orders ──────
  await adminConfirmPaid(adminClient, orderPaid, adminUid!);
  await adminConfirmPaid(adminClient, orderPaidPen, adminUid!);
  assertEqual(0, 'orderPaid is Paid for immutability tests', (await readOrder(orderPaid)).payment_status, 'Paid');
  assertEqual(0, 'orderPaidPen is Paid for immutability tests', (await readOrder(orderPaidPen)).payment_status, 'Paid');

  // ── S7 / S16: financial fields immutable once Paid (supplier + admin) ────
  {
    const preProfit = (await readOrder(orderPaid)).gross_profit;
    const r7 = await tryUpdate(supplierClient, orderPaid, { gross_profit: 1.99 });
    const after = await readOrder(orderPaid);
    const mutated = num(after.gross_profit) === 1.99;
    if (r7.allowed && mutated) {
      failures += 1;
      console.log(`FAIL [S7] supplier cannot modify protected financial fields after Paid: UPDATE gross_profit=1.99 -> ALLOWED, profit ${String(preProfit)} -> 1.99 | CONFIRMED DEFECT`);
      failuresLog.push({ scenario: 7, label: 'protected financial fields immutable after Paid', role: 'supplier', operation: 'UPDATE Orders SET gross_profit=1.99 (Paid)', expected: 'BLOCKED', actual: 'ALLOWED (mutated)', defect: true });
    } else if (!r7.allowed) { passes += 1; console.log('PASS [S7] supplier cannot modify protected financial fields after Paid (blocked)'); }
    else { failures += 1; console.log(`FAIL [S7] supplier financial write inconclusive (mutated=${mutated})`); failuresLog.push({ scenario: 7, label: 'protected financial fields immutable after Paid', role: 'supplier', operation: 'UPDATE Orders SET gross_profit=1.99 (Paid)', expected: 'BLOCKED', actual: 'inconclusive', defect: true }); }
  }
  {
    const r16 = await tryUpdate(adminClient, orderPaid, { gross_profit: 5.55 });
    if (!r16.allowed) { passes += 1; console.log('PASS [S16] admin cannot modify protected financial fields after Paid (blocked)'); }
    else {
      failures += 1;
      console.log('FAIL [S16] admin cannot modify protected financial fields after Paid: UPDATE gross_profit=5.55 -> ALLOWED | CONFIRMED DEFECT');
      failuresLog.push({ scenario: 16, label: 'admin cannot modify financials after Paid', role: 'admin', operation: 'UPDATE Orders SET gross_profit=5.55 (Paid)', expected: 'BLOCKED', actual: 'ALLOWED (mutated)', defect: true });
    }
  }

  // ── S5: supplier cannot revert Paid -> Ready To Pay (orderPaid) ─────────
  {
    const r = await tryUpdate(supplierClient, orderPaid, { payment_status: 'Ready To Pay' });
    await check(5, 'supplier cannot revert Paid -> Ready To Pay', 'supplier', 'UPDATE Orders SET payment_status = "Ready To Pay" (Paid)', true, r.allowed, 'CONFIRMED DEFECT: freeze_order_pricing only locks recompute; supplier can un-freeze a Paid order');
    const af = await readOrder(orderPaid);
    console.log(`INFO [S5] orderPaid status after revert attempt: ${af.payment_status}`);
  }

  // ── S6: supplier cannot revert Paid -> Pending (orderPaidPen) ────────────
  {
    const r = await tryUpdate(supplierClient, orderPaidPen, { payment_status: 'Pending' });
    await check(6, 'supplier cannot revert Paid -> Pending', 'supplier', 'UPDATE Orders SET payment_status = "Pending" (Paid)', true, r.allowed, 'CONFIRMED DEFECT: supplier can move a Paid order backward');
    const af = await readOrder(orderPaidPen);
    console.log(`INFO [S6] orderPaidPen status after revert attempt: ${af.payment_status}`);
  }

  // ── RETAINED: customer cannot revert a Paid order (orderPaidPen) ─────────
  {
    const r = await tryUpdate(customerClient, orderPaidPen, { payment_status: 'Pending' });
    await check(103, 'customer cannot revert a Paid order', 'customer', 'UPDATE Orders SET payment_status=Pending (Paid)', true, r.allowed, null);
  }
}

void main()
  .catch((error) => { failures += 1; console.error(`FATAL: ${error instanceof Error ? error.message : String(error)}`); })
  .finally(async () => {
    await cleanup();
    console.log('\n════════ PHASE 9 PAYMENT INTEGRITY RESULT ════════');
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
    console.log(failures === 0 ? 'ALL PAYMENT INTEGRITY CHECKS PASS (guard enforced)' : 'PAYMENT INTEGRITY DEFECTS PRESENT (guard not enforced)');
    if (failures > 0) process.exitCode = 1;
  });
