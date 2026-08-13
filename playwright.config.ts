import { defineConfig, devices } from '@playwright/test';
import { loadTestEnv } from './e2e/support/env';

const localUrl = 'http://localhost:5173';
const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? localUrl).replace(/\/+$/, '');
const isLocal = baseURL.startsWith('http://localhost');

// When a TEST Supabase project is configured (via `.env.test` or the process
// environment), the dev server started by Playwright is seeded with the test
// Supabase credentials. Production `.env` is never modified.
const testEnv = loadTestEnv();
const hasTestSupabase = Boolean(testEnv.supabaseUrl && testEnv.supabaseAnonKey);
const webServerEnv = hasTestSupabase
  ? {
      ...process.env,
      VITE_SUPABASE_URL: testEnv.supabaseUrl!,
      VITE_SUPABASE_ANON_KEY: testEnv.supabaseAnonKey!,
    }
  : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // Cap local parallelism: a single Vite dev server + external Supabase stalls
  // under many simultaneous browser workers. CI is fully serial.
  workers: process.env.CI ? 1 : 2,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/mobile.spec.ts',
    },
    {
      name: 'mobile-320',
      testMatch: '**/mobile.spec.ts',
      use: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'mobile-390',
      testMatch: '**/mobile.spec.ts',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'mobile-412',
      testMatch: '**/mobile.spec.ts',
      use: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: isLocal
    ? {
        command: 'npm run dev',
        url: localUrl,
        reuseExistingServer: !process.env.CI && !hasTestSupabase,
        timeout: 120_000,
        env: webServerEnv,
      }
    : undefined,
});
