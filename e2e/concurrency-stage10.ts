import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanupTestRun, createTestRunId, getServiceClient, testEmailForRun } from './support/fixtures.ts';
import {
  cleanupCanonicalTestRun,
  type CanonicalCleanupSummary,
  assertConcurrencyRunId,
  createSignedInUser,
  errorClass,
  nextWeekdayIso,
  orderArgs,
  percentile,
  placeOrder,
  rpc,
  userClient,
} from './support/canonical.ts';
import { assertSafeForDestructiveSetup } from './support/safety.ts';

type SignedIn = Awaited<ReturnType<typeof createSignedInUser>>;
type ErrorRecord = {
  operation: string;
  classification: string;
  code: string | null;
  message: string;
  durationMs: number | null;
  expected: boolean;
};
type MetricSample = { durationMs: number; success: boolean };

type ConcurrencyStage = 10 | 25 | 50;

function concurrencyStage(value: string): ConcurrencyStage {
  const parsed = Number(value);
  if (parsed !== 10 && parsed !== 25 && parsed !== 50) {
    throw new Error('CONCURRENCY_STAGE must be 10, 25, or 50.');
  }
  return parsed;
}

const STAGE = concurrencyStage(process.env.CONCURRENCY_STAGE ?? '10');
const RETRIES_PER_KEY = STAGE;
const WEIGHT_UPDATES = STAGE;
const PRODUCT_ID = 'udang-a';
const FIRST_WEIGHT_KG = 0.6;
const CORRECTED_WEIGHT_KG = 0.7;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function json(value: unknown): string {
  return JSON.stringify(value, Object.keys((value ?? {}) as Record<string, unknown>).sort());
}

function errorDetails(error: unknown): { code: string | null; message: string; durationMs: number | null } {
  const value = error as { code?: string; message?: string; durationMs?: number };
  return {
    code: value.code ?? null,
    message: value.message ?? String(error),
    durationMs: typeof value.durationMs === 'number' ? value.durationMs : null,
  };
}

