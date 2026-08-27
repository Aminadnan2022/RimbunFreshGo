import { test, expect } from '@playwright/test';
import { forceEnglish } from './support/ui';

const promptLabel = 'Install FreshGo';

async function dispatchBeforeInstallPrompt(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: async () => undefined },
      userChoice: { value: Promise.resolve({ outcome: 'dismissed', platform: 'web' }) },
    });
    window.dispatchEvent(event);
  });
}

test.describe('PWA install prompt eligibility', () => {
  test('does not render on a desktop browser', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'pwa-desktop', 'Desktop-only regression.');
    await forceEnglish(page);
    await page.goto('/');
    await dispatchBeforeInstallPrompt(page);
    await expect(page.locator(`[aria-label="${promptLabel}"]`)).toHaveCount(0);
  });

  test('renders for an installable Android mobile browser and honours Not now', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'pwa-mobile', 'Mobile-only regression.');
    await forceEnglish(page);
    await page.goto('/');
    await dispatchBeforeInstallPrompt(page);
    await expect(page.locator(`[aria-label="${promptLabel}"]`)).toBeVisible();

    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.locator(`[aria-label="${promptLabel}"]`)).toHaveCount(0);

    await dispatchBeforeInstallPrompt(page);
    await expect(page.locator(`[aria-label="${promptLabel}"]`)).toHaveCount(0);
  });

  test('does not render when the mobile app is already running standalone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'pwa-mobile', 'Mobile-only regression.');
    await page.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: (query: string) => query === '(display-mode: standalone)'
          ? { matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }
          : nativeMatchMedia(query),
      });
    });
    await forceEnglish(page);
    await page.goto('/');
    await dispatchBeforeInstallPrompt(page);
    await expect(page.locator(`[aria-label="${promptLabel}"]`)).toHaveCount(0);
  });
});
