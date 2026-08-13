import { test, expect } from '@playwright/test';
import { createTestUser, currentTestRunId, cleanupTestRun } from './support/fixtures';
import { signInViaHeader, forceEnglish } from './support/ui';
import type { TestRole } from './support/env';

/**
 * Phase 11 — UI authentication (browser E2E).
 *
 * Verifies the real header SignInModal + AuthRedirectPage role routing and the
 * per-page role guards. Every user is created run-scoped through the service
 * client (`createTestUser`) and cleaned up in `afterAll` — no permanent test
 * accounts are created.
 */
const RUN_ID = currentTestRunId();

type CreatedUser = {
  id: string;
  email: string;
  password: string;
  role: TestRole;
};

const users: Record<TestRole, CreatedUser> = {} as Record<TestRole, CreatedUser>;

test.beforeAll(async () => {
  for (const role of ['admin', 'customer', 'supplier', 'delivery_rider'] as TestRole[]) {
    users[role] = await createTestUser(role, RUN_ID);
  }
});

test.afterAll(async () => {
  await cleanupTestRun(RUN_ID);
});

test('admin signs in and is routed to the admin products page', async ({ page }) => {
  const user = users['admin'];
  await signInViaHeader(page, user.email, user.password, '/admin/products');
  await expect(page).toHaveURL(/\/admin\/products$/);
  // The admin page renders its tab bar (Orders tab is always present).
  await expect(page.getByRole('button', { name: 'Orders' })).toBeVisible();
});

test('supplier signs in and is routed to the packing dashboard', async ({ page }) => {
  const user = users['supplier'];
  await signInViaHeader(page, user.email, user.password, '/supplier');
  await expect(page).toHaveURL(/\/supplier$/);
  await expect(page.getByRole('heading', { name: 'Packing Dashboard' })).toBeVisible();
});

test('delivery rider signs in and is routed to the delivery dashboard', async ({ page }) => {
  const user = users['delivery_rider'];
  await signInViaHeader(page, user.email, user.password, '/delivery');
  await expect(page).toHaveURL(/\/delivery$/);
  await expect(page.getByRole('heading', { name: "Today's Delivery" })).toBeVisible();
});

test('customer signs in and is routed home', async ({ page }) => {
  const user = users['customer'];
  await signInViaHeader(page, user.email, user.password, (url) => url.pathname === '/');
  await expect(page).toHaveURL(/\/$/);
});

test('customer is redirected from the admin products page back to home', async ({ page }) => {
  const user = users['customer'];
  await signInViaHeader(page, user.email, user.password, (url) => url.pathname === '/');
  await page.goto('/admin/products');
  await expect(page).toHaveURL(/\/$/);
  // The hero is guest-only; a signed-in customer home renders the categories section.
  await expect(page.getByRole('heading', { name: 'Shop by Category' })).toBeVisible();
});

test('customer is redirected from the supplier dashboard back to home', async ({ page }) => {
  const user = users['customer'];
  await signInViaHeader(page, user.email, user.password, (url) => url.pathname === '/');
  await page.goto('/supplier');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Shop by Category' })).toBeVisible();
});

test('customer is redirected from the delivery dashboard back to home', async ({ page }) => {
  const user = users['customer'];
  await signInViaHeader(page, user.email, user.password, (url) => url.pathname === '/');
  await page.goto('/delivery');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Shop by Category' })).toBeVisible();
});

test('guest without a session is redirected from the cart to home', async ({ page }) => {
  await forceEnglish(page);
  await page.goto('/cart');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Freshly prepared.' })).toBeVisible();
});

test('guest without a session is redirected from checkout to home', async ({ page }) => {
  await forceEnglish(page);
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Freshly prepared.' })).toBeVisible();
});