import { expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Pin the app to English so all string assertions are deterministic,
 * regardless of the browser's reported language.
 */
export async function forceEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('language', 'en');
    } catch {
      /* storage may be unavailable in embedded contexts */
    }
  });
}

export type UrlMatcher = string | RegExp | ((url: URL) => boolean);

function matchesUrl(url: URL, matcher: UrlMatcher): boolean {
  if (typeof matcher === 'string') return url.href.endsWith(matcher);
  if (matcher instanceof RegExp) return matcher.test(url.href);
  return matcher(url);
}

/**
 * Signs a signed-out browser session in through the real header SignInModal,
 * then waits for the post-auth role redirect to match `matcher`.
 *
 * The dialog closing is the source of truth that the sign-in POST actually
 * completed and the session was persisted. Waiting only on `matcher` is unsafe
 * when the target URL already matches before sign-in (e.g. customers end up
 * back on `/`): a fast navigation then cancels the in-flight sign-in request
 * and the session never lands.
 */
export async function signInViaHeader(
  page: Page,
  email: string,
  password: string,
  matcher: UrlMatcher,
): Promise<void> {
  await forceEnglish(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Login' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#si-email').fill(email);
  await dialog.locator('#si-password').fill(password);
  await dialog.getByRole('button', { name: 'Sign In' }).click();
  await expect(dialog).toBeHidden();
  await page.waitForURL((url) => matchesUrl(url, matcher));
}

/**
 * An authenticated Supabase client (anon key + password), mirroring the real
 * customer app so RLS keeps applying. Useful when a spec must read rows as the
 * signed-in user (e.g. delivery points) before driving the UI.
 */
export async function createAuthenticatedClient(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`authenticated client sign-in failed: ${error.message}`);
  return client;
}

/** Local `YYYY-MM-DD` for the machine timezone (matches app `formatLocalDate`). */
export function todayLocalIso(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** `RM12.34`-style formatting to match `formatCurrency` in the app. */
export function rm(value: number): string {
  return `RM${value.toFixed(2)}`;
}