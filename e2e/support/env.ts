import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * FreshGo test-environment support.
 *
 * Loads test configuration from `.env.test` (git-ignored) and/or the process
 * environment, and provides the helpers used to (a) point the Playwright web
 * server at the dedicated test Supabase project and (b) gate every destructive
 * fixture operation behind a production safety check.
 */

export const TEST_ENV_FILE = resolve(process.cwd(), '.env.test');

/**
 * Every known FreshGo PRODUCTION Supabase project URL. A fixture or test-data
 * operation targeting any of these must be refused. Keep trailing-slash
 * variants; callers compare after normalization.
 */
export const PRODUCTION_SUPABASE_URLS = [
  'https://zcfpdmjjmihhvtuwngii.supabase.co',
  'https://zcfpdmjjmihhvtuwngii.supabase.co/',
  'https://zcfpdmjjmihhvtuwng2166.supabase.co',
  'https://zcfpdmjjmihhvtuwng2166.supabase.co/',
];

export type TestRole = 'admin' | 'customer' | 'supplier' | 'delivery_rider';

export interface TestRoleCredentials {
  email?: string;
  password?: string;
}

export interface TestEnv {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  serviceRoleKey?: string;
  baseURL: string;
  roles: Record<TestRole, TestRoleCredentials>;
  runId?: string;
}

/** Minimal `.env`-style parser (KEY=VALUE, # comments, ignores blanks). */
export function readDotEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

const EMPTY_CREDENTIALS: TestRoleCredentials = {};

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().replace(/\/+$/, '');
}

/**
 * Builds the TestEnv from `.env.test` (if present) overridden by the process
 * environment (higher precedence), mirroring how Vite resolves env vars.
 */
export function loadTestEnv(
  env: NodeJS.ProcessEnv = process.env,
  dotEnv = readDotEnv(TEST_ENV_FILE),
): TestEnv {
  const value = (key: string): string | undefined => {
    const fromFile = dotEnv[key];
    const fromProcess = env[key];
    if (fromProcess !== undefined && fromProcess !== '') return fromProcess;
    return fromFile !== undefined && fromFile !== '' ? fromFile : undefined;
  };

  const roleKeys: Record<TestRole, { email: string; password: string }> = {
    admin: { email: 'TEST_ADMIN_EMAIL', password: 'TEST_ADMIN_PASSWORD' },
    customer: { email: 'TEST_CUSTOMER_EMAIL', password: 'TEST_CUSTOMER_PASSWORD' },
    supplier: { email: 'TEST_SUPPLIER_EMAIL', password: 'TEST_SUPPLIER_PASSWORD' },
    delivery_rider: { email: 'TEST_RIDER_EMAIL', password: 'TEST_RIDER_PASSWORD' },
  };

  const roles = {} as Record<TestRole, TestRoleCredentials>;
  for (const role of Object.keys(roleKeys) as TestRole[]) {
    const email = value(roleKeys[role].email);
    const password = value(roleKeys[role].password);
    roles[role] = email || password ? { email, password } : EMPTY_CREDENTIALS;
  }

  return {
    supabaseUrl: normalizeUrl(value('VITE_SUPABASE_URL')),
    supabaseAnonKey: value('VITE_SUPABASE_ANON_KEY'),
    serviceRoleKey: value('TEST_SUPABASE_SERVICE_ROLE_KEY'),
    baseURL: value('PLAYWRIGHT_BASE_URL') ?? 'http://localhost:5173',
    roles,
    runId: value('TEST_RUN_ID'),
  };
}

/** True when the URL points at one of the known FreshGo production projects. */
export function isProductionSupabaseUrl(url: string | undefined): boolean {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  return PRODUCTION_SUPABASE_URLS.includes(normalized);
}

/**
 * Gated entry point for any operation that writes/deletes test fixtures.
 * Refuses to run when the configured Supabase URL is missing or is one of the
 * known production projects. This is enforced here (Node layer) on purpose, so
 * a wrong `.env` can never silently reach production.
 */
export function assertSafeSupabaseUrl(
  supabaseUrl: string | undefined,
): asserts supabaseUrl is string {
  if (!supabaseUrl) {
    throw new Error(
      'No Supabase URL configured for the E2E test environment. ' +
        'Set VITE_SUPABASE_URL in .env.test (never .env).',
    );
  }
  if (isProductionSupabaseUrl(supabaseUrl)) {
    throw new Error(
      'Refusing to run destructive E2E setup against the FreshGo production Supabase project.',
    );
  }
}