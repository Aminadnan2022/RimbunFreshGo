import { test, expect } from '@playwright/test';

test('FreshGo application loads successfully', async ({ page }) => {
  // 1. Load the application root.
  await page.goto('/');

  // 2. The sticky site header is rendered.
  await expect(page.locator('header')).toBeVisible();

  // 3. A stable application element exists: the wordmark/logo links to the storefront root.
  await expect(page.locator('header a[href="/"]')).toBeVisible();

  // 4. The primary desktop navigation is rendered.
  await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible();
});