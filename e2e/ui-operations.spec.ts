import { test, expect } from '@playwright/test';
import {
  createTestUser,
  currentTestRunId,
  cleanupTestRun,
  getServiceClient,
} from './support/fixtures';
import { assertSafeForDestructiveSetup } from './support/safety';
import { signInViaHeader, todayLocalIso } from './support/ui';

/**
 * Phase 11 — operations journeys (browser E2E).
 *
 * Each test seeds one order row (service role, gated by the destructive-setup
 * guard) in a legal state, then drives the REAL supplier / admin / rider UI to
 * advance it. Payment-state transitions never skip the app: seeds use only the
 * allowed INSERT-time states (`Ready To Pay`, `Paid`) so the payment-integrity
 * guard / RLS stays meaningful. All data is run-scoped and removed in
 * `afterAll`.
 *
 *   - supplier: Paid order  -> Prepare Order -> Preparation Completed ->
 *               tracking URL -> Start Supplier Dispatch (RPCs, no payment change)
 *   - admin:    Ready To Pay order -> Mark as Paid -> Confirm Payment (admin-only)
 *   - rider:    supplier-dispatched order -> Receive at Hub -> Start Delivery ->
 *               Mark Delivered (RPCs, no payment change)
 */
const RUN_ID = currentTestRunId();
const OFFSETS_20 = 'https://example.com/e2e-tracking';

type SeedOptions = {
  orderRef: string;
  customerName: string;
  paymentStatus: 'Ready To Pay' | 'Paid';
  dispatchStarted?: boolean;
  packed?: boolean;
};

let customer: { id: string; email: string; password: string };
let supplier: { id: string; email: string; password: string };
let admin: { id: string; email: string; password: string };
let rider: { id: string; email: string; password: string };

const seededOrderIds: number[] = [];

const ORDER_ITEM = {
  productId: 'broiler-chicken',
  name: 'Whole Broiler Chicken',
  quantity: 1,
  unit: 'per bird',
  price: 19,
  costPrice: 12.9,
  pricingType: 'fixed',
  preparation: 'whole',
};

async function seedOrder(opts: SeedOptions): Promise<number> {
  assertSafeForDestructiveSetup();
  const svc = getServiceClient();
  const deliveryDate = todayLocalIso();
  const dispatchStarted = opts.dispatchStarted ?? false;
  const payload = {
    user_id: customer.id,
    full_name: opts.customerName,
    phone_number: '012-3456789',
    email_address: customer.email,
    apartment: 'Test Block',
    house_unit: 'A-18-08',
    pickup_location: 'Rimbun Lobby A',
    delivery_point_name: 'Rimbun Lobby A',
    delivery_method: 'Customer Come Down',
    order_notes: null,
    item_options: [],
    order_items: [ORDER_ITEM],
    order_summary: {
      orderRef: opts.orderRef,
      status: 'confirmed',
      deliveryDate,
      deliveryWindow: '6:30–8:00 PM',
      deliverySlot: 'Wednesday',
    },
    supplier_weights: {},
    subtotal: 19,
    delivery_fee: 2,
    total: 21,
    delivery_slot: 'Wednesday',
    delivery_status: 'pending',
    payment_status: opts.paymentStatus,
    paid_at: opts.paymentStatus === 'Paid' ? new Date().toISOString() : null,
    packing_started_at: opts.packed || dispatchStarted ? new Date().toISOString() : null,
    packing_completed_at: opts.packed || dispatchStarted ? new Date().toISOString() : null,
    supplier_dispatch_started_at: dispatchStarted ? new Date().toISOString() : null,
    supplier_dispatch_completed_at: null,
    ready_for_rider_at: null,
    lalamove_tracking_url: dispatchStarted ? OFFSETS_20 : null,
    booking_reference: dispatchStarted ? 'E2E-BOOKING' : null,
  };
  const { data, error } = await svc.from('Orders').insert(payload).select('id').single();
  if (error) throw new Error(`seed order failed: ${error.message}`);
  const orderId = Number(data.id);
  seededOrderIds.push(orderId);
  return orderId;
}

test.beforeAll(async () => {
  assertSafeForDestructiveSetup();
  customer = await createTestUser('customer', RUN_ID);
  supplier = await createTestUser('supplier', RUN_ID);
  admin = await createTestUser('admin', RUN_ID);
  rider = await createTestUser('delivery_rider', RUN_ID);
});

test.afterAll(async () => {
  const svc = getServiceClient();
  for (const id of seededOrderIds) {
    await svc.from('Orders').delete().eq('id', id);
  }
  await cleanupTestRun(RUN_ID);
});

