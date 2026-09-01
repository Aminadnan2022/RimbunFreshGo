import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { cleanupTestRun, createTestRunId, getServiceClient } from './support/fixtures.ts';
import { cleanupCanonical, createSignedInUser, orderArgs, placeOrder, userClient } from './support/canonical.ts';

const token = () => randomBytes(32).toString('base64url');

async function anonymousClient() {
  const client = userClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`Anonymous Auth is required for guest E2E: ${error?.message ?? 'no user'}`);
  assert.equal(data.user.is_anonymous, true, 'anonymous signup must issue an anonymous identity');
  return { client, userId: data.user.id };
}

async function expectRpcDenied(client: ReturnType<typeof userClient>, name: string, args: Record<string, unknown>) {
  const result = await client.rpc(name, args);
  assert.ok(result.error, `${name} must reject an anonymous identity`);
}

async function expectNoRowsOrDenied(
  request: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  label: string,
) {
  const result = await request;
  if (!result.error) assert.equal(result.data?.length ?? 0, 0, label);
}

async function main() {
  const runId = `${createTestRunId()}-GUEST`;
  const service = getServiceClient();
  const orderIds: string[] = [];
  const receiptPaths: string[] = [];
  const anonymousUserIds: string[] = [];

  try {
    const [guestA, guestB, guestC] = await Promise.all([anonymousClient(), anonymousClient(), anonymousClient()]);
    anonymousUserIds.push(guestA.userId, guestB.userId, guestC.userId);
    const accessA = token();
    const keyA = randomUUID();
    const argsA = {
      ...orderArgs({
        email: '', key: keyA,
        items: [{ product_id: 'broiler-chicken', quantity: 1, unit_selling_price: 0.01, final_total: 0.01 }],
        preparation: [{ line_number: 1, unit_number: 1, question_code: 'chicken_cut', option_code: 'no_cut' }],
      }),
      p_access_token: accessA,
      p_expected_final_total: null,
      p_expected_payment_configuration_version_id: null,
    };

    const missing = await guestA.client.rpc('place_guest_sales_order', {
      ...argsA, p_idempotency_key: randomUUID(),
      p_customer_snapshot: { ...argsA.p_customer_snapshot, name: '', phone: '' },
    });
    assert.ok(missing.error, 'missing required guest fields must be rejected');

    const missingAddress = await guestA.client.rpc('place_guest_sales_order', {
      ...argsA, p_idempotency_key: randomUUID(),
      p_delivery_request: { ...argsA.p_delivery_request, house_unit: '' },
    });
    assert.ok(missingAddress.error, 'missing guest delivery address must be rejected');

    const directRegisteredCheckout = await guestA.client.rpc('place_sales_order', {
      p_customer_snapshot: argsA.p_customer_snapshot,
      p_delivery_request: argsA.p_delivery_request,
      p_items: argsA.p_items,
      p_preparation_answers: argsA.p_preparation_answers,
      p_idempotency_key: randomUUID(),
    });
    assert.ok(directRegisteredCheckout.error, 'anonymous identity must not call registered place_sales_order');
    await expectRpcDenied(guestA.client, 'record_customer_privacy_consents', {
      p_privacy_notice_accepted: true, p_marketing_opt_in: false,
      p_policy_version: '2026-08-25', p_source: 'checkout',
    });
    assert.equal((await guestA.client.rpc('is_admin')).data, false);
    assert.equal((await guestA.client.rpc('is_supplier')).data, false);
    assert.equal((await guestA.client.rpc('is_delivery_rider')).data, false);
    await expectNoRowsOrDenied(guestA.client.from('customer_profiles').select('id').limit(1), 'anonymous profile read must be empty');
    await expectNoRowsOrDenied(guestA.client.from('Orders').select('id').limit(1), 'anonymous legacy order history must be empty');
    await expectNoRowsOrDenied(guestA.client.from('notifications').select('id').limit(1), 'anonymous notifications must be empty');
    await expectNoRowsOrDenied(guestA.client.from('push_subscriptions').select('id').limit(1), 'anonymous push subscriptions must be empty');
    await expectNoRowsOrDenied(guestA.client.from('delivery_batches').select('id').limit(1), 'anonymous delivery batches must be empty');

    const forbiddenAsset = new TextEncoder().encode(`anonymous storage probe ${runId}`);
    for (const bucket of ['product-images', 'branding']) {
      const written = await guestA.client.storage.from(bucket)
        .upload(`guest-boundary/${randomUUID()}.png`, forbiddenAsset, { contentType: 'image/png', upsert: false });
      assert.ok(written.error, `anonymous identity must not write ${bucket}`);
    }

    const first = await guestA.client.rpc('place_guest_sales_order', argsA);
    assert.ifError(first.error);
    const firstRow = Array.isArray(first.data) ? first.data[0] : first.data;
    assert.ok(firstRow?.sales_order_id && firstRow?.order_number, 'guest placement must return the canonical order');
    orderIds.push(String(firstRow.sales_order_id));

    const retry = await guestA.client.rpc('place_guest_sales_order', argsA);
    assert.ifError(retry.error);
    const retryRow = Array.isArray(retry.data) ? retry.data[0] : retry.data;
    assert.equal(retryRow?.sales_order_id, firstRow.sales_order_id, 'same guest idempotency key must return the original order');

    const canonicalLine = await service.from('sales_order_lines')
      .select('unit_selling_price, final_line_total').eq('sales_order_id', firstRow.sales_order_id).single();
    assert.ifError(canonicalLine.error);
    assert.ok(Number(canonicalLine.data.unit_selling_price) > 0.01, 'client price tampering must be ignored');

    const direct = await guestA.client.from('sales_orders').select('id').eq('id', firstRow.sales_order_id);
    assert.ifError(direct.error);
    assert.equal(direct.data?.length, 0, 'anonymous guest must not directly select its canonical order');

    for (const rpcName of [
      'get_sales_order_payment_display',
      'get_sales_order_supplier_fulfilment_tracking',
      'get_sales_order_canonical_delivery_tracking',
      'get_sales_order_canonical_rider_tracking',
      'get_sales_order_canonical_delivery_proofs',
    ]) {
      await expectRpcDenied(guestA.client, rpcName, { p_sales_order_id: firstRow.sales_order_id });
    }
    await expectRpcDenied(guestA.client, 'submit_sales_order_payment_receipt', {
      p_sales_order_id: firstRow.sales_order_id, p_storage_path: `${firstRow.sales_order_id}/${randomUUID()}.png`,
      p_original_file_name: 'forbidden.png', p_mime_type: 'image/png', p_file_size: 1,
      p_expected_final_total: Number(firstRow.final_total),
    });
    await expectRpcDenied(guestA.client, 'upsert_own_push_subscription', {
      p_endpoint: `https://example.invalid/guest/${runId}`, p_p256dh: 'forbidden', p_auth: 'forbidden',
    });

    const wrong = await guestB.client.rpc('get_guest_sales_order', {
      p_order_number: firstRow.order_number, p_access_token: token(),
    });
    const nonexistent = await guestB.client.rpc('get_guest_sales_order', {
      p_order_number: `FG-NOT-${randomUUID()}`, p_access_token: token(),
    });
    assert.ifError(wrong.error); assert.ifError(nonexistent.error);
    assert.deepEqual(wrong.data, nonexistent.data, 'wrong token and nonexistent order must be indistinguishable');
    assert.equal((wrong.data as { ok: boolean }).ok, false);

    const verified = await guestB.client.rpc('get_guest_sales_order', {
      p_order_number: firstRow.order_number, p_access_token: accessA,
    });
    assert.ifError(verified.error);
    assert.equal((verified.data as { ok: boolean }).ok, true, 'valid token must establish an order-scoped browser session');

    const accessC = token();
    const second = await guestC.client.rpc('place_guest_sales_order', {
      ...argsA, p_access_token: accessC, p_idempotency_key: randomUUID(),
    });
    assert.ifError(second.error);
    const secondRow = Array.isArray(second.data) ? second.data[0] : second.data;
    orderIds.push(String(secondRow.sales_order_id));
    const crossOrder = await guestB.client.rpc('get_guest_sales_order', {
      p_order_number: secondRow.order_number, p_access_token: accessA,
    });
    assert.ifError(crossOrder.error);
    assert.equal((crossOrder.data as { ok: boolean }).ok, false, 'one guest token must not authorize another order');

    assert.equal(firstRow.price_status, 'final', 'fixed fixture must be ready for receipt scoping test');
    const unverifiedReceiptPath = `guest/${firstRow.sales_order_id}/${randomUUID()}.png`;
    const unverifiedUpload = await guestC.client.storage.from('sales-order-payment-receipts')
      .upload(unverifiedReceiptPath, new TextEncoder().encode('forbidden'), { contentType: 'image/png', upsert: false });
    assert.ok(unverifiedUpload.error, 'guest receipt upload must require a verified order session');
    const receiptPath = `guest/${firstRow.sales_order_id}/${randomUUID()}.png`;
    const receiptBytes = new TextEncoder().encode(`FreshGo guest receipt ${runId}`);
    const uploaded = await guestB.client.storage.from('sales-order-payment-receipts')
      .upload(receiptPath, receiptBytes, { contentType: 'image/png', upsert: false });
    assert.ifError(uploaded.error); receiptPaths.push(receiptPath);
    const submitted = await guestB.client.rpc('submit_guest_sales_order_payment_receipt', {
      p_sales_order_id: firstRow.sales_order_id, p_storage_path: receiptPath,
      p_original_file_name: 'guest-receipt.png', p_mime_type: 'image/png',
      p_file_size: receiptBytes.byteLength, p_expected_final_total: Number(firstRow.final_total),
    });
    assert.ifError(submitted.error);
    const browsedReceipts = await guestB.client.storage.from('sales-order-payment-receipts').list('');
    assert.ifError(browsedReceipts.error);
    assert.equal(browsedReceipts.data?.length ?? 0, 0, 'guest must not browse private receipts');
    const otherReceipt = await guestC.client.storage.from('sales-order-payment-receipts').download(receiptPath);
    assert.ok(otherReceipt.error, 'another guest must not read a receipt');

    const registered = await createSignedInUser('customer', runId);
    const registeredOrder = await placeOrder(registered.client, orderArgs({
      email: registered.user.email,
      items: [{ product_id: 'broiler-chicken', quantity: 1 }],
      preparation: [{ line_number: 1, unit_number: 1, question_code: 'chicken_cut', option_code: 'no_cut' }],
    }));
    orderIds.push(registeredOrder.sales_order_id);
    const registeredRow = await service.from('sales_orders').select('customer_id').eq('id', registeredOrder.sales_order_id).single();
    assert.ifError(registeredRow.error);
    assert.equal(registeredRow.data.customer_id, registered.user.id, 'registered checkout ownership must remain unchanged');
    const registeredRead = await guestA.client.from('sales_orders').select('id').eq('id', registeredOrder.sales_order_id);
    assert.ifError(registeredRead.error);
    assert.equal(registeredRead.data?.length, 0, 'anonymous identity must not read a registered canonical order');

    console.log('Guest Checkout RPC E2E passed: validation, success, token verification, uniform failure, cross-order isolation, registered regression, idempotency, price authority, and receipt scoping. Existing prelaunch canonical E2E covers downstream supplier/hub/rider/POD progression.');
  } finally {
    await cleanupCanonical({ orderIds, receiptPaths });
    for (const userId of anonymousUserIds) await service.auth.admin.deleteUser(userId);
    await cleanupTestRun(runId);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
