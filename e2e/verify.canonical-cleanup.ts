import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  cleanupCanonicalTestRun,
  createSignedInUser,
  nextWeekdayIso,
  orderArgs,
  placeOrder,
} from './support/canonical.ts';
import { createTestRunId, getServiceClient } from './support/fixtures.ts';
import { PRODUCTION_SUPABASE_URLS, assertSafeSupabaseUrl } from './support/env.ts';
import { assertSafeForDestructiveSetup } from './support/safety.ts';

async function deleteUsers(userIds: string[]) {
  const service = getServiceClient();
  for (const id of userIds) {
    const deleted = await service.auth.admin.deleteUser(id);
    assert.ifError(deleted.error);
  }
}

async function createMarkedOrder(runId: string) {
  const signed = await createSignedInUser('customer', `${runId}-customer-a`);
  const stage = runId.match(/CONC(10|25|50)$/)?.[1];
  assert.ok(stage);
  const args = orderArgs({
    email: signed.user.email,
    deliveryDate: nextWeekdayIso(),
    key: `conc${stage}:${runId}:regression:${randomUUID()}`,
    items: [{ product_id: 'udang-a', quantity: 1, estimated_weight_kg: 0.5 }],
  });
  args.p_customer_snapshot.notes = `concurrency stage ${stage} ${runId}`;
  const order = await placeOrder(signed.client, args);
  return { signed, orderId: order.sales_order_id };
}

async function main() {
  assertSafeForDestructiveSetup();
  const service = getServiceClient();
  const targetRun = `${createTestRunId()}-CONC10`;
  const unrelatedRun = `${createTestRunId()}-CONC10`;
  const userIds: string[] = [];
  let targetOrderId: string | null = null;
  let unrelatedOrderId: string | null = null;

  try {
    for (const productionUrl of PRODUCTION_SUPABASE_URLS) {
      assert.throws(() => assertSafeSupabaseUrl(productionUrl), /Refusing to run destructive E2E setup/);
    }

    const target = await createMarkedOrder(targetRun);
    userIds.push(target.signed.user.id);
    targetOrderId = target.orderId;
    const unrelated = await createMarkedOrder(unrelatedRun);
    userIds.push(unrelated.signed.user.id);
    unrelatedOrderId = unrelated.orderId;

    const denied = await target.signed.client.rpc('e2e_cleanup_canonical_test_run', { p_run_id: targetRun });
    assert.ok(denied.error, 'authenticated users must not be able to call cleanup');
    assert.equal(denied.error.code, '42501');

    for (const malformed of ['', 'E2E', 'E2E-%', 'E2E-20260830-ABC123', 'E2E-20260830-ABC123-CONC100']) {
      const result = await service.rpc('e2e_cleanup_canonical_test_run', { p_run_id: malformed });
      assert.ok(result.error, `malformed run id should be rejected: ${JSON.stringify(malformed)}`);
      assert.equal(result.error.code, '22023');
    }

    const summary = await cleanupCanonicalTestRun(targetRun);
    assert.equal(summary.target_orders, 1);
    assert.equal(summary.sales_orders, 1);
    const targetAfter = await service.from('sales_orders').select('id').eq('id', targetOrderId);
    assert.ifError(targetAfter.error);
    assert.equal(targetAfter.data?.length, 0);
    const unrelatedAfter = await service.from('sales_orders').select('id').eq('id', unrelatedOrderId);
    assert.ifError(unrelatedAfter.error);
    assert.equal(unrelatedAfter.data?.length, 1, 'unrelated canonical order must remain untouched');

    const unrelatedSummary = await cleanupCanonicalTestRun(unrelatedRun);
    assert.equal(unrelatedSummary.sales_orders, 1);
    targetOrderId = null;
    unrelatedOrderId = null;

    console.log(JSON.stringify({
      result: 'PASS',
      validRunScopedCleanup: true,
      unrelatedOrderPreserved: true,
      malformedRunIdsRejected: 5,
      authenticatedExecutionDenied: true,
      productionGuardBlocked: PRODUCTION_SUPABASE_URLS.length,
      targetSummary: summary,
    }, null, 2));
  } finally {
    if (targetOrderId) await cleanupCanonicalTestRun(targetRun);
    if (unrelatedOrderId) await cleanupCanonicalTestRun(unrelatedRun);
    await deleteUsers(userIds);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
