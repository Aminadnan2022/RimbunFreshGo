import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Role = 'admin' | 'customer' | 'supplier' | 'delivery_rider';
type TestUser = { id: string; email: string; password: string; role: Role };
type OrderRow = {
  id: number;
  user_id: string;
  full_name: string;
  payment_status: string;
  paid_at: string | null;
  paid_by: string | null;
  subtotal: number | string;
  total: number | string;
  revenue: number | string;
  gross_profit: number | string;
  updated_by: string | null;
  supplier_weights: Record<string, number> | null;
  delivery_status: string | null;
  lalamove_tracking_url: string | null;
  booking_reference: string | null;
  lalamove_booked_at: string | null;
  packing_started_at: string | null;
  packing_completed_at: string | null;
  supplier_dispatch_started_at: string | null;
  supplier_dispatch_completed_at: string | null;
  ready_for_rider_at: string | null;
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
const findings: string[] = [];

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
  const email = `${role}.r4-${runId.toLowerCase()}@example.com`;
  const password = `R4E2E!${randomBytes(18).toString('base64url')}`;
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
    { productId: `e2e-r4-fixed-${runId}`, name: 'E2E R4 Fixed', price: 10, costPrice: 4, unit: 'pack', quantity: 2, pricingType: 'fixed' },
    { productId: `e2e-r4-kg-${runId}`, name: 'E2E R4 Per Kg', price: 30, costPrice: 18, unit: 'kg', quantity: 1, estimatedWeight: 0.5, pricingType: 'per_kg' },
  ];
}

function checkoutPayload(runId: string): Record<string, unknown> {
  const now = new Date().toISOString();
  const items = checkoutItems(runId);
  return {
    full_name: 'E2E R4 Customer', phone_number: '0123456789', email_address: `r4-${runId.toLowerCase()}@example.com`,
    street_address: '', postcode: '', city: '', state: 'Selangor', apartment: 'E2E R4 Apt', house_unit: 'E2E-04-04',
    pickup_location: 'E2E R4 Location', delivery_point_name: 'E2E R4 Location', delivery_method: 'pickup',
    order_notes: `R4 E2E ${runId}`, item_options: items.map(({ productId, name }) => ({ productId, name, preparation: null })),
    order_items: items, delivery_slot: 'E2E TEST',
    order_summary: { status: 'confirmed', deliveryDate: now.slice(0, 10), deliveryWindow: 'E2E TEST', statusTimeline: [], orderRef: `E2E-R4-${runId}` },
    subtotal: 35, delivery_fee: 6.5, total: 41.5, gross_profit: 0,
  };
}

const ORDER_FIELDS = 'id,user_id,full_name,payment_status,paid_at,paid_by,subtotal,total,revenue,gross_profit,updated_by,supplier_weights,delivery_status,lalamove_tracking_url,booking_reference,lalamove_booked_at,packing_started_at,packing_completed_at,supplier_dispatch_started_at,supplier_dispatch_completed_at,ready_for_rider_at';

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

async function col(id: number, column: keyof OrderRow): Promise<unknown> {
  const { data, error } = await service.from('Orders').select(column as string).eq('id', id).maybeSingle();
  if (error || !data) return null;
  return (data as unknown as Record<string, unknown>)[column as string];
}

