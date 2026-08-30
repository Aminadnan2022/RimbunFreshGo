import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanupTestRun, createTestRunId, getServiceClient } from './support/fixtures.ts';
import {
  cleanupCanonical,
  createSignedInUser,
  nextWeekdayIso,
  orderArgs,
  placeOrder,
  rpc,
  uploadReceipt,
} from './support/canonical.ts';

type Check = { name: string; status: 'passed' | 'failed' | 'skipped'; detail?: string };
type SignedIn = Awaited<ReturnType<typeof createSignedInUser>>;

const privacyRolloutStage = process.env.PRIVACY_ROLLOUT_STAGE === 'expand' ? 'expand' : 'contract';

const CHOICE_COMBO = {
  id: 'combo-a-1785581894775',
  versionId: 'f9f40c75-55ef-43da-ab63-63d4ffaeeb07',
  choiceGroup: 'choice-1787638227746-xk6fml',
  items: [
    ['99a0f027-bc8c-4f42-90c1-29d5ebde104e', 'siakap'],
    ['b14812ed-bb97-41ea-9bc0-b78490e9e817', 'cencaru'],
    ['1b3494f4-2206-43af-80ab-51a37136e3b6', 'sotong-a'],
    ['b492efcb-8d56-49a8-a299-9edfc37c0fc0', 'udang-a'],
  ],
};

function prep(lineNumber: number, componentNumber?: number) {
  const scoped = componentNumber ? { component_number: componentNumber } : {};
  return [
    { line_number: lineNumber, ...scoped, unit_number: 1, question_code: 'fish_clean', option_code: 'yes' },
    { line_number: lineNumber, ...scoped, unit_number: 1, question_code: 'fish_cut', option_code: 'no_cut' },
  ];
}

function comboItem(combo: { id: string; versionId: string; items: string[][] }, lineWeights: Record<string, number>) {
  return {
    combo_id: combo.id,
    combo_version_id: combo.versionId,
    quantity: 1,
    component_estimated_weights: lineWeights,
    combo_components: combo.items.map(([combo_item_id, product_id], index) => ({
      component_number: index + 1,
      combo_item_id,
      product_id,
    })),
  };
}

async function expectRpcDenied(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { error } = await client.rpc(name, args);
  assert.ok(error, `${name} should have been denied`);
}

