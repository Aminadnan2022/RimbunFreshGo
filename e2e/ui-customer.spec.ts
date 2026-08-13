import { test, expect } from '@playwright/test';
import {
  createTestUser,
  currentTestRunId,
  cleanupTestRun,
  getServiceClient,
} from './support/fixtures';
import { loadTestEnv } from './support/env';
import { assertSafeForDestructiveSetup } from './support/safety';
import { signInViaHeader, createAuthenticatedClient, forceEnglish, rm } from './support/ui';

/**
 * Phase 11 — customer checkout journey (browser E2E).
 *
 * Drives the real storefront: sign in -> shop -> add a fixed-price product to
 * the cart -> pick a delivery day -> checkout (validation first, then a clean
 * submit) -> order-confirmed page. Expected money values are read from the live
 * catalog / delivery points so the assertions never hard-code prices.
 */
const RUN_ID = currentTestRunId();
const env = loadTestEnv();

const PRODUCT_ENABLER = 'broiler-chicken';

let customer: { id: string; email: string; password: string };
let product: { name: string; price: number };
let point: { name: string; delivery_fee: number };
let subtotal = 0;
let fee = 0;
let total = 0;

test.beforeAll(async () => {
  assertSafeForDestructiveSetup();
  customer = await createTestUser('customer', RUN_ID);

  const authClient = await createAuthenticatedClient(
    env.supabaseUrl!,
    env.supabaseAnonKey!,
    customer.email,
    customer.password,
  );

  const { data: productData, error: productError } = await authClient
    .from('Product')
    .select('id, name, price, ordering_mode')
    .eq('id', PRODUCT_ENABLER)
    .single();
  if (productError) throw new Error(`product fetch failed: ${productError.message}`);
  if (productData.ordering_mode !== 'fixed_quantity') {
    throw new Error(`expected fixed_quantity product, got ${productData.ordering_mode}`);
  }
  product = { name: productData.name, price: Number(productData.price) };

  const { data: points, error: pointsError } = await authClient
    .from('delivery_points')
    .select('name, delivery_fee')
    .eq('active', true)
    .order('display_order', { ascending: true });
  if (pointsError) throw new Error(`delivery points fetch failed: ${pointsError.message}`);
  if (!points || points.length === 0) throw new Error('no active delivery points in test project');
  point = { name: points[0].name, delivery_fee: Number(points[0].delivery_fee) };

  subtotal = product.price;
  fee = point.delivery_fee;
  total = subtotal + fee;
});

test.afterAll(async () => {
  const svc = getServiceClient();
  await svc.from('Orders').delete().eq('email_address', customer.email);
  await cleanupTestRun(RUN_ID);
});

async function signInAndReturnHome(page: import('@playwright/test').Page): Promise<void> {
  await signInViaHeader(page, customer.email, customer.password, (url) => url.pathname === '/');
}

async function addProductToCart(page: import('@playwright/test').Page): Promise<void> {
  const card = page.locator('article', { hasText: product.name }).first();
  await card.getByRole('button', { name: 'Add to Cart' }).click();
  await expect(card.getByRole('button', { name: 'Added!' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cart, 1 items' })).toBeVisible();
}

async function goToCheckoutWithDay(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Your Cart (1 item)' })).toBeVisible();
  await expect(page.locator('body')).toContainText(rm(subtotal));

  const slotCard = page.locator('div.card', { has: page.getByRole('heading', { name: 'Delivery Slot' }) }).first();
  // Pick the first unselected day. Use a pressed-count assertion rather than
  // re-reading the (now re-resolved) first unselected button after clicking.
  const dayButton = slotCard.getByRole('button', { pressed: false }).first();
  await dayButton.click();
  await expect(slotCard.locator('[aria-pressed="true"]')).toHaveCount(1);

  await page.getByRole('link', { name: 'Proceed to Checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
}

async function fillCheckoutDetails(page: import('@playwright/test').Page): Promise<void> {
  await page.getByPlaceholder('Ahmad bin Abdullah').fill('E2E Customer');
  await page.getByPlaceholder('012-345 6789').fill('0123456789');
  await page.getByPlaceholder('e.g. Rimbun Apartment, Block B').fill('Test Block');
  await page.getByPlaceholder('e.g. A-18-08').fill('A-18-08');
  await page.locator('select').selectOption(point.name);
  await expect(page.getByText('Next delivery:')).toBeVisible();
}

test('customer completes the full checkout journey and sees the order confirmed page', async ({
  page,
}) => {
  await signInAndReturnHome(page);

  // Shop: add the fixed-price product to the cart.
  await page.goto('/shop');
  await addProductToCart(page);

  // Cart: verify subtotal and pick a delivery day.
  await goToCheckoutWithDay(page);

  // Checkout: fill details, continue to payment.
  await fillCheckoutDetails(page);
  await page.getByRole('button', { name: /Continue to Payment/ }).click();

  // Payment: the place-order button shows the exact expected total.
  const placeOrder = page.getByRole('button', {
    name: new RegExp(`^Place Order \\u2014 ${rm(total).replace('.', '\\.')}$`),
  });
  await expect(placeOrder).toBeVisible();
  await placeOrder.click();

  // Confirmation screen.
  await page.waitForURL((url) => url.pathname.startsWith('/order/'));
  await expect(page.getByRole('heading', { name: 'Order Confirmed!' })).toBeVisible();
  await expect(page.getByText('Order ID', { exact: true })).toBeVisible();

  // Back-end check: the order row was persisted with the expected money.
  const svc = getServiceClient();
  const { data: rows, error } = await svc
    .from('Orders')
    .select('id, total, subtotal, delivery_fee, payment_status, order_summary')
    .eq('email_address', customer.email)
    .order('id', { ascending: false })
    .limit(1);
  expect(error).toBeNull();
  expect(rows).toHaveLength(1);
  expect(Number(rows[0].subtotal)).toBe(subtotal);
  expect(Number(rows[0].delivery_fee)).toBe(fee);
  expect(Number(rows[0].total)).toBe(total);
  expect(rows[0].payment_status).toBe('Pending');
  expect((rows[0].order_summary as { status?: string }).status).toBe('confirmed');
});

test('customer sees checkout validation errors before payment and resolves them', async ({
  page,
}) => {
  await signInAndReturnHome(page);

  await page.goto('/shop');
  await addProductToCart(page);
  await goToCheckoutWithDay(page);

  // Submit empty: every required field errors.
  await page.getByRole('button', { name: /Continue to Payment/ }).click();
  await expect(page.getByText('Full name is required.')).toBeVisible();
  await expect(page.getByText('Phone number is required.')).toBeVisible();
  await expect(page.getByText('House unit number is required (e.g. A-18-08).')).toBeVisible();
  await expect(page.getByText('Please select a delivery point.')).toBeVisible();

  // Fill in the missing fields and continue — payment step is reached.
  await fillCheckoutDetails(page);
  await page.getByRole('button', { name: /Continue to Payment/ }).click();
  await expect(
    page.getByRole('button', {
      name: new RegExp(`^Place Order \\u2014 ${rm(total).replace('.', '\\.')}$`),
    }),
  ).toBeVisible();
});