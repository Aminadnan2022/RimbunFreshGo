import assert from 'node:assert/strict';
import { cleanupCanonicalTestRun, assertConcurrencyRunId } from './support/canonical.ts';
import { getServiceClient } from './support/fixtures.ts';
import { assertSafeForDestructiveSetup } from './support/safety.ts';

async function main() {
  const safeEnv = assertSafeForDestructiveSetup();
  const runId = process.argv[2] ?? process.env.CONCURRENCY_CLEANUP_RUN_ID ?? '';
  assertConcurrencyRunId(runId);
  const stage = runId.match(/CONC(10|25|50)$/)?.[1];
  assert.ok(stage);
  const notes = `concurrency stage ${stage} ${runId}`;
  const service = getServiceClient();

  const before = await service.from('sales_orders').select('id');
  assert.ifError(before.error);
  const marked = await service.from('sales_orders').select('id').contains('customer_snapshot', { notes });
  assert.ifError(marked.error);
  const targetIds = (marked.data ?? []).map((row) => row.id);

  const summary = await cleanupCanonicalTestRun(runId);
  assert.equal(summary.sales_orders, targetIds.length, 'RPC removed a different order count than the proven target set');

  const after = await service.from('sales_orders').select('id');
  assert.ifError(after.error);
  const afterIds = new Set((after.data ?? []).map((row) => row.id));
  const removedIds = (before.data ?? []).map((row) => row.id).filter((id) => !afterIds.has(id)).sort();
  assert.deepEqual(removedIds, [...targetIds].sort(), 'an unrelated canonical order was removed');
  assert.equal(targetIds.some((id) => afterIds.has(id)), false, 'a target canonical order remains');

  const matchingUserIds: string[] = [];
  for (let page = 1, more = true; more; page += 1) {
    const listed = await service.auth.admin.listUsers({ page, perPage: 1000 });
    assert.ifError(listed.error);
    const users = listed.data?.users ?? [];
    for (const user of users) {
      const taggedRun = String(user.user_metadata?.test_run_id ?? '');
      if (taggedRun.startsWith(`${runId}-`) && user.email?.toLowerCase().includes(runId.toLowerCase())) {
        matchingUserIds.push(user.id);
      }
    }
    more = users.length === 1000;
  }
  if (matchingUserIds.length) {
    const remainingOwned = await service.from('sales_orders').select('customer_id').in('customer_id', matchingUserIds);
    assert.ifError(remainingOwned.error);
    assert.equal(remainingOwned.data?.length, 0, 'refusing to delete a run-tagged Auth user that still owns an order');
    for (const userId of matchingUserIds) {
      const deleted = await service.auth.admin.deleteUser(userId);
      assert.ifError(deleted.error);
    }
  }

  console.log(JSON.stringify({
    environment: { supabaseUrl: safeEnv.supabaseUrl, knownProduction: false },
    runId,
    targetOrderIds: targetIds,
    removedOrderIds: removedIds,
    unrelatedCanonicalOrdersPreserved: true,
    deletedAuthUsers: matchingUserIds.length,
    summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