async function orderRow(orderId: string) {
  const service = getServiceClient();
  const result = await service.from('sales_orders').select('*').eq('id', orderId).single();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function submitReceipt(client: SupabaseClient, orderId: string, total: number, label: string, paths: string[]) {
  const file = await uploadReceipt(client, orderId, label);
  paths.push(file.path);
  return rpc(client, 'submit_sales_order_payment_receipt', {
    p_sales_order_id: orderId,
    p_storage_path: file.path,
    p_original_file_name: `${label}.png`,
    p_mime_type: 'image/png',
    p_file_size: file.size,
    p_expected_final_total: total,
  });
}

async function main() {
  const runId = createTestRunId();
  const service = getServiceClient();
  const checks: Check[] = [];
  const orderIds: string[] = [];
  const batchIds: string[] = [];
  const receiptPaths: string[] = [];
  const deliveryProofPaths: string[] = [];
  const pushSubscriptionIds: string[] = [];
  const users: SignedIn[] = [];
  const deliveryDate = nextWeekdayIso();

  const addUser = async (role: Parameters<typeof createSignedInUser>[0], label: string) => {
    const signed = await createSignedInUser(role, `${runId}-${label}`);
    users.push(signed);
    return signed;
  };

  try {
    const [customer, otherCustomer, supplier, unrelatedSupplier, admin, rider] = await Promise.all([
      addUser('customer', 'customer-a'), addUser('customer', 'customer-b'),
      addUser('supplier', 'supplier-a'), addUser('supplier', 'supplier-b'),
      addUser('admin', 'admin'), addUser('delivery_rider', 'rider'),
    ]);

    await rpc(admin.client, 'admin_assign_supplier_user', { p_user_id: supplier.user.id, p_supplier_id: 1 });

    const subscription = await customer.client.rpc('upsert_own_push_subscription', {
      p_endpoint: `https://example.invalid/freshgo-e2e/${runId}`,
      p_auth: 'test-only-auth', p_p256dh: 'test-only-p256dh',
    });
    if (subscription.error) throw new Error(`push fixture failed: ${subscription.error.message}`);
    pushSubscriptionIds.push(String(subscription.data));

    assert.equal((await customer.client.rpc('is_admin')).data, false);
    assert.equal((await supplier.client.rpc('is_supplier')).data, true);
    assert.equal((await admin.client.rpc('is_admin')).data, true);
    assert.equal((await rider.client.rpc('is_delivery_rider')).data, true);
    const originalSession = (await customer.client.auth.getSession()).data.session;
    assert.ok(originalSession);
    await customer.client.auth.signOut();
    assert.equal((await customer.client.auth.getSession()).data.session, null);
    const recovered = await customer.client.auth.signInWithPassword({ email: customer.user.email, password: customer.user.password });
    assert.ifError(recovered.error);
    assert.ok((await customer.client.auth.getSession()).data.session);
    checks.push({ name: 'auth/session recovery and role separation', status: 'passed' });

    const fixed = await placeOrder(customer.client, orderArgs({
      email: customer.user.email,
      deliveryDate,
      items: [{ product_id: 'broiler-chicken', quantity: 1 }],
      preparation: [{ line_number: 1, unit_number: 1, question_code: 'chicken_cut', option_code: 'no_cut' }],
    }));
    orderIds.push(fixed.sales_order_id);
    assert.equal(fixed.price_status, 'final');
    assert.equal(fixed.requires_supplier_finalisation, false);
    const fixedTotal = Number(fixed.final_total);
    const fixedReceiptFile = await uploadReceipt(customer.client, fixed.sales_order_id, 'fixed');
    receiptPaths.push(fixedReceiptFile.path);
    await expectRpcDenied(otherCustomer.client, 'submit_sales_order_payment_receipt', {
      p_sales_order_id: fixed.sales_order_id,
      p_storage_path: fixedReceiptFile.path,
      p_original_file_name: 'fixed.png', p_mime_type: 'image/png',
      p_file_size: fixedReceiptFile.size, p_expected_final_total: fixedTotal,
    });
    const fixedReceipt = await rpc(customer.client, 'submit_sales_order_payment_receipt', {
      p_sales_order_id: fixed.sales_order_id,
      p_storage_path: fixedReceiptFile.path,
      p_original_file_name: 'fixed.png', p_mime_type: 'image/png',
      p_file_size: fixedReceiptFile.size, p_expected_final_total: fixedTotal,
    });
    await rpc(admin.client, 'confirm_sales_order_payment', { p_receipt_id: fixedReceipt.data });
    await rpc(supplier.client, 'supplier_start_canonical_packing', { p_sales_order_id: fixed.sales_order_id });
    await rpc(supplier.client, 'supplier_complete_canonical_packing', { p_sales_order_id: fixed.sales_order_id });
    const batch = await rpc(admin.client, 'admin_create_canonical_supplier_delivery_batch', {
      p_supplier_id: 1, p_delivery_date: deliveryDate, p_transport_provider: 'E2E only', p_notes: runId,
    });
    const batchId = String(batch.data);
    batchIds.push(batchId);
    await rpc(admin.client, 'admin_add_sales_order_to_supplier_delivery_batch', { p_batch_id: batchId, p_sales_order_id: fixed.sales_order_id });
    await rpc(admin.client, 'admin_dispatch_canonical_supplier_delivery_batch', {
      p_batch_id: batchId, p_transport_provider: 'E2E only', p_booking_reference: runId,
    });
    await rpc(admin.client, 'admin_confirm_canonical_supplier_batch_hub_arrival', { p_batch_id: batchId });
    const assignment = await admin.client.from('delivery_assignments').insert({ rider_id: rider.user.id, delivery_date: deliveryDate });
    if (assignment.error) throw new Error(assignment.error.message);
    await rpc(admin.client, 'admin_assign_canonical_sales_order_rider', { p_sales_order_id: fixed.sales_order_id, p_rider_id: rider.user.id });
    await rpc(rider.client, 'rider_start_canonical_sales_order_delivery', { p_sales_order_id: fixed.sales_order_id });
    for (const proofType of ['closeup', 'placement']) {
      const path = `${fixed.sales_order_id}/${proofType}/${randomUUID()}.png`;
      const uploaded = await rider.client.storage.from('delivery-proof').upload(path, new TextEncoder().encode('E2E proof'), { contentType: 'image/png' });
      if (uploaded.error) throw new Error(uploaded.error.message);
      deliveryProofPaths.push(path);
      await rpc(rider.client, 'rider_register_canonical_delivery_proof', {
        p_sales_order_id: fixed.sales_order_id, p_proof_type: proofType, p_storage_path: path,
      });
    }
    await rpc(rider.client, 'rider_complete_canonical_sales_order_delivery', { p_sales_order_id: fixed.sales_order_id });
    assert.equal((await orderRow(fixed.sales_order_id)).payment_status, 'paid');
    const delivered = await customer.client.rpc('get_sales_order_canonical_rider_tracking', { p_sales_order_id: fixed.sales_order_id });
    assert.ifError(delivered.error);
    assert.equal(delivered.data?.[0]?.delivery_status, 'delivered');
    checks.push({ name: 'fixed product: checkout through delivered with proof', status: 'passed' });

    const weighted = await placeOrder(customer.client, orderArgs({
      email: customer.user.email, deliveryDate,
      items: [{ product_id: 'udang-a', quantity: 1, estimated_weight_kg: 0.5 }],
    }));
    orderIds.push(weighted.sales_order_id);
    assert.equal(weighted.price_status, 'estimated');
    assert.equal(weighted.requires_supplier_finalisation, true);
    const weightedLine = await service.from('sales_order_lines').select('id').eq('sales_order_id', weighted.sales_order_id).single();
    if (weightedLine.error) throw new Error(weightedLine.error.message);
    for (const actual of [0.6, 0.7, 0.8]) {
      await rpc(supplier.client, 'record_sales_order_line_actual_weight', {
        p_sales_order_line_id: weightedLine.data.id, p_actual_weight_kg: actual,
      });
    }
    let weightedOrder = await orderRow(weighted.sales_order_id);
    assert.equal(weightedOrder.price_status, 'final');
    const wrongFile = await uploadReceipt(customer.client, weighted.sales_order_id, 'wrong-total');
    receiptPaths.push(wrongFile.path);
    await expectRpcDenied(customer.client, 'submit_sales_order_payment_receipt', {
      p_sales_order_id: weighted.sales_order_id, p_storage_path: wrongFile.path,
      p_original_file_name: 'wrong.png', p_mime_type: 'image/png', p_file_size: wrongFile.size,
      p_expected_final_total: Number(weightedOrder.final_total) + 1,
    });
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const receipt = await submitReceipt(customer.client, weighted.sales_order_id, Number(weightedOrder.final_total), `weighted-${attempt}`, receiptPaths);
      await expectRpcDenied(supplier.client, 'record_sales_order_line_actual_weight', {
        p_sales_order_line_id: weightedLine.data.id, p_actual_weight_kg: 0.9,
      });
      await rpc(admin.client, 'reject_sales_order_payment_receipt', { p_receipt_id: receipt.data, p_reason: `E2E rejection ${attempt}` });
      weightedOrder = await orderRow(weighted.sales_order_id);
      assert.equal(weightedOrder.payment_status, 'rejected');
    }
    const finalReceipt = await submitReceipt(customer.client, weighted.sales_order_id, Number(weightedOrder.final_total), 'weighted-final', receiptPaths);
    await rpc(admin.client, 'confirm_sales_order_payment', { p_receipt_id: finalReceipt.data });
    await expectRpcDenied(supplier.client, 'record_sales_order_line_actual_weight', {
      p_sales_order_line_id: weightedLine.data.id, p_actual_weight_kg: 1,
    });
    const repeatNotifications = await service.from('notifications').select('notification_type').eq('sales_order_id', weighted.sales_order_id);
    const types = (repeatNotifications.data ?? []).map((row) => row.notification_type);
    assert.ok(types.filter((type) => type === 'final_amount_updated').length >= 2);
    assert.ok(types.filter((type) => type === 'payment_receipt_rejected').length >= 2);
    checks.push({ name: 'weighted product: corrections, amount binding, replacement/rejection/confirm', status: 'passed' });

    const choiceItem = comboItem(CHOICE_COMBO, { 1: 1, 2: 1, 3: 0.5, 4: 0.5 });
    Object.assign(choiceItem, { combo_selections: [{ choice_group_key: CHOICE_COMBO.choiceGroup, combo_item_id: CHOICE_COMBO.items[1][0] }] });
    const choice = await placeOrder(customer.client, orderArgs({
      email: customer.user.email, deliveryDate, items: [choiceItem],
      preparation: [
        ...prep(1, 1),
        { line_number: 1, component_number: 2, question_code: 'fish_clean', option_code: 'yes' },
        { line_number: 1, component_number: 2, question_code: 'fish_cut', option_code: 'no_cut' },
      ],
    }));
    orderIds.push(choice.sales_order_id);
    assert.equal(choice.price_status, 'final');
    assert.equal(choice.requires_supplier_finalisation, false);
    const choiceLine = await service.from('sales_order_lines').select('id').eq('sales_order_id', choice.sales_order_id).single();
    if (choiceLine.error) throw new Error(choiceLine.error.message);
    const choiceComponents = await service.from('sales_order_line_components').select('product_id').eq('sales_order_line_id', choiceLine.data.id);
    assert.deepEqual(new Set((choiceComponents.data ?? []).map((row) => row.product_id)), new Set(['siakap', 'cencaru', 'sotong-a', 'udang-a']));
    const choiceReceipt = await submitReceipt(customer.client, choice.sales_order_id, Number(choice.final_total), 'choice-combo', receiptPaths);
    await rpc(admin.client, 'confirm_sales_order_payment', { p_receipt_id: choiceReceipt.data });
    await rpc(supplier.client, 'supplier_start_canonical_packing', { p_sales_order_id: choice.sales_order_id });
    const comboFulfilments = await admin.client.from('sales_order_supplier_fulfilments').select('id').eq('sales_order_id', choice.sales_order_id);
    assert.ifError(comboFulfilments.error);
    assert.equal(comboFulfilments.data?.length, 1);
    checks.push({ name: 'active fixed-price Customer Choice combo with weighted procurement components', status: 'passed' });

    const mixedChoiceItem = comboItem(CHOICE_COMBO, { 1: 1, 2: 1, 3: 0.5, 4: 0.5 });
    Object.assign(mixedChoiceItem, { combo_selections: [{ choice_group_key: CHOICE_COMBO.choiceGroup, combo_item_id: CHOICE_COMBO.items[1][0] }] });
    const mixed = await placeOrder(customer.client, orderArgs({
      email: customer.user.email, deliveryDate,
      items: [
        { product_id: 'udang-a', quantity: 1, estimated_weight_kg: 0.5 },
        mixedChoiceItem,
      ],
      preparation: [
        ...prep(2, 1),
        { line_number: 2, component_number: 2, question_code: 'fish_clean', option_code: 'yes' },
        { line_number: 2, component_number: 2, question_code: 'fish_cut', option_code: 'no_cut' },
      ],
    }));
    orderIds.push(mixed.sales_order_id);
    assert.equal(mixed.price_status, 'estimated');
    const mixedLine = await service.from('sales_order_lines').select('id').eq('sales_order_id', mixed.sales_order_id).eq('product_id', 'udang-a').single();
    if (mixedLine.error) throw new Error(mixedLine.error.message);
    await rpc(supplier.client, 'record_sales_order_line_actual_weight', { p_sales_order_line_id: mixedLine.data.id, p_actual_weight_kg: 0.6 });
    const mixedFinal = await orderRow(mixed.sales_order_id);
    if (mixedFinal.price_status === 'final') {
      checks.push({ name: 'mixed standalone weighted + fixed combo finalisation semantics', status: 'passed' });
    } else {
      checks.push({
        name: 'mixed standalone weighted + fixed combo finalisation semantics',
        status: 'failed',
        detail: 'Standalone weight was recorded, but unweighed procurement-only combo components kept the customer order estimated.',
      });
    }

    const procurementComponent = await service
      .from('sales_order_line_components')
      .select('id,ordering_mode')
      .in('sales_order_line_id', (
        await service.from('sales_order_lines').select('id').eq('sales_order_id', mixed.sales_order_id)
      ).data?.map((row) => row.id) ?? [])
      .in('ordering_mode', ['weight_only', 'slice'])
      .limit(1)
      .single();
    if (procurementComponent.error) throw new Error(procurementComponent.error.message);
    const beforeProcurementTotal = Number(mixedFinal.final_total);
    const beforeAmountNotifications = await service
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('sales_order_id', mixed.sales_order_id)
      .eq('notification_type', 'final_amount_updated');
    await rpc(supplier.client, 'record_sales_order_line_component_actual_weight', {
      p_sales_order_line_component_id: procurementComponent.data.id,
      p_actual_weight_kg: 0.55,
    });
    const afterProcurement = await orderRow(mixed.sales_order_id);
    const afterAmountNotifications = await service
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('sales_order_id', mixed.sales_order_id)
      .eq('notification_type', 'final_amount_updated');
    assert.equal(afterProcurement.price_status, 'final');
    assert.equal(Number(afterProcurement.final_total), beforeProcurementTotal);
    assert.equal(afterAmountNotifications.count, beforeAmountNotifications.count);
    checks.push({ name: 'late combo procurement weight leaves customer total/finality/notifications unchanged', status: 'passed' });

    const supplierVisible = await supplier.client.from('sales_order_supplier_fulfilments').select('sales_order_id');
    assert.ifError(supplierVisible.error);
    assert.ok((supplierVisible.data ?? []).some((row) => orderIds.includes(row.sales_order_id)));
    const unrelatedVisible = await unrelatedSupplier.client.from('sales_order_supplier_fulfilments').select('sales_order_id');
    assert.ifError(unrelatedVisible.error);
    assert.equal((unrelatedVisible.data ?? []).filter((row) => orderIds.includes(row.sales_order_id)).length, 0);

    // EXPAND checkpoint: the safe interface and ownership boundary work while
    // the old raw-table policies/grants may still exist for frontend rollback.
    const safeWork = await supplier.client.rpc('supplier_get_canonical_work');
    assert.ifError(safeWork.error);
    const safePayload = safeWork.data as Record<string, unknown[]>;
    assert.ok((safePayload.orders ?? []).length > 0);
    assert.ok((safePayload.lines ?? []).length > 0);
    assert.ok((safePayload.components ?? []).length > 0);
    assert.ok(JSON.stringify(safePayload).includes(fixed.sales_order_id));
    assert.ok(!/unit_cost_price|estimated_supplier_cost|final_supplier_cost|supplier_snapshot|gross_profit|profit_margin|cost_price/.test(JSON.stringify(safePayload)));
    const unrelatedWork = await unrelatedSupplier.client.rpc('supplier_get_canonical_work');
    assert.ifError(unrelatedWork.error);
    assert.equal(JSON.stringify(unrelatedWork.data).includes(fixed.sales_order_id), false);
    checks.push({ name: 'post-expand supplier safe projection and ownership', status: 'passed' });

    // CONTRACT checkpoint: opt out with PRIVACY_ROLLOUT_STAGE=expand while the
    // backward-compatible cutover window is intentionally still open.
    if (privacyRolloutStage === 'contract') {
      for (const [relation, fields] of [
        ['sales_order_lines', 'unit_cost_price,estimated_supplier_cost,final_supplier_cost,supplier_snapshot'],
        ['sales_order_line_components', 'unit_cost_price,estimated_supplier_cost,final_supplier_cost,supplier_snapshot'],
        ['Product', 'cost_price,cost_supplier_name'],
        ['vw_order_item_flat', 'supplier_cost_per_unit,supplier_total,gross_profit,profit_margin_percent'],
        ['vw_order_profit', 'supplier_cost,gross_profit,profit_margin_percent'],
      ] as const) {
        const leaked = await supplier.client.from(relation).select(fields).limit(1);
        assert.ok(leaked.error, `supplier SELECT ${relation}(${fields}) should be denied`);
      }
      for (const relation of [
        'sales_orders', 'sales_order_lines', 'sales_order_line_units',
        'sales_order_line_components', 'sales_order_line_component_units',
        'sales_order_preparation_answers',
      ] as const) {
        const raw = await supplier.client.from(relation).select('id').limit(1);
        assert.ifError(raw.error);
        assert.equal(raw.data?.length ?? 0, 0, `supplier raw ${relation} rows must be hidden`);
      }
      checks.push({ name: 'post-contract supplier safe projection and database financial privacy', status: 'passed' });
    } else {
      checks.push({
        name: 'post-contract supplier safe projection and database financial privacy',
        status: 'skipped',
        detail: 'EXPAND validation intentionally preserves the old frontend read paths until cutover.',
      });
    }
    await expectRpcDenied(customer.client, 'supplier_start_canonical_packing', { p_sales_order_id: choice.sales_order_id });
    await expectRpcDenied(supplier.client, 'admin_create_canonical_supplier_delivery_batch', {
      p_supplier_id: 1, p_delivery_date: deliveryDate,
    });
    checks.push({ name: 'RLS ownership and cross-role RPC isolation', status: 'passed' });

    const notes = await service.from('notifications').select('id,recipient_role,recipient_user_id,notification_type,dedupe_key').in('sales_order_id', orderIds);
    if (notes.error) throw new Error(notes.error.message);
    const noteIds = (notes.data ?? []).map((row) => row.id);
    assert.ok((notes.data ?? []).some((row) => row.recipient_role === 'customer'));
    assert.ok((notes.data ?? []).some((row) => row.recipient_role === 'supplier'));
    assert.equal(new Set((notes.data ?? []).filter((row) => row.dedupe_key).map((row) => row.dedupe_key)).size,
      (notes.data ?? []).filter((row) => row.dedupe_key).length);
    const pushJobs = noteIds.length ? await service.from('web_push_delivery_jobs').select('notification_id,subscription_id').in('notification_id', noteIds) : { data: [], error: null };
    assert.ifError(pushJobs.error);
    assert.ok((pushJobs.data ?? []).length > 0);
    const emails = noteIds.length ? await service.from('transactional_email_jobs').select('notification_id,recipient_user_id').in('notification_id', noteIds) : { data: [], error: null };
    assert.ifError(emails.error);
    assert.ok((emails.data ?? []).length > 0);
    assert.ok((emails.data ?? []).every((row) => row.recipient_user_id === customer.user.id));
    checks.push({ name: 'in-app, Web Push job dedupe and customer-only transactional email jobs', status: 'passed' });

    checks.push({ name: 'fixed-only combo live catalog case', status: 'skipped', detail: 'No active recipe has only fixed components; covered by contract regression.' });
    checks.push({ name: 'non-choice fixed-price combo live catalog case', status: 'skipped', detail: 'The published non-choice recipe is inactive and correctly rejected by checkout.' });
    checks.push({ name: 'real Android camera chooser and same-file reselection', status: 'skipped', detail: 'Requires physical Android/browser smoke; code-level regression is separate.' });
    checks.push({ name: 'canonical cancellation via supported user action', status: 'skipped', detail: 'No supported canonical cancellation RPC/UI path exists; trigger contracts are covered separately.' });

    console.log(JSON.stringify({ runId, checks, ordersCreated: orderIds.length }, null, 2));
    const failures = checks.filter((check) => check.status === 'failed');
    if (failures.length) throw new Error(`Pre-launch canonical baseline failed ${failures.length} correctness check(s).`);
  } finally {
    try {
      await cleanupCanonical({
        orderIds, batchIds, userIds: users.map(({ user }) => user.id), receiptPaths,
        deliveryProofPaths, pushSubscriptionIds,
      });
    } catch (error) {
      console.error(`Scoped canonical cleanup unavailable: ${error instanceof Error ? error.message : error}`);
    }
    const adminFixture = users.find(({ user }) => user.role === 'admin');
    if (adminFixture) {
      await adminFixture.client.from('supplier_users').delete().in('user_id', users.map(({ user }) => user.id));
      await adminFixture.client.from('delivery_assignments').delete().in('rider_id', users.map(({ user }) => user.id));
    }
    for (const { user } of users) {
      const deleted = await service.auth.admin.deleteUser(user.id);
      if (deleted.error) console.error(`cleanup user ${user.id}: ${deleted.error.message}`);
    }
    for (const suffix of ['customer-a', 'customer-b', 'supplier-a', 'supplier-b', 'admin', 'rider']) {
      try { await cleanupTestRun(`${runId}-${suffix}`); } catch { /* user already removed */ }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
