import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { cleanupTestRun, createTestRunId, getServiceClient } from './support/fixtures.ts';
import { cleanupCanonical, createSignedInUser, orderArgs, placeOrder, userClient } from './support/canonical.ts';

const token = () => randomBytes(32).toString('base64url');

async function anonymousClient() {
  const client = userClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`Anonymous Auth is required for guest E2E: ${error?.message ?? 'no user'}`);
  return { client, userId: data.user.id };
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

    console.log('Guest Checkout RPC E2E passed: validation, success, token verification, uniform failure, cross-order isolation, registered regression, idempotency, price authority, and receipt scoping. Existing prelaunch canonical E2E covers downstream supplier/hub/rider/POD progression.');
  } finally {
    await cleanupCanonical({ orderIds, receiptPaths });
    for (const userId of anonymousUserIds) await service.auth.admin.deleteUser(userId);
    await cleanupTestRun(runId);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