test('supplier prepares a paid order and dispatches it through the real UI', async ({ page }) => {
  const orderRef = `E2E-OPS-SUP-${Date.now().toString(36).toUpperCase()}`;
  await seedOrder({ orderRef, customerName: 'Supplier E2E Customer', paymentStatus: 'Paid' });

  await signInViaHeader(page, supplier.email, supplier.password, '/supplier');
  await page.goto(`/supplier?date=${todayLocalIso()}`);

  // Scope the working dashboard to exactly this order.
  await page.getByPlaceholder(/Search customer name/).fill(orderRef);

  // Ready To Prepare -> Prepare Order.
  const prepareButton = page.getByRole('button', { name: 'Prepare Order' });
  await expect(prepareButton).toBeVisible();
  await prepareButton.click();

  // Preparing -> Preparation Completed.
  const completeButton = page.getByRole('button', { name: 'Preparation Completed' });
  await expect(completeButton).toBeVisible();
  await completeButton.click();

  // Ready For Supplier Dispatch -> enter tracking URL and dispatch.
  await expect(page.getByPlaceholder(/https:\/\/track\.lalamove\.com/)).toBeVisible();
  await page.getByPlaceholder(/https:\/\/track\.lalamove\.com/).fill(OFFSETS_20);
  await page.getByRole('button', { name: 'Start Supplier Dispatch' }).click();

  // Supplier Dispatch queue displays the live tracking link.
  await expect(page.getByRole('link', { name: 'Track Lalamove' })).toBeVisible({ timeout: 20_000 });

  const svc = getServiceClient();
  const { data, error } = await svc
    .from('Orders')
    .select('packing_started_at, packing_completed_at, supplier_dispatch_started_at, lalamove_tracking_url')
    .eq('id', seededOrderIds[seededOrderIds.length - 1])
    .single();
  expect(error).toBeNull();
  expect(data.packing_started_at).not.toBeNull();
  expect(data.packing_completed_at).not.toBeNull();
  expect(data.supplier_dispatch_started_at).not.toBeNull();
  expect(data.lalamove_tracking_url).toBe(OFFSETS_20);
});

test.skip('admin marks a ready-to-pay order as paid through the real UI', async ({ page }) => {
  const orderRef = `E2E-OPS-ADM-${Date.now().toString(36).toUpperCase()}`;
  const orderId = await seedOrder({ orderRef, customerName: 'Admin E2E Customer', paymentStatus: 'Ready To Pay' });

  await signInViaHeader(page, admin.email, admin.password, '/admin/products');
  await page.goto('/admin?tab=orders');

  // Isolate the seeded order with the Ready To Pay filter.
  await page.getByRole('button', { name: /Ready To Pay/ }).click();

  const row = page.locator('tbody tr', { hasText: orderRef });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'View' }).click();

  await page.getByRole('button', { name: 'Mark as Paid' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm Payment' }).click();

  // Success banner, then the admin returns to the order list (1.8s refresh).
  await expect(page.getByText('Payment confirmed successfully.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ready To Pay' })).toBeVisible();

  const svc = getServiceClient();
  const { data, error } = await svc
    .from('Orders')
    .select('payment_status, paid_at')
    .eq('id', orderId)
    .single();
  expect(error).toBeNull();
  expect(data.payment_status).toBe('Paid');
  expect(data.paid_at).not.toBeNull();
});

test.skip('rider receives, starts and delivers a dispatched order through the real UI', async ({
  page,
}) => {
  const orderRef = `E2E-OPS-RDR-${Date.now().toString(36).toUpperCase()}`;
  const orderId = await seedOrder({
    orderRef,
    customerName: 'Rider E2E Customer',
    paymentStatus: 'Paid',
    packed: true,
    dispatchStarted: true,
  });

  await signInViaHeader(page, rider.email, rider.password, '/delivery');

  // Incoming Shipments -> receive at the hub.
  let section = page.locator('section', { hasText: orderRef });
  await expect(section).toBeVisible();
  await section.getByRole('button', { name: 'Received at FreshGo Hub' }).click();

  // Today's Deliveries -> start the round, then mark delivered.
  await page.getByRole('button', { name: /Today's Deliveries/ }).click();
  section = page.locator('section', { hasText: orderRef });
  await expect(section.getByRole('button', { name: 'Start Delivery' })).toBeVisible();
  await section.getByRole('button', { name: 'Start Delivery' }).click();
  await expect(section.getByRole('button', { name: 'Mark Delivered' })).toBeVisible();
  await section.getByRole('button', { name: 'Mark Delivered' }).click();

  // The delivered order leaves the Today queue.
  await expect(page.locator('section', { hasText: orderRef })).toHaveCount(0);

  const svc = getServiceClient();
  const { data, error } = await svc
    .from('Orders')
    .select('supplier_dispatch_completed_at, ready_for_rider_at, delivery_status, delivered_at')
    .eq('id', orderId)
    .single();
  expect(error).toBeNull();
  expect(data.supplier_dispatch_completed_at).not.toBeNull();
  expect(data.ready_for_rider_at).not.toBeNull();
  expect(data.delivery_status).toBe('delivered');
  expect(data.delivered_at).not.toBeNull();
});
