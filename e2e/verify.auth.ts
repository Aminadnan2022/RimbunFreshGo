import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';

type Role = 'admin' | 'supplier' | 'delivery_rider' | 'customer';

type TestUser = {
  role: Role;
  id: string;
  email: string;
  password: string;
};

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  const content = readFileSync(path, 'utf8');

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const i = line.indexOf('=');
    if (i <= 0) continue;

    const key = line.slice(0, i).trim();
    const value = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');

    env[key] = value;
  }

  return env;
}

const env = loadEnv('.env.test');

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = env.TEST_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY or TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test'
  );
}

if (/production|prod/i.test(SUPABASE_URL)) {
  throw new Error(`Safety stop: Supabase URL looks like production: ${SUPABASE_URL}`);
}

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const runId =
  `E2E-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-` +
  randomBytes(3).toString('hex').toUpperCase();

const users: TestUser[] = [];
let failures = 0;

function pass(message: string) {
  console.log(`✅ PASS: ${message}`);
}

function fail(message: string) {
  failures++;
  console.log(`❌ FAIL: ${message}`);
}

async function createTestUser(role: Role): Promise<TestUser> {
  const suffix = runId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const email = `${role}.e2e-${suffix}@example.com`;
  const password = `Test-${randomBytes(18).toString('base64url')}!`;

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { test_run_id: runId, role, privacy_notice_accepted: true, marketing_opt_in: false, privacy_policy_version: '2026-08-25' },
  });

  if (error || !data.user) {
    throw new Error(
      `createTestUser(${role}) failed: ${error?.message ?? 'no user returned'}`
    );
  }

  const user: TestUser = {
    role,
    id: data.user.id,
    email,
    password,
  };

  users.push(user);

  const { error: roleError } = await service
    .from('user_roles')
    .upsert({ id: user.id, role }, { onConflict: 'id' });

  if (roleError) {
    throw new Error(`user_roles upsert(${role}) failed: ${roleError.message}`);
  }

  console.log(`created ${role}: id=${user.id} email=${user.email}`);
  pass(`createTestUser(${role}) succeeded`);

  return user;
}

async function signIn(user: TestUser): Promise<SupabaseClient> {
  const client = anonClient();

  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });

  if (error || !data.session || !data.user) {
    throw new Error(
      `signIn(${user.role}) failed: ${error?.message ?? 'no session returned'}`
    );
  }

  return client;
}

async function cleanup() {
  console.log('\n==== CLEANUP TEST USERS ====');

  let deleted = 0;

  for (const user of users) {
    const { error } = await service.auth.admin.deleteUser(user.id);

    if (error) {
      console.log(
        `⚠️  cleanup failed for ${user.role} ${user.id}: ${error.message}`
      );
    } else {
      deleted++;
    }
  }

  console.log(`Cleanup deleted ${deleted}/${users.length} test users.`);
}

