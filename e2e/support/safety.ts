import { assertSafeSupabaseUrl, loadTestEnv, type TestEnv } from './env';

/**
 * Safety guard for destructive E2E fixture work (creating users, orders,
 * products, or any cleanup that writes to Supabase).
 *
 * Every fixture function MUST call `assertSafeForDestructiveSetup()` before
 * touching the database. The only way it can return an environment is when:
 *   - a Supabase URL is configured (from `.env.test` or the process env), AND
 *   - that URL is NOT one of the known FreshGo production projects.
 *
 * This must not be a no-op: it throws loudly so a production `.env` can never
 * silently be used for test-data setup.
 */
export function assertSafeForDestructiveSetup(overrides?: Partial<TestEnv>): Required<Pick<TestEnv, 'supabaseUrl' | 'supabaseAnonKey'>> {
  const testEnv = { ...loadTestEnv(), ...overrides };

  assertSafeSupabaseUrl(testEnv.supabaseUrl);

  if (!testEnv.supabaseAnonKey) {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY is required in .env.test for the E2E test environment.',
    );
  }

  return {
    supabaseUrl: testEnv.supabaseUrl,
    supabaseAnonKey: testEnv.supabaseAnonKey,
  };
}

/** Convenience re-export so callers can check before calling the guard. */
export { isProductionSupabaseUrl } from './env';