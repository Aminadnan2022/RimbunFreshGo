import { test, expect } from '@playwright/test';
import { forceEnglish } from './support/ui';

const CUSTOMER_ROUTES = ['/', '/shop', '/combos', '/vendors'];

test.describe('mobile customer foundations', () => {
  for (const route of CUSTOMER_ROUTES) {
    test(`${route} has no horizontal page overflow`, async ({ page }) => {
      await forceEnglish(page);
      await page.goto(route);
      await expect(page.locator('header')).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, `${route} should fit the mobile viewport`).toBeLessThanOrEqual(dimensions.clientWidth);
    });
  }

  test('header controls remain in the viewport and the mobile menu is operable', async ({ page }) => {
    await forceEnglish(page);
    await page.goto('/');

    const menu = page.getByRole('button', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeInViewport();

    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#mobile-navigation')).toBeVisible();
    await expect(page.locator('#mobile-navigation')).toBeInViewport();
  });
});