async function main() {
  console.log('==== AUTH + RLS VERIFICATION ====');
  console.log(`url=${SUPABASE_URL}`);
  console.log(`runId=${runId}`);

  console.log('\n==== [1/4] CREATE TEST USERS ====');

  const roles: Role[] = [
    'admin',
    'supplier',
    'delivery_rider',
    'customer',
  ];

  for (const role of roles) {
    await createTestUser(role);
  }

  console.log('\n==== [2/4] AUTHENTICATION + USER ROLES ====');

  const clients = new Map<Role, SupabaseClient>();

  for (const user of users) {
    try {
      const client = await signIn(user);
      clients.set(user.role, client);
      pass(`signIn(${user.role}) -> authenticated`);

      const { data, error } = await client
        .from('user_roles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        fail(`user_roles read(${user.role}) error: ${error.message}`);
      } else if (!data) {
        fail(`user_roles read(${user.role}) returned no row`);
      } else if (data.role !== user.role) {
        fail(
          `user_roles[${user.role}] = '${data.role}' (expected '${user.role}')`
        );
      } else {
        pass(
          `user_roles[${user.role}] = '${data.role}' (exactly the intended role)`
        );
      }
    } catch (error) {
      fail(
        `${user.role} authentication failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  console.log('\n==== [3/4] ADMIN/SUPPLIER/RIDER RECOGNITION ====');

  const rpcTests: Array<{
    role: Role;
    rpc: 'is_admin' | 'is_supplier' | 'is_delivery_rider';
    expected: boolean;
  }> = [
    { role: 'admin', rpc: 'is_admin', expected: true },
    { role: 'supplier', rpc: 'is_supplier', expected: true },
    { role: 'delivery_rider', rpc: 'is_delivery_rider', expected: true },

    { role: 'supplier', rpc: 'is_admin', expected: false },
    { role: 'delivery_rider', rpc: 'is_admin', expected: false },
    { role: 'customer', rpc: 'is_admin', expected: false },
    { role: 'customer', rpc: 'is_supplier', expected: false },
    { role: 'customer', rpc: 'is_delivery_rider', expected: false },
  ];

  for (const test of rpcTests) {
    const client = clients.get(test.role);

    if (!client) {
      fail(`${test.rpc}() skipped for ${test.role}: no authenticated client`);
      continue;
    }

    const { data, error } = await client.rpc(test.rpc);

    if (error) {
      fail(`${test.rpc}() for ${test.role}: ${error.message}`);
    } else if (data !== test.expected) {
      fail(
        `${test.rpc}() = ${data} for ${test.role} (expected ${test.expected})`
      );
    } else {
      pass(`${test.rpc}() = ${data} for ${test.role}`);
    }
  }

  const customer = clients.get('customer');
  const admin = clients.get('admin');

  if (!customer || !admin) {
    throw new Error('Customer/admin client unavailable; cannot run RLS checks.');
  }

  const { data: customerRole, error: customerRoleError } = await customer
    .from('user_roles')
    .select('role')
    .eq('id', users.find((u) => u.role === 'customer')!.id)
    .maybeSingle();

  if (customerRoleError) {
    fail(`customer role read: ${customerRoleError.message}`);
  } else if (customerRole?.role === 'customer') {
    pass(
      'customer is recognized: user_roles.role = "customer" and privileged RPCs are false'
    );
  } else {
    fail(
      `customer user_roles.role = '${customerRole?.role ?? 'undefined'}' (expected 'customer')`
    );
  }

  console.log('\n==== [4/4] site_settings RLS ACCESS ====');

  {
    const { data, error } = await customer
      .from('site_settings')
      .select('key,value')
      .limit(5);

    if (error) {
      fail(`customer SELECT site_settings: ${error.message}`);
    } else {
      pass(`customer SELECT site_settings OK (${data?.length ?? 0} rows)`);
    }
  }

  {
    const testKey = `e2e_cleanup_probe_${Date.now()}`;

    const { data, error } = await customer
      .from('site_settings')
      .insert({ key: testKey, value: '{}' })
      .select('key');

    if (error || !data || data.length === 0) {
      pass(
        `customer INSERT denied${
          error
            ? ` (${error.message.slice(0, 80)})`
            : ' (0 rows affected by RLS)'
        }`
      );
    } else {
      fail('customer INSERT was ALLOWED');
    }
  }

  {
    const { data, error } = await customer
      .from('site_settings')
      .update({ value: '{}' })
      .eq('key', 'max_orders_per_day')
      .select('key');

    if (error) {
      pass(`customer UPDATE denied (${error.message.slice(0, 80)})`);
    } else if (!data || data.length === 0) {
      pass('customer UPDATE denied (0 rows affected by RLS)');
    } else {
      fail('customer UPDATE was ALLOWED');
    }
  }

  {
    const { data, error } = await customer
      .from('site_settings')
      .delete()
      .eq('key', 'max_orders_per_day')
      .select('key');

    if (error) {
      pass(`customer DELETE denied (${error.message.slice(0, 80)})`);
    } else if (!data || data.length === 0) {
      pass('customer DELETE denied (0 rows affected by RLS)');
    } else {
      fail('customer DELETE was ALLOWED');
    }
  }

  {
    const { data: current, error: readError } = await admin
      .from('site_settings')
      .select('value')
      .eq('key', 'max_orders_per_day')
      .maybeSingle();

    if (readError) {
      fail(`admin read site_settings failed: ${readError.message}`);
    } else if (!current) {
      fail('required site_settings row max_orders_per_day is missing');
    } else {
      const originalValue = current.value;

      const { data, error } = await admin
        .from('site_settings')
        .update({ value: originalValue })
        .eq('key', 'max_orders_per_day')
        .select('key');

      if (error) {
        fail(`admin UPDATE site_settings FAILED: ${error.message}`);
      } else if (!data || data.length === 0) {
        fail('admin UPDATE site_settings affected 0 rows');
      } else {
        pass('admin UPDATE site_settings OK');
      }
    }
  }

  console.log('\n==== RESULT ====');

  if (failures === 0) {
    console.log('FAILURES: 0');
    console.log('🎉 ALL CHECKS PASS');
  } else {
    console.log(`FAILURES: ${failures}`);
  }
}

main()
  .catch((error) => {
    console.error('\n💥 FATAL ERROR');
    console.error(error);
    failures++;
  })
  .finally(async () => {
    await cleanup();

    if (failures > 0) {
      process.exitCode = 1;
    }
  });
