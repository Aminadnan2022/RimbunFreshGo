import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadTestEnv, type TestRole } from './env.ts';
import { assertSafeForDestructiveSetup } from './safety.ts';

/**
 * FreshGo test-fixture foundation.
 *
 * Only infrastructure and design live here today:
 *   - unique test-run identifiers (e.g. `E2E-20260808-ABC123`)
 *   - deterministic, run-scoped test-user emails
 *   - a Node-only service-role client (NEVER browser-facing)
 *   - run-scoped user creation + cleanup, gated by the production safety guard
 *
 * Nothing here writes to the database until a dedicated test Supabase project
 * is configured in `.env.test`. Every function refuses to run against the
 * production project via `assertSafeForDestructiveSetup()`.
 */

const ROLE_LABELS: Record<TestRole, string> = {
  admin: 'admin',
  customer: 'customer',
  supplier: 'supplier',
  delivery_rider: 'delivery_rider',
};

/** Generates a unique test-run id, e.g. `E2E-20260808-A1B2C3`. */
export function createTestRunId(now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `E2E-${date}-${suffix}`;
}

/** The active run id for this test session (env override or freshly generated). */
export function currentTestRunId(): string {
  const env = loadTestEnv();
  return env.runId ?? createTestRunId();
}

/**
 * Deterministic, run-scoped email for a role. Reusable across runs is a
 * deliberate non-goal: every test run gets fresh identities so cleanup can
 * target exactly that run without global deletes.
 */
export function testEmailForRun(role: TestRole, runId: string): string {
  return `${ROLE_LABELS[role]}.${runId.toLowerCase()}@example.com`;
}

/**
 * Service-role Supabase client, valid only inside Node.js test code.
 * It is never imported by the Vite app and never exposed to the browser.
 */
export function getServiceClient(): SupabaseClient {
  const env = assertSafeForDestructiveSetup();
  const { serviceRoleKey } = loadTestEnv();
  if (!serviceRoleKey) {
    throw new Error(
      'TEST_SUPABASE_SERVICE_ROLE_KEY is required in .env.test for fixture setup. ' +
        'It is only used from Node test code and must never be exposed to the browser.',
    );
  }
  return createClient(env.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Creates (or reuses) a test user in the TEST Supabase project and assigns the
 * requested role in `user_roles`, mirroring the app's real role model
 * (AuthContext reads the role from the `user_roles` table).
 */
export async function createTestUser(role: TestRole, runId: string = currentTestRunId()): Promise<{
  id: string;
  email: string;
  password: string;
  role: TestRole;
  runId: string;
}> {
  // Guard BEFORE any database call.
  assertSafeForDestructiveSetup();

  const testEnv = loadTestEnv();
  const preferred = testEnv.roles[role];
  const email = preferred.email ?? testEmailForRun(role, runId);
  const password = preferred.password ?? `FreshGo-${runId}`;

  const client = getServiceClient();
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { test_run_id: runId, role, privacy_notice_accepted: true, marketing_opt_in: false, privacy_policy_version: '2026-08-25' },
  });
  if (error) {
    throw new Error(`createTestUser(${role}) failed: ${error.message}`);
  }

  const { error: roleError } = await client
    .from('user_roles')
    .insert({ id: data.user.id, role });
  if (roleError) {
    throw new Error(`assignRole(${role}) failed: ${roleError.message}`);
  }

  return { id: data.user.id, email, password, role, runId };
}

/**
 * Scoped cleanup for one test run. Only records tagged with the run id are
 * removed; global deletes (e.g. `DELETE FROM "Orders";`) are never performed.
 *
 * NOTE: future order fixtures should record a run-scoped email (or user id) on
 * the order row. Before deleting users, future cleanup code must first delete
 * only those order rows whose email/user matches the run id — using the same
 * run-scoped filter, never a table-wide delete.
 */
export async function cleanupTestRun(runId: string): Promise<{ deletedUsers: number }> {
  // Guard BEFORE any database call.
  assertSafeForDestructiveSetup();

  const client = getServiceClient();
  const runIdLower = runId.toLowerCase();
const { error: phase3CleanupError } = await client.rpc(
  'e2e_cleanup_phase3_test_run',
  { p_run_id: runId },
);

if (phase3CleanupError) {
  throw new Error(
    `e2e_cleanup_phase3_test_run(${runId}) failed: ${phase3CleanupError.message}`,
  );
}
  const matches = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      throw new Error(`listUsers failed: ${error.message}`);
    }
    const users = (data?.users ?? []) as {
      id: string;
      email?: string | null;
      user_metadata?: Record<string, unknown> | null;
    }[];
    for (const user of users) {
      const tagged =
        user.email?.toLowerCase().includes(runIdLower) ||
        user.user_metadata?.test_run_id === runId;
      if (tagged) matches.push(user.id);
    }
    hasMore = users.length === 1000;
    page += 1;
  }

  for (const id of matches) {
    const { error } = await client.auth.admin.deleteUser(id);
    if (error) {
      throw new Error(`deleteUser(${id}) failed: ${error.message}`);
    }
  }

  return { deletedUsers: matches.length };
}