async function tryUpdate(client: SupabaseClient, id: number, changes: Record<string, unknown>): Promise<{ allowed: boolean; error: string | null }> {
  const { data, error } = await client.from('Orders').update(changes).eq('id', id).select('id');
  const allowed = !error && Array.isArray(data) && data.length > 0;
  return { allowed, error: error ? error.message : null };
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

function assertTrue(scenario: number, label: string, ok: boolean, detail?: string): void {
  if (ok) {
    passes += 1;
    console.log(`PASS [S${scenario}] ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL [S${scenario}] ${label}${detail ? `: ${detail}` : ''}`);
    failuresLog.push({ scenario, label, role: 'n/a', operation: label, expected: 'true', actual: detail ?? 'false', defect: false });
  }
}

async function supplierLegitToReadyToPay(supplierClient: SupabaseClient, id: number, runId: string, updatedBy: string | null): Promise<void> {
  const weights = { '1': 0.75 };
  const finalRevenue = 20 + 30 * 0.75;
  const finalCost = 8 + 18 * 0.75;
  const finalProfit = finalRevenue - finalCost;
  const finalTotal = finalRevenue + 6.5;
  const { error } = await supplierClient.from('Orders').update({
    supplier_weights: weights, total: finalTotal, order_items: checkoutItems(runId),
    gross_profit: finalProfit, payment_status: 'Ready To Pay',
    updated_at: new Date().toISOString(), updated_by: updatedBy,
  }).eq('id', id);
  if (error) throw new Error(`supplier legit update on order ${id} failed: ${error.message}`);
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

  // ── SECURITY DEFINER CONTEXT VERIFICATION ────────────────────────────────
  console.log('\n════════ [0] SECURITY DEFINER / INVOKER CONTEXT PROBE ════════');
  const directProbe = await supplierClient.rpc('r4_context_probe_direct');
  const definerProbe = await supplierClient.rpc('r4_context_probe');

  if (directProbe.error) {
    await check(0, 'direct probe callable', 'supplier', 'rpc r4_context_probe_direct', false, false, directProbe.error.message);
  } else {
    const d = directProbe.data as unknown as Record<string, unknown>;
    assertEqual(0, 'direct context current_user = authenticated', d.current_user, 'authenticated');
    assertEqual(0, 'direct context session_user = authenticator (Supabase proxy role)', d.session_user, 'authenticator');
    assertTrue(0, 'direct context current_user <> session_user (Supabase SET ROLE)', d.current_user !== d.session_user, `current_user=${String(d.current_user)}, session_user=${String(d.session_user)}`);
    assertEqual(0, 'direct context auth.uid() = supplier id', d.auth_uid, supplier.id);
    assertEqual(0, 'direct context is_supplier = true', d.is_supplier, true);
    assertEqual(0, 'direct context is_admin = false', d.is_admin, false);
  }

  if (definerProbe.error) {
    await check(0, 'definer probe callable', 'supplier', 'rpc r4_context_probe', false, false, definerProbe.error.message);
  } else {
    const d = definerProbe.data as unknown as Record<string, unknown>;
    assertEqual(0, 'definer context current_user = postgres (function owner)', d.current_user, 'postgres');
    assertEqual(0, 'definer context session_user = authenticator (Supabase proxy role)', d.session_user, 'authenticator');
    assertTrue(0, 'definer context current_user <> session_user', d.current_user !== d.session_user, `current_user=${String(d.current_user)}, session_user=${String(d.session_user)}`);
    assertEqual(0, 'definer context auth.uid() = supplier id', d.auth_uid, supplier.id);
    assertEqual(0, 'definer context is_supplier = true', d.is_supplier, true);
    assertEqual(0, 'definer context is_admin = false', d.is_admin, false);
  }

  // ── TRIGGER ORDER VERIFICATION ───────────────────────────────────────────
  console.log('\n════════ TRIGGER ORDER (live pg_trigger via r4_trigger_order) ════════');
  const triggerRes = await supplierClient.rpc('r4_trigger_order');
  if (triggerRes.error) {
    await check(0, 'r4_trigger_order callable', 'supplier', 'rpc r4_trigger_order', false, false, triggerRes.error.message);
  } else {
    const names = Array.isArray(triggerRes.data) ? (triggerRes.data as string[]) : [];
    const idx = (n: string) => names.indexOf(n);
    assertTrue(0, `trigger list contains trg_aa_guard_order_supplier_allowlist`, idx('trg_aa_guard_order_supplier_allowlist') >= 0, `list=${JSON.stringify(names)}`);
    assertTrue(0, `trigger list contains trg_zz_guard_order_timestamps`, idx('trg_zz_guard_order_timestamps') >= 0, `list=${JSON.stringify(names)}`);
    const orderOk =
      idx('trg_aa_guard_order_supplier_allowlist') >= 0 &&
      idx('trg_aa_guard_order_supplier_allowlist') < idx('trg_freeze_order_pricing') &&
      idx('trg_freeze_order_pricing') < idx('trg_guard_order_payment') &&
      idx('trg_guard_order_payment') < idx('trg_zz_guard_order_timestamps');
    assertTrue(0, 'UPDATE trigger order: aa < freeze < guard < zz', orderOk, `list=${JSON.stringify(names)}`);
  }

  // ── ORDER A: R4-A blocked columns + packing direct writes + admin Paid ───
  const orderA = await createOrder(customerClient, runId);
  console.log(`\ncreated orderA=${orderA} (Pending)`);
  {
    const beforeA = await readOrder(orderA);
    assertEqual(0, 'orderA starts Pending', beforeA.payment_status, 'Pending');

    console.log('\n════════ [R4-A] SUPPLIER BLOCKED REPRESENTATIVE COLUMNS ════════');
    const blockedCases: Array<{ col: keyof OrderRow; change: Record<string, unknown>; expect: unknown }> = [
      { col: 'full_name', change: { full_name: 'HACKED NAME' }, expect: 'E2E R4 Customer' },
      { col: 'revenue', change: { revenue: 0 }, expect: num(beforeA.revenue) },
      { col: 'subtotal', change: { subtotal: 1 }, expect: num(beforeA.subtotal) },
      { col: 'paid_at', change: { paid_at: new Date().toISOString() }, expect: null },
      { col: 'delivery_status', change: { delivery_status: 'delivered' }, expect: 'pending' },
      { col: 'lalamove_tracking_url', change: { lalamove_tracking_url: 'https://example.com/hack' }, expect: null },
      { col: 'ready_for_rider_at', change: { ready_for_rider_at: new Date().toISOString() }, expect: null },
      { col: 'user_id', change: { user_id: supplier.id }, expect: customer.id },
    ];
    for (let i = 0; i < blockedCases.length; i += 1) {
      const c = blockedCases[i];
      const r = await tryUpdate(supplierClient, orderA, c.change);
      await check(20 + i, `supplier cannot update ${c.col as string}`, 'supplier', `UPDATE Orders SET ${c.col as string}`, true, r.allowed, null);
      const after = await col(orderA, c.col);
      if (c.expect === null) {
        assertEqual(20 + i, `${c.col as string} remains NULL after blocked attempt`, after, null);
      } else {
        const actual = typeof c.expect === 'number'
          ? num(after as number | string | null)
          : after;
        assertEqual(20 + i, `${c.col as string} original value unchanged`, actual, c.expect);
      }
    }

    console.log('\n════════ [R4-A] SUPPLIER PACKING DIRECT WRITES (allowlisted) ════════');
    const packingStart = new Date().toISOString();
    const rp1 = await tryUpdate(supplierClient, orderA, { packing_started_at: packingStart });
    await check(10, 'supplier can set packing_started_at (NULL -> value)', 'supplier', 'UPDATE Orders SET packing_started_at=now()', false, rp1.allowed, null);
    const packingComplete = new Date().toISOString();
    const rp2 = await tryUpdate(supplierClient, orderA, { packing_completed_at: packingComplete });
    await check(11, 'supplier can set packing_completed_at (NULL -> value)', 'supplier', 'UPDATE Orders SET packing_completed_at=now()', false, rp2.allowed, null);
    assertTrue(11, 'packing_started_at persisted', (await col(orderA, 'packing_started_at')) !== null);
    assertTrue(11, 'packing_completed_at persisted', (await col(orderA, 'packing_completed_at')) !== null);

    console.log('\n════════ [R4-A] SUPPLIER LEGIT WEIGHT-SAVE SHAPE (Pending -> Ready To Pay) ════════');
    await supplierLegitToReadyToPay(supplierClient, orderA, runId, supplier.id);
    const rowA = await readOrder(orderA);
    assertEqual(12, 'S12 supplier legit weight save: Pending -> Ready To Pay', rowA.payment_status, 'Ready To Pay');
    assertEqual(12, 'S12 supplier_weights persisted', num(rowA.supplier_weights?.['1'] as number), 0.75);
    assertEqual(12, 'S12 total recomputed', num(rowA.total), num(42.5 + 6.5));
    assertEqual(12, 'S12 gross_profit recomputed', num(rowA.gross_profit), num(21));
    assertEqual(12, 'S12 updated_by recorded', rowA.updated_by, supplier.id);

    console.log('\n════════ [R4-A] ADMIN PRIVILEGED FIELDS STILL WORK ════════');
    await adminConfirmPaid(adminClient, orderA, admin.id);
    const rowAPaid = await readOrder(orderA);
    assertEqual(13, 'admin can set payment_status=Paid', rowAPaid.payment_status, 'Paid');
    assertTrue(13, 'admin paid_at populated', rowAPaid.paid_at !== null, String(rowAPaid.paid_at));
    assertEqual(13, 'admin paid_by recorded', rowAPaid.paid_by, admin.id);
  }

  // ── ORDER B: full workflow -> Paid + all 5 timestamps -> R4-B tests ──────
  const orderB = await createOrder(customerClient, runId);
  console.log(`\ncreated orderB=${orderB}`);
  {
    await supplierLegitToReadyToPay(supplierClient, orderB, runId, supplier.id);
    await adminConfirmPaid(adminClient, orderB, admin.id);
    assertEqual(0, 'orderB Paid before workflow', (await readOrder(orderB)).payment_status, 'Paid');

    console.log('\n════════ [RPC] supplier_start_packing_order (set + idempotent) ════════');
    const b1 = await supplierClient.rpc('supplier_start_packing_order', { p_order_id: orderB });
    if (b1.error) { await check(30, 'supplier_start_packing_order first call', 'supplier', 'rpc supplier_start_packing_order', false, false, b1.error.message); }
    else {
      assertTrue(30, 'packing_started_at set from NULL by RPC', (await col(orderB, 'packing_started_at')) !== null);
      const t1 = await col(orderB, 'packing_started_at');
      const b2 = await supplierClient.rpc('supplier_start_packing_order', { p_order_id: orderB });
      if (b2.error) { await check(30, 'supplier_start_packing_order second call no-op', 'supplier', 'rpc supplier_start_packing_order x2', false, false, b2.error.message); }
      else assertEqual(30, 'supplier_start_packing_order 2nd call does not alter packing_started_at', String(await col(orderB, 'packing_started_at')), String(t1));
    }

    console.log('\n════════ [RPC] supplier_complete_packing_order (set + idempotent) ════════');
    const c1 = await supplierClient.rpc('supplier_complete_packing_order', { p_order_id: orderB });
    if (c1.error) { await check(30, 'supplier_complete_packing_order first call', 'supplier', 'rpc supplier_complete_packing_order', false, false, c1.error.message); }
    else {
      assertTrue(30, 'packing_completed_at set from NULL by RPC', (await col(orderB, 'packing_completed_at')) !== null);
      const t1 = await col(orderB, 'packing_completed_at');
      const c2 = await supplierClient.rpc('supplier_complete_packing_order', { p_order_id: orderB });
      if (c2.error) { await check(30, 'supplier_complete_packing_order second call no-op', 'supplier', 'rpc supplier_complete_packing_order x2', false, false, c2.error.message); }
      else assertEqual(30, 'supplier_complete_packing_order 2nd call does not alter packing_completed_at', String(await col(orderB, 'packing_completed_at')), String(t1));
    }

    console.log('\n════════ [R4-A/SECURITY DEFINER] supplier_book_lalamove_order bypasses allowlist ════════');
    const trackUrl = `https://example.com/r4/${runId}`;
    const bk = await supplierClient.rpc('supplier_book_lalamove_order', { p_order_id: orderB, p_tracking_url: trackUrl, p_booking_reference: `R4-${runId}` });
    if (bk.error) { await check(31, 'supplier_book_lalamove_order writes tracking fields via SECURITY DEFINER', 'supplier', 'rpc supplier_book_lalamove_order', false, false, bk.error.message); }
    else {
      assertEqual(31, 'supplier_dispatch_started_at set from NULL by RPC', (await col(orderB, 'supplier_dispatch_started_at')) !== null, true);
      assertEqual(31, 'lalamove_tracking_url written by definer RPC', await col(orderB, 'lalamove_tracking_url'), trackUrl);
      assertTrue(31, 'lalamove_booked_at written by definer RPC', (await col(orderB, 'lalamove_booked_at')) !== null);
    }

    console.log('\n════════ [RPC] admin_confirm_order_arrival (set + idempotent) ════════');
    const a1 = await adminClient.rpc('admin_confirm_order_arrival', { p_order_id: orderB });
    if (a1.error) { await check(30, 'admin_confirm_order_arrival first call', 'admin', 'rpc admin_confirm_order_arrival', false, false, a1.error.message); }
    else {
      assertTrue(30, 'supplier_dispatch_completed_at set from NULL by RPC', (await col(orderB, 'supplier_dispatch_completed_at')) !== null);
      const t1 = await col(orderB, 'supplier_dispatch_completed_at');
      const a2 = await adminClient.rpc('admin_confirm_order_arrival', { p_order_id: orderB });
      if (a2.error) { await check(30, 'admin_confirm_order_arrival second call no-op', 'admin', 'rpc admin_confirm_order_arrival x2', false, false, a2.error.message); }
      else assertEqual(30, 'admin_confirm_order_arrival 2nd call does not alter supplier_dispatch_completed_at', String(await col(orderB, 'supplier_dispatch_completed_at')), String(t1));
    }

    console.log('\n════════ [RPC] admin_mark_order_ready_for_rider (set) ════════');
    const m1 = await adminClient.rpc('admin_mark_order_ready_for_rider', { p_order_id: orderB });
    if (m1.error) { await check(31, 'admin_mark_order_ready_for_rider first call', 'admin', 'rpc admin_mark_order_ready_for_rider', false, false, m1.error.message); }
    else assertTrue(31, 'ready_for_rider_at set from NULL by RPC', (await col(orderB, 'ready_for_rider_at')) !== null);

    // ── R4-B: admin direct attempts on all 5 write-once timestamps ─────────
    console.log('\n════════ [R4-B] ADMIN DIRECT UPDATE WRITE-ONCE (all 5 timestamps) ════════');
    const adminTsCols: Array<keyof OrderRow> = [
      'packing_started_at',
      'packing_completed_at',
      'supplier_dispatch_started_at',
      'supplier_dispatch_completed_at',
      'ready_for_rider_at',
    ];
    for (let i = 0; i < adminTsCols.length; i += 1) {
      const c = adminTsCols[i];
      const orig = await col(orderB, c);
      const s = 40 + i;
      // identical value ALLOWED
      const rSame = await tryUpdate(adminClient, orderB, { [c]: orig });
      await check(s, `${c as string}: identical value ALLOWED (admin)`, 'admin', `UPDATE Orders SET ${c as string}=same`, false, rSame.allowed, null);
      // different value BLOCKED + preserved
      const rDiff = await tryUpdate(adminClient, orderB, { [c]: new Date(Date.now() + 86400000).toISOString() });
      await check(s, `${c as string}: different value BLOCKED (admin)`, 'admin', `UPDATE Orders SET ${c as string}=different`, true, rDiff.allowed, null);
      assertEqual(s, `${c as string} preserved after blocked rewrite (admin)`, String(await col(orderB, c)), String(orig));
      // NULL BLOCKED + preserved
      const rNull = await tryUpdate(adminClient, orderB, { [c]: null });
      await check(s, `${c as string}: NULL BLOCKED (admin)`, 'admin', `UPDATE Orders SET ${c as string}=null`, true, rNull.allowed, null);
      assertEqual(s, `${c as string} preserved after blocked NULL (admin)`, String(await col(orderB, c)), String(orig));
    }

    // ── R4-B: supplier direct attempts on the two allowlisted packing columns ─
    console.log('\n════════ [R4-B] SUPPLIER DIRECT UPDATE WRITE-ONCE (packing columns) ════════');
    const supplierTsCols: Array<keyof OrderRow> = ['packing_started_at', 'packing_completed_at'];
    for (let i = 0; i < supplierTsCols.length; i += 1) {
      const c = supplierTsCols[i];
      const orig = await col(orderB, c);
      const s = 50 + i;
      const rSame = await tryUpdate(supplierClient, orderB, { [c]: orig });
      await check(s, `${c as string}: identical value ALLOWED (supplier)`, 'supplier', `UPDATE Orders SET ${c as string}=same`, false, rSame.allowed, null);
      const rDiff = await tryUpdate(supplierClient, orderB, { [c]: new Date(Date.now() + 86400000).toISOString() });
      await check(s, `${c as string}: different value BLOCKED (supplier)`, 'supplier', `UPDATE Orders SET ${c as string}=different`, true, rDiff.allowed, null);
      assertEqual(s, `${c as string} preserved after blocked rewrite (supplier)`, String(await col(orderB, c)), String(orig));
      const rNull = await tryUpdate(supplierClient, orderB, { [c]: null });
      await check(s, `${c as string}: NULL BLOCKED (supplier)`, 'supplier', `UPDATE Orders SET ${c as string}=null`, true, rNull.allowed, null);
      assertEqual(s, `${c as string} preserved after blocked NULL (supplier)`, String(await col(orderB, c)), String(orig));
    }

    // ── R4-A: supplier cannot touch non-allowlisted workflow timestamps ──────
    console.log('\n════════ [R4-A] SUPPLIER BLOCKED ON NON-ALLOWLISTED TIMESTAMPS ════════');
    const nonAllowedTs: Array<keyof OrderRow> = ['supplier_dispatch_started_at', 'supplier_dispatch_completed_at', 'ready_for_rider_at'];
    for (let i = 0; i < nonAllowedTs.length; i += 1) {
      const c = nonAllowedTs[i];
      const orig = await col(orderB, c);
      const s = 60 + i;
      const r = await tryUpdate(supplierClient, orderB, { [c]: new Date(Date.now() + 86400000).toISOString() });
      await check(s, `${c as string}: supplier direct write BLOCKED (allowlist)`, 'supplier', `UPDATE Orders SET ${c as string}=different`, true, r.allowed, null);
      const isAllowlistGuard = r.error !== null && r.error.toLowerCase().includes('approved order workflow columns');
      assertTrue(s, `${c as string}: blocked by R4-A allowlist guard`, isAllowlistGuard, r.error ?? 'no error');
      assertEqual(s, `${c as string} preserved after blocked attempt (supplier)`, String(await col(orderB, c)), String(orig));
    }

    // ── RPC idempotency findings (documented, not changed) ──────────────────
    console.log('\n════════ [RPC FINDINGS] NON-IDEMPOTENT WORKFLOW RPCS ════════');
    const dsBefore = await col(orderB, 'supplier_dispatch_started_at');
    const bookedBefore = await col(orderB, 'lalamove_booked_at');
    const rebook = await supplierClient.rpc('supplier_book_lalamove_order', { p_order_id: orderB, p_tracking_url: 'https://example.com/r4-rebook', p_booking_reference: `R4-REBOOK-${runId}` });
    const dsAfter = await col(orderB, 'supplier_dispatch_started_at');
    const bookedAfter = await col(orderB, 'lalamove_booked_at');
    if (rebook.error) { console.log(`FINDING: supplier_book_lalamove_order 2nd call errored: ${rebook.error.message}`); }
    else {
      const changed = String(dsAfter) !== String(dsBefore) || String(bookedAfter) !== String(bookedBefore);
      findings.push(`supplier_book_lalamove_order second call ${changed ? 'REWRITES' : 'preserves'} supplier_dispatch_started_at/lalamove_booked_at (documented non-idempotent RPC; R4 leaves unchanged)`);
      console.log(`FINDING: supplier_book_lalamove_order 2nd call ${changed ? 'REWRITES' : 'preserves'} supplier_dispatch_started_at (before=${String(dsBefore)}, after=${String(dsAfter)})`);
    }
    const rfrBefore = await col(orderB, 'ready_for_rider_at');
    const mark2 = await adminClient.rpc('admin_mark_order_ready_for_rider', { p_order_id: orderB });
    const rfrAfter = await col(orderB, 'ready_for_rider_at');
    if (mark2.error) { console.log(`FINDING: admin_mark_order_ready_for_rider 2nd call errored: ${mark2.error.message}`); }
    else {
      const changed = String(rfrAfter) !== String(rfrBefore);
      findings.push(`admin_mark_order_ready_for_rider second call ${changed ? 'REWRITES' : 'preserves'} ready_for_rider_at (documented non-idempotent RPC; R4 leaves unchanged)`);
      console.log(`FINDING: admin_mark_order_ready_for_rider 2nd call ${changed ? 'REWRITES' : 'preserves'} ready_for_rider_at (before=${String(rfrBefore)}, after=${String(rfrAfter)})`);
    }
  }

  // ── ORDER C: rider_receive_order_at_hub idempotency ──────────────────────
  const orderC = await createOrder(customerClient, runId);
  console.log(`\ncreated orderC=${orderC}`);
  {
    await supplierLegitToReadyToPay(supplierClient, orderC, runId, supplier.id);
    await adminConfirmPaid(adminClient, orderC, admin.id);
    const e1 = await supplierClient.rpc('supplier_start_packing_order', { p_order_id: orderC });
    const e2 = await supplierClient.rpc('supplier_complete_packing_order', { p_order_id: orderC });
    const e3 = await supplierClient.rpc('supplier_book_lalamove_order', { p_order_id: orderC, p_tracking_url: `https://example.com/r4c/${runId}`, p_booking_reference: `R4C-${runId}` });
    if (e1.error || e2.error || e3.error) {
      await check(70, 'setup: packing + lalamove booking for rider path', 'supplier', 'rpc workflow setup', false, false, [e1.error, e2.error, e3.error].filter(Boolean).map((x) => (x as { message: string }).message).join('; '));
    } else {
      console.log('\n════════ [RPC] rider_receive_order_at_hub (set + idempotent) ════════');
      const r1 = await riderClient.rpc('rider_receive_order_at_hub', { p_order_id: orderC });
      if (r1.error) { await check(70, 'rider_receive_order_at_hub first call', 'delivery_rider', 'rpc rider_receive_order_at_hub', false, false, r1.error.message); }
      else {
        assertTrue(70, 'rider receive sets supplier_dispatch_completed_at', (await col(orderC, 'supplier_dispatch_completed_at')) !== null);
        assertTrue(70, 'rider receive sets ready_for_rider_at', (await col(orderC, 'ready_for_rider_at')) !== null);
        const t1 = await col(orderC, 'supplier_dispatch_completed_at');
        const r2 = await riderClient.rpc('rider_receive_order_at_hub', { p_order_id: orderC });
        if (r2.error) { await check(70, 'rider_receive_order_at_hub second call no-op', 'delivery_rider', 'rpc rider_receive_order_at_hub x2', false, false, r2.error.message); }
        else assertEqual(70, 'rider_receive_order_at_hub 2nd call does not alter supplier_dispatch_completed_at', String(await col(orderC, 'supplier_dispatch_completed_at')), String(t1));
      }
    }
  }
}

void main()
  .catch((error) => { failures += 1; console.error(`FATAL: ${error instanceof Error ? error.message : String(error)}`); })
  .finally(async () => {
    await cleanup();
    console.log('\n════════ R4 SUPPLIER WRITE GUARDS + WRITE-ONCE TIMESTAMPS RESULT ════════');
    console.log(`PASS count: ${passes}`);
    console.log(`FAIL count: ${failures}`);
    if (findings.length) {
      console.log('\nDOCUMENTED FINDINGS (reported separately, not R4 failures):');
      for (const f of findings) console.log(`- ${f}`);
    }
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
    console.log(failures === 0 ? 'ALL R4 CHECKS PASS (write guards enforced)' : 'R4 DEFECTS PRESENT (write guards not fully enforced)');
    if (failures > 0) process.exitCode = 1;
  });
