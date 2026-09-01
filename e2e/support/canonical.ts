import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, getServiceClient } from './fixtures.ts';
import { loadTestEnv, type TestRole } from './env.ts';

export type TestUser = Awaited<ReturnType<typeof createTestUser>>;

export type CanonicalCleanupSummary = {
  run_id: string;
  target_orders: number;
  sales_orders: number;
  [category: string]: string | number;
};

const CONCURRENCY_RUN_ID = /^E2E-\d{8}-[A-Z0-9]{6}-CONC(?:10|25|50)$/;

export function assertConcurrencyRunId(runId: string): void {
  if (!CONCURRENCY_RUN_ID.test(runId)) {
    throw new Error('Invalid E2E concurrency run id.');
  }
}

export function userClient(): SupabaseClient {
  const env = loadTestEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) throw new Error('Test Supabase configuration is incomplete.');
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createSignedInUser(role: TestRole, runId: string): Promise<{
  user: TestUser;
  client: SupabaseClient;
}> {
  const user = await createTestUser(role, runId);
  const client = userClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`signIn(${role}) failed: ${error.message}`);
  return { user, client };
}

export function nextWeekdayIso(targetDay = 3): string {
  const date = new Date();
  let offset = targetDay - date.getDay();
  if (offset <= 0) offset += 7;
  date.setDate(date.getDate() + offset);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function orderArgs(input: {
  email: string;
  items: Record<string, unknown>[];
  preparation?: Record<string, unknown>[];
  key?: string;
  deliveryDate?: string;
}) {
  const deliveryDate = input.deliveryDate ?? nextWeekdayIso();
  return {
    p_idempotency_key: input.key ?? randomUUID(),
    p_customer_snapshot: {
      name: 'FreshGo E2E Customer',
      phone: '0123456789',
      email: input.email,
      notes: 'isolated pre-launch test',
    },
    p_delivery_request: {
      method_code: 'normal_bulk',
      requested_date: deliveryDate,
      zone_code: 'residensi_rimbun',
      apartment: 'Residensi Rimbun',
      house_unit: 'E2E-01',
      delivery_point_name: 'Residensi Rimbun Lobby A',
      pickup_location: 'Residensi Rimbun Lobby A',
    },
    p_items: input.items,
    p_preparation_answers: input.preparation ?? [],
  };
}

export async function placeOrder(client: SupabaseClient, args: ReturnType<typeof orderArgs>) {
  const started = performance.now();
  const { data, error } = await client.rpc('place_sales_order', args);
  const durationMs = performance.now() - started;
  if (error) throw Object.assign(new Error(error.message), { code: error.code, details: error.details, durationMs });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.sales_order_id) throw new Error('place_sales_order returned no order.');
  return { ...row, durationMs } as Record<string, unknown> & { sales_order_id: string; order_number: string; durationMs: number };
}

export async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const started = performance.now();
  const { data, error } = await client.rpc(name, args);
  const durationMs = performance.now() - started;
  if (error) throw Object.assign(new Error(error.message), { code: error.code, details: error.details, durationMs });
  return { data, durationMs };
}

export async function uploadReceipt(client: SupabaseClient, orderId: string, label: string) {
  // Storage RLS intentionally accepts only {order UUID}/{file UUID}.{extension}.
  const path = `${orderId}/${randomUUID()}.png`;
  const bytes = new TextEncoder().encode(`FreshGo isolated E2E receipt: ${label}`);
  const { error } = await client.storage.from('sales-order-payment-receipts').upload(path, bytes, {
    contentType: 'image/png',
    upsert: false,
  });
  if (error) throw new Error(`receipt upload failed: ${error.message}`);
  return { path, size: bytes.byteLength };
}

export async function cleanupCanonical(input: {
  orderIds: string[];
  batchIds?: string[];
  userIds?: string[];
  receiptPaths?: string[];
  deliveryProofPaths?: string[];
  pushSubscriptionIds?: string[];
}) {
  const service = getServiceClient();
  const uniqueOrders = [...new Set(input.orderIds)];
  const uniqueBatches = [...new Set(input.batchIds ?? [])];
  if (input.receiptPaths?.length) {
    await service.storage.from('sales-order-payment-receipts').remove(input.receiptPaths);
  }
  if (input.deliveryProofPaths?.length) {
    await service.storage.from('delivery-proof').remove(input.deliveryProofPaths);
  }
  if (uniqueOrders.length || uniqueBatches.length) {
    const cleaned = await service.rpc('e2e_cleanup_canonical_orders', {
      p_order_ids: uniqueOrders,
      p_batch_ids: uniqueBatches,
    });
    if (cleaned.error) throw new Error(`canonical order cleanup failed: ${cleaned.error.message}`);
  }
  if (input.pushSubscriptionIds?.length) {
    await service.from('push_subscriptions').delete().in('id', input.pushSubscriptionIds);
  }
  if (input.userIds?.length) {
    await service.from('delivery_assignments').delete().in('rider_id', input.userIds);
    await service.from('supplier_users').delete().in('user_id', input.userIds);
  }
}

/** Service-role-only, marker-proven cleanup for a complete concurrency run. */
export async function cleanupCanonicalTestRun(runId: string): Promise<CanonicalCleanupSummary> {
  assertConcurrencyRunId(runId);
  const service = getServiceClient();
  const { data, error } = await service.rpc('e2e_cleanup_canonical_test_run', { p_run_id: runId });
  if (error) throw new Error(`e2e_cleanup_canonical_test_run(${runId}) failed: ${error.message}`);
  return data as CanonicalCleanupSummary;
}

export function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

export function errorClass(error: unknown): string {
  const value = error as { code?: string; message?: string };
  if (value.code === '23505') return 'unique_constraint';
  if (value.code === '23503') return 'foreign_key';
  if (value.code === '42501') return 'rls_or_privilege';
  if (value.code === 'PGRST301') return 'auth';
  if (/timeout/i.test(value.message ?? '')) return 'timeout';
  if (/fetch|network/i.test(value.message ?? '')) return 'network';
  return value.code ?? 'application';
}