async function main() {
  const safeEnv = assertSafeForDestructiveSetup();
  const projectRef = new URL(safeEnv.supabaseUrl).hostname.split('.')[0];
  const resumeRunId = process.env.CONCURRENCY_RESUME_RUN_ID;
  const resumeRetryOrderId = process.env.CONCURRENCY_RESUME_RETRY_ORDER_ID;
  const runId = resumeRunId ?? `${createTestRunId()}-CONC${STAGE}`;
  assertConcurrencyRunId(runId);
  assert.ok(runId.endsWith(`-CONC${STAGE}`), 'resume run id must match CONCURRENCY_STAGE');
  const deliveryDate = nextWeekdayIso();
  const service = getServiceClient();
  const users: SignedIn[] = [];
  const orderIds: string[] = [];
  const metrics = new Map<string, MetricSample[]>();
  const errors: ErrorRecord[] = [];
  const checks: string[] = [];
  const fixturePatterns = {
    runId,
    emailPattern: `*.${runId.toLowerCase()}*@example.com`,
    customerNotes: `concurrency stage ${STAGE} ${runId}`,
    idempotencyPrefix: `conc${STAGE}:${runId}:`,
  };
  let cleanupError: string | null = null;
  let cleanupSummary: CanonicalCleanupSummary | null = null;
  let leftoverOrderIds: string[] = [];
  let resultError: unknown = null;
  let uniqueOrderCount = 0;
  let sameKeyCanonicalOrderCount = 0;
  let sameKeyResultCount = 0;

  const addMetric = (operation: string, durationMs: number, success: boolean) => {
    const samples = metrics.get(operation) ?? [];
    samples.push({ durationMs, success });
    metrics.set(operation, samples);
  };

  const captureError = (operation: string, error: unknown, expected = false) => {
    const details = errorDetails(error);
    errors.push({
      operation,
      classification: errorClass(error),
      code: details.code,
      message: details.message,
      durationMs: details.durationMs,
      expected,
    });
    if (details.durationMs !== null) addMetric(operation, details.durationMs, false);
  };

  const timedRpc = async (
    client: SupabaseClient,
    operation: string,
    name: string,
    args: Record<string, unknown>,
  ) => {
    try {
      const outcome = await rpc(client, name, args);
      addMetric(operation, outcome.durationMs, true);
      return outcome.data;
    } catch (error) {
      captureError(operation, error);
      throw error;
    }
  };

  const createCheckout = async (client: SupabaseClient, email: string, key: string, operation: string) => {
    const args = orderArgs({
      email,
      deliveryDate,
      key,
      items: [{ product_id: PRODUCT_ID, quantity: 1, estimated_weight_kg: 0.5 }],
    });
    args.p_customer_snapshot.notes = fixturePatterns.customerNotes;
    try {
      const outcome = await placeOrder(client, args);
      addMetric(operation, outcome.durationMs, true);
      return outcome;
    } catch (error) {
      captureError(operation, error);
      throw error;
    }
  };

  try {
    const addUser = async (role: Parameters<typeof createSignedInUser>[0], label: string) => {
      if (resumeRunId) {
        const taggedRunId = `${runId}-${label}`;
        const email = testEmailForRun(role, taggedRunId);
        const password = `FreshGo-${taggedRunId}`;
        const client = userClient();
        const signedIn = await client.auth.signInWithPassword({ email, password });
        if (signedIn.error || !signedIn.data.user) {
          throw new Error(`resume signIn(${role}/${label}) failed: ${signedIn.error?.message ?? 'no user'}`);
        }
        const signed = {
          user: { id: signedIn.data.user.id, email, password, role, runId: taggedRunId },
          client,
        };
        users.push(signed);
        return signed;
      }
      const signed = await createSignedInUser(role, `${runId}-${label}`);
      users.push(signed);
      return signed;
    };
    const [customer, otherCustomer, supplier, unrelatedSupplier, admin] = await Promise.all([
      addUser('customer', 'customer-a'),
      addUser('customer', 'customer-b'),
      addUser('supplier', 'supplier-a'),
      addUser('supplier', 'supplier-b'),
      addUser('admin', 'admin'),
    ]);

    if (!resumeRunId) {
      await timedRpc(admin.client, 'fixture_supplier_assignment', 'admin_assign_supplier_user', {
        p_user_id: supplier.user.id,
        p_supplier_id: 1,
      });
    }
    checks.push('dedicated run-scoped identities created; supplier assignment is isolated to the test user');

    let uniqueIds: string[];
    if (resumeRunId) {
      let existingQuery = service
        .from('sales_orders')
        .select('id')
        .eq('customer_id', customer.user.id)
        .contains('customer_snapshot', { notes: fixturePatterns.customerNotes });
      if (resumeRetryOrderId) existingQuery = existingQuery.neq('id', resumeRetryOrderId);
      const existing = await existingQuery;
      assert.ifError(existing.error);
      uniqueIds = (existing.data ?? []).map((row) => row.id);
      assert.equal(uniqueIds.length, STAGE, `resume requires exactly the ${STAGE} isolated unique orders`);
      checks.push('resumed the isolated run after the expected internal-ledger privilege denial; no unique checkout was repeated');
    } else {
      const uniqueKeys = Array.from({ length: STAGE }, (_, index) =>
        `${fixturePatterns.idempotencyPrefix}unique:${String(index + 1).padStart(2, '0')}:${randomUUID()}`,
      );
      const uniqueSettled = await Promise.allSettled(
        uniqueKeys.map((key) => createCheckout(customer.client, customer.user.email, key, 'checkout_unique')),
      );
      const uniqueFailures = uniqueSettled.filter((entry) => entry.status === 'rejected');
      if (uniqueFailures.length) {
        throw new Error(`Stage-${STAGE} stop: ${uniqueFailures.length} unique checkout attempt(s) failed.`);
      }
      const uniqueResults = uniqueSettled.map((entry) => {
        assert.equal(entry.status, 'fulfilled');
        return entry.value;
      });
      uniqueIds = uniqueResults.map((row) => row.sales_order_id);
    }
    orderIds.push(...uniqueIds);
    uniqueOrderCount = new Set(uniqueIds).size;
    assert.equal(uniqueIds.length, STAGE);
    assert.equal(uniqueOrderCount, STAGE, 'distinct idempotency keys collided');
    const uniqueCanonicalRows = await service.from('sales_orders').select('id').in('id', uniqueIds);
    assert.ifError(uniqueCanonicalRows.error);
    assert.equal(uniqueCanonicalRows.data?.length, STAGE);
    checks.push(`${STAGE} distinct checkout keys created exactly ${STAGE} distinct canonical orders`);

    let retryOrderId: string;
    if (resumeRetryOrderId) {
      retryOrderId = resumeRetryOrderId;
      sameKeyResultCount = RETRIES_PER_KEY;
      sameKeyCanonicalOrderCount = 1;
      checks.push('resumed after the already-passed same-key and weight concurrency checkpoints without replaying writes');
    } else {
      const retryKey = `${fixturePatterns.idempotencyPrefix}same:${randomUUID()}`;
      const sameKeySettled = await Promise.allSettled(
        Array.from({ length: RETRIES_PER_KEY }, () =>
          createCheckout(customer.client, customer.user.email, retryKey, 'checkout_same_key'),
        ),
      );
      const sameKeyFailures = sameKeySettled.filter((entry) => entry.status === 'rejected');
      if (sameKeyFailures.length) {
        throw new Error(`Stage-${STAGE} stop: ${sameKeyFailures.length} same-key retry attempt(s) failed.`);
      }
      const sameKeyResults = sameKeySettled.map((entry) => {
        assert.equal(entry.status, 'fulfilled');
        return entry.value;
      });
      sameKeyResultCount = sameKeyResults.length;
      const sameKeyIds = new Set(sameKeyResults.map((row) => row.sales_order_id));
      sameKeyCanonicalOrderCount = sameKeyIds.size;
      assert.equal(sameKeyResultCount, RETRIES_PER_KEY);
      assert.equal(sameKeyCanonicalOrderCount, 1, 'same idempotency key produced multiple orders');
      retryOrderId = sameKeyResults[0].sales_order_id;
    }
    orderIds.push(retryOrderId);
    const retryCanonicalRow = await service.from('sales_orders').select('id').eq('id', retryOrderId);
    assert.ifError(retryCanonicalRow.error);
    assert.equal(retryCanonicalRow.data?.length, 1);
    checks.push(`${STAGE} concurrent same-key calls returned one canonical order/result`);

    const allOrderIds = [...new Set(orderIds)];
    const orders = await service.from('sales_orders').select('*').in('id', allOrderIds);
    assert.ifError(orders.error);
    assert.equal(orders.data?.length, STAGE + 1);
    const lines = await service.from('sales_order_lines').select('*').in('sales_order_id', allOrderIds);
    assert.ifError(lines.error);
    assert.equal(lines.data?.length, STAGE + 1, 'every order must have exactly one standalone line');
    const firstLine = lines.data?.[0];
    assert.ok(firstLine);
    for (const order of orders.data ?? []) {
      assert.equal(order.customer_id, customer.user.id);
      assert.equal(order.customer_snapshot?.email, customer.user.email);
      assert.equal(order.customer_snapshot?.notes, fixturePatterns.customerNotes);
      assert.equal(order.delivery_snapshot?.requested_date, deliveryDate);
      assert.equal(order.payment_status, 'pending');
      assert.equal(Number(order.total), round(Number(order.subtotal) + Number(order.delivery_fee) - Number(order.discount_amount)));
      if (order.id !== retryOrderId || !resumeRetryOrderId) {
        assert.equal(order.price_status, 'estimated');
        assert.equal(Number(order.estimated_total), Number(order.total));
        assert.equal(order.final_total, null);
      }
    }
    for (const line of lines.data ?? []) {
      assert.equal(line.product_id, PRODUCT_ID);
      assert.ok(line.product_version_id);
      assert.equal(line.product_version_id, firstLine.product_version_id);
      assert.equal(json(line.product_snapshot), json(firstLine.product_snapshot));
      assert.equal(line.supplier_id, firstLine.supplier_id);
      assert.equal(json(line.supplier_snapshot), json(firstLine.supplier_snapshot));
      assert.equal(Number(line.unit_selling_price), Number(firstLine.unit_selling_price));
      assert.equal(Number(line.unit_cost_price), Number(firstLine.unit_cost_price));
      assert.equal(line.ordering_mode, firstLine.ordering_mode);
      if (line.sales_order_id !== retryOrderId || !resumeRetryOrderId) {
        assert.equal(line.actual_weight_kg, null);
        assert.equal(line.final_line_total, null);
      }
    }
    checks.push('order, product-version, supplier, cost, and customer-facing snapshots/totals are consistent');

    const retryLine = (lines.data ?? []).find((line) => line.sales_order_id === retryOrderId);
    assert.ok(retryLine);
    if (!resumeRetryOrderId) {
      const updateSettled = await Promise.allSettled(
        Array.from({ length: WEIGHT_UPDATES }, () =>
          timedRpc(supplier.client, 'weighted_initial_same_value', 'record_sales_order_line_actual_weight', {
            p_sales_order_line_id: retryLine.id,
            p_actual_weight_kg: FIRST_WEIGHT_KG,
          }),
        ),
      );
      if (updateSettled.some((entry) => entry.status === 'rejected')) {
        throw new Error(`Stage-${STAGE} stop: a concurrent initial weight update failed.`);
      }

      const correctionSettled = await Promise.allSettled(
        Array.from({ length: WEIGHT_UPDATES }, () =>
          timedRpc(supplier.client, 'weighted_correction_same_value', 'record_sales_order_line_actual_weight', {
            p_sales_order_line_id: retryLine.id,
            p_actual_weight_kg: CORRECTED_WEIGHT_KG,
          }),
        ),
      );
      if (correctionSettled.some((entry) => entry.status === 'rejected')) {
        throw new Error(`Stage-${STAGE} stop: a concurrent corrected weight update failed.`);
      }
    }

    const finalOrder = await service.from('sales_orders').select('*').eq('id', retryOrderId).single();
    assert.ifError(finalOrder.error);
    const finalLine = await service.from('sales_order_lines').select('*').eq('id', retryLine.id).single();
    assert.ifError(finalLine.error);
    assert.equal(Number(finalLine.data.actual_weight_kg), CORRECTED_WEIGHT_KG);
    assert.equal(Number(finalLine.data.final_line_total), round(CORRECTED_WEIGHT_KG * Number(finalLine.data.unit_selling_price)));
    assert.equal(finalOrder.data.price_status, 'final');
    assert.equal(finalOrder.data.payment_status, 'pending');
    assert.ok(Number(finalOrder.data.final_total) > 0);
    assert.equal(Number(finalOrder.data.final_total), Number(finalOrder.data.total));
    assert.equal(Number(finalOrder.data.total), round(Number(finalOrder.data.subtotal) + Number(finalOrder.data.delivery_fee) - Number(finalOrder.data.discount_amount)));
    checks.push(`${WEIGHT_UPDATES * 2} serialized concurrent same-value weight calls produced one correct final state and no impossible payment state`);

    if (!resumeRetryOrderId) {
      const deniedStarted = performance.now();
      const denied = await unrelatedSupplier.client.rpc('record_sales_order_line_actual_weight', {
        p_sales_order_line_id: retryLine.id,
        p_actual_weight_kg: 0.8,
      });
      const deniedDuration = performance.now() - deniedStarted;
      assert.ok(denied.error, 'unrelated supplier weight update should be denied');
      const deniedError = Object.assign(new Error(denied.error.message), {
        code: denied.error.code,
        details: denied.error.details,
        durationMs: deniedDuration,
      });
      captureError('rls_expected_denial', deniedError, true);
    }

    const ownerRows = await customer.client.from('sales_orders').select('id').in('id', allOrderIds);
    assert.ifError(ownerRows.error);
    assert.equal(ownerRows.data?.length, allOrderIds.length);
    const otherRows = await otherCustomer.client.from('sales_orders').select('id').in('id', allOrderIds);
    assert.ifError(otherRows.error);
    assert.equal(otherRows.data?.length, 0);
    const supplierWork = await supplier.client.rpc('supplier_get_canonical_work');
    assert.ifError(supplierWork.error);
    assert.ok(JSON.stringify(supplierWork.data).includes(retryOrderId));
    const unrelatedWork = await unrelatedSupplier.client.rpc('supplier_get_canonical_work');
    assert.ifError(unrelatedWork.error);
    assert.equal(JSON.stringify(unrelatedWork.data).includes(retryOrderId), false);
    checks.push('customer ownership and supplier assignment isolation remained intact; unrelated write was denied');

    const fulfilments = await service
      .from('sales_order_supplier_fulfilments')
      .select('id,sales_order_id,supplier_id')
      .in('sales_order_id', allOrderIds);
    assert.ifError(fulfilments.error);
    assert.ok((fulfilments.data?.length ?? 0) <= allOrderIds.length);
    assert.equal(
      new Set((fulfilments.data ?? []).map((row) => `${row.sales_order_id}:${row.supplier_id}`)).size,
      fulfilments.data?.length ?? 0,
      'duplicate order/supplier fulfilment membership detected',
    );
    const batchMemberships = await service
      .from('canonical_supplier_delivery_batch_orders')
      .select('id,sales_order_id,batch_id,supplier_id')
      .in('sales_order_id', allOrderIds);
    assert.ifError(batchMemberships.error);
    assert.equal(batchMemberships.data?.length, 0, 'checkout/weight updates must not create batch memberships');

    const notifications = await service
      .from('notifications')
      .select('id,sales_order_id,notification_type,dedupe_key')
      .in('sales_order_id', allOrderIds);
    assert.ifError(notifications.error);
    const keyed = (notifications.data ?? []).filter((row) => row.dedupe_key);
    assert.equal(new Set(keyed.map((row) => row.dedupe_key)).size, keyed.length, 'notification dedupe keys collided');
    assert.equal((notifications.data ?? []).filter((row) => row.sales_order_id === retryOrderId && row.notification_type === 'price_finalised').length, 1);
    assert.equal((notifications.data ?? []).filter((row) => row.sales_order_id === retryOrderId && row.notification_type === 'final_amount_updated').length, 1);
    const notificationIds = (notifications.data ?? []).map((row) => row.id);
    const emailJobs = notificationIds.length
      ? await service.from('transactional_email_jobs').select('notification_id').in('notification_id', notificationIds)
      : { data: [], error: null };
    assert.ifError(emailJobs.error);
    assert.equal(new Set((emailJobs.data ?? []).map((row) => row.notification_id)).size, emailJobs.data?.length ?? 0);
    const pushJobs = notificationIds.length
      ? await service.from('web_push_delivery_jobs').select('notification_id,subscription_id').in('notification_id', notificationIds)
      : { data: [], error: null };
    assert.ifError(pushJobs.error);
    assert.equal(pushJobs.data?.length, 0, 'no push subscription was created, so no Web Push job should be enqueued');
    checks.push('notification/job dedupe is correct; fulfilments are unique; no batch membership or push dispatch fixture was created');
  } catch (error) {
    resultError = error;
    console.error(JSON.stringify({
      stage: STAGE,
      runId,
      result: 'FAILED_BEFORE_CLEANUP',
      invariantViolation: errorDetails(error).message,
      capturedErrors: errors,
    }, null, 2));
  } finally {
    try {
      cleanupSummary = await cleanupCanonicalTestRun(runId);
      if (orderIds.length) {
        const leftovers = await service.from('sales_orders').select('id').in('id', [...new Set(orderIds)]);
        // Throwing here is intentional: the surrounding cleanup catch records the failure and rechecks leftovers.
        // eslint-disable-next-line no-unsafe-finally
        if (leftovers.error) throw new Error(`leftover verification failed: ${leftovers.error.message}`);
        leftoverOrderIds = (leftovers.data ?? []).map((row) => row.id);
      }
      if (!leftoverOrderIds.length) {
        for (const { user } of users) {
          const deleted = await service.auth.admin.deleteUser(user.id);
          // Throwing here is intentional: cleanup must stop before removing the remaining run-scoped users.
          // eslint-disable-next-line no-unsafe-finally
          if (deleted.error) throw new Error(`cleanup user ${user.id} failed: ${deleted.error.message}`);
        }
        for (const label of ['customer-a', 'customer-b', 'supplier-a', 'supplier-b', 'admin']) {
          try {
            await cleanupTestRun(`${runId}-${label}`);
          } catch {
            // The exact run-scoped auth user was already removed above.
          }
        }
      }
    } catch (error) {
      cleanupError = errorDetails(error).message;
      if (orderIds.length) {
        const leftovers = await service.from('sales_orders').select('id').in('id', [...new Set(orderIds)]);
        leftoverOrderIds = (leftovers.data ?? []).map((row) => row.id);
      }
    }
  }

  const metricSummary = Object.fromEntries(
    [...metrics.entries()].map(([operation, samples]) => {
      const durations = samples.map((sample) => sample.durationMs);
      return [operation, {
        count: samples.length,
        success: samples.filter((sample) => sample.success).length,
        failure: samples.filter((sample) => !sample.success).length,
        p50Ms: round(percentile(durations, 0.5)),
        p95Ms: round(percentile(durations, 0.95)),
        maxMs: round(Math.max(...durations)),
      }];
    }),
  );
  const unexpectedErrors = errors.filter((error) => !error.expected);
  const report = {
    stage: STAGE,
    environment: { projectRef, supabaseUrl: safeEnv.supabaseUrl, knownProduction: false },
    runId,
    resumedFromExistingUniqueOrders: Boolean(resumeRunId),
    result: resultError ? 'FAILED' : 'PASSED',
    counts: {
      uniqueCheckoutAttempts: STAGE,
      uniqueOrders: uniqueOrderCount,
      sameKeyRetryAttempts: sameKeyResultCount,
      sameKeyCanonicalOrders: sameKeyCanonicalOrderCount,
      unexpectedErrors: unexpectedErrors.length,
      expectedDeniedErrors: errors.filter((error) => error.expected).length,
    },
    checks,
    metrics: metricSummary,
    errors,
    invariantViolation: resultError ? errorDetails(resultError).message : null,
    cleanup: {
      complete: !cleanupError && leftoverOrderIds.length === 0,
      error: cleanupError,
      summary: cleanupSummary,
      leftoverOrderIds,
      fixturePatterns: cleanupError || leftoverOrderIds.length ? fixturePatterns : null,
      userIds: cleanupError || leftoverOrderIds.length ? users.map(({ user }) => user.id) : [],
    },
    safeToProceedToNextStage: !resultError && !cleanupError && leftoverOrderIds.length === 0,
  };
  console.log(JSON.stringify(report, null, 2));
  if (resultError) throw resultError;
  if (cleanupError || leftoverOrderIds.length) {
    throw new Error(`Stage-${STAGE} assertions passed, but scoped cleanup was incomplete.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
