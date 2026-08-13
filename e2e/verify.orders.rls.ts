import fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Role = 'admin' | 'customer';

type TestUser = {
  id: string;
  email: string;
  password: string;
  role: Role;
};

function loadTestEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const content = fs.readFileSync('.env.test', 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const i = line.indexOf('=');
    if (i <= 0) continue;

    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = value;
  }

  return env;
}

const env = loadTestEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = env.TEST_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY or TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test',
  );
}

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function userClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let failures = 0;
const createdUsers: TestUser[] = [];
let testOrderId: number | null = null;

function pass(message: string) {
  console.log(`✅ PASS: ${message}`);
}

function fail(message: string) {
  console.log(`❌ FAIL: ${message}`);
  failures++;
}

function fatal(message: string): never {
  throw new Error(message);
}

async function createUser(role: Role, runId: string): Promise<TestUser> {
  const email = `${role}.orders-${runId.toLowerCase()}@example.com`;
  const password = `OrdersE2E!${Date.now()}Aa1`;

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    fatal(`create ${role} failed: ${error?.message ?? 'no user returned'}`);
  }

  const user: TestUser = {
    id: data.user.id,
    email,
    password,
    role,
  };

  const { error: roleError } = await service
    .from('user_roles')
    .upsert({ id: user.id, role: user.role });

  if (roleError) {
    await service.auth.admin.deleteUser(user.id);
    fatal(`user_roles upsert for ${role} failed: ${roleError.message}`);
  }

  createdUsers.push(user);
  console.log(`created ${role}: id=${user.id} email=${user.email}`);
  return user;
}

async function signIn(user: TestUser): Promise<SupabaseClient> {
  const client = userClient();

  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });

  if (error || !data.session) {
    fatal(`signIn(${user.role}) failed: ${error?.message ?? 'no session'}`);
  }

  pass(`signIn(${user.role}) -> authenticated`);
  return client;
}

/*
 * This payload intentionally mirrors src/context/OrderContext.tsx -> toRow().
 * user_id is NOT supplied because the Orders migration defines:
 *   user_id uuid DEFAULT auth.uid()
 *
 * This is a security test, not a checkout test, so the item payload is
 * deliberately minimal but follows the application's JSON shape.
 */
function buildTestOrder(runId: string) {
  const now = new Date().toISOString();

  return {
    full_name: 'E2E Customer A',
    phone_number: '0100000000',
    email_address: `customer-a-${runId.toLowerCase()}@example.com`,
    street_address: '',
    postcode: '',
    city: '',
    state: 'Selangor',
    apartment: 'E2E Test Apartment',
    house_unit: 'E2E-01-01',
    pickup_location: 'E2E Test Location',
    delivery_point_name: 'E2E Test Location',
    delivery_method: '',
    order_notes: `Orders RLS test ${runId}`,

    item_options: [
      {
        productId: 'e2e-test-product',
        name: 'E2E Test Product',
        preparation: null,
      },
    ],

    order_items: [
      {
        productId: 'e2e-test-product',
        name: 'E2E Test Product',
        price: 10,
        costPrice: 0,
        quantity: 1,
        pricingType: 'fixed_quantity',
        grossProfit: 10,
      },
    ],

    delivery_slot: 'E2E TEST',
    order_summary: {
      status: 'confirmed',
      deliveryDate: now.slice(0, 10),
      deliveryWindow: 'E2E TEST',
      statusTimeline: [
        {
          status: 'confirmed',
          time: now,
          done: true,
        },
      ],
      orderRef: `E2E-${runId}`,
    },

    subtotal: 10,
    delivery_fee: 0,
    total: 10,
    gross_profit: 10,
  };
}

async function cleanup() {
  console.log('==== CLEANUP TEST DATA ====');

  if (testOrderId !== null) {
    const { error } = await service
      .from('Orders')
      .delete()
      .eq('id', testOrderId);

    if (error) {
      console.log(`⚠️  Order cleanup warning: ${error.message}`);
    } else {
      console.log(`Order cleanup: ${testOrderId}`);
    }
  }

  let deleted = 0;

  for (const user of createdUsers) {
    const { error } = await service.auth.admin.deleteUser(user.id);

    if (!error) {
      deleted++;
    } else {
      console.log(
        `⚠️  User cleanup warning (${user.role}): ${error.message}`,
      );
    }
  }

  console.log(`Cleanup deleted ${deleted}/${createdUsers.length} test users.`);
}

async function main() {
  const runId = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;

  console.log('==== ORDERS CUSTOMER RLS VERIFICATION ====');
  console.log(`url=${SUPABASE_URL}`);
  console.log(`runId=E2E-ORDERS-${runId}`);

  try {
    console.log('==== [1/6] CREATE TEST USERS ====');

    const customerA = await createUser('customer', runId + '-A');
    const customerB = await createUser('customer', runId + '-B');
    const admin = await createUser('admin', runId + '-ADMIN');

    console.log('==== [2/6] CUSTOMER A INSERT OWN ORDER ====');

    const customerAClient = await signIn(customerA);
    const orderPayload = buildTestOrder(runId);

    const {
      data: inserted,
      error: insertError,
    } = await customerAClient
      .from('Orders')
      .insert(orderPayload)
      .select('id,user_id,order_summary')
      .single();

    if (insertError) {
      fail(`customer A INSERT own order failed: ${insertError.message}`);
    } else if (!inserted) {
      fail('customer A INSERT returned no row');
    } else {
      testOrderId = Number(inserted.id);

      if (inserted.user_id === customerA.id) {
        pass(
          `customer A INSERT own order succeeded and user_id auto-bound to auth.uid() (order=${testOrderId})`,
        );
      } else {
        fail(
          `order user_id mismatch: expected ${customerA.id}, got ${inserted.user_id}`,
        );
      }
    }

    if (testOrderId === null) {
      return;
    }

    console.log('==== [3/6] CUSTOMER A CAN READ OWN ORDER ====');

    const {
      data: ownOrder,
      error: ownReadError,
    } = await customerAClient
      .from('Orders')
      .select('id,user_id,total')
      .eq('id', testOrderId)
      .maybeSingle();

    if (ownReadError) {
      fail(`customer A SELECT own order failed: ${ownReadError.message}`);
    } else if (!ownOrder) {
      fail('customer A SELECT own order returned no row');
    } else {
      pass('customer A can SELECT own order');
    }

    console.log('==== [4/6] CUSTOMER B CANNOT READ CUSTOMER A ORDER ====');

    const customerBClient = await signIn(customerB);

    const {
      data: otherOrder,
      error: otherReadError,
    } = await customerBClient
      .from('Orders')
      .select('id,user_id,total')
      .eq('id', testOrderId)
      .maybeSingle();

    if (otherReadError) {
      fail(
        `customer B SELECT other order returned an unexpected error: ${otherReadError.message}`,
      );
    } else if (otherOrder) {
      fail('customer B CAN SELECT customer A order');
    } else {
      pass('customer B cannot SELECT customer A order');
    }

    console.log('==== [5/6] CUSTOMER CANNOT UPDATE / DELETE ORDER ====');

    const {
      data: updateData,
      error: updateError,
    } = await customerAClient
      .from('Orders')
      .update({
        order_notes: 'UNAUTHORIZED CUSTOMER UPDATE',
      })
      .eq('id', testOrderId)
      .select('id');

    if (updateError) {
      pass(`customer UPDATE denied: ${updateError.message}`);
    } else if (!updateData || updateData.length === 0) {
      pass('customer UPDATE denied (0 rows affected by RLS)');
    } else {
      fail('customer UPDATE was ALLOWED');
    }

    const {
      data: deleteData,
      error: deleteError,
    } = await customerAClient
      .from('Orders')
      .delete()
      .eq('id', testOrderId)
      .select('id');

    if (deleteError) {
      pass(`customer DELETE denied: ${deleteError.message}`);
    } else if (!deleteData || deleteData.length === 0) {
      pass('customer DELETE denied (0 rows affected by RLS)');
    } else {
      fail('customer DELETE was ALLOWED');
    }

    console.log('==== [6/6] ADMIN CAN READ + DELETE TEST ORDER ====');

    const adminClient = await signIn(admin);

    const {
      data: adminOrder,
      error: adminReadError,
    } = await adminClient
      .from('Orders')
      .select('id,user_id,total')
      .eq('id', testOrderId)
      .maybeSingle();

    if (adminReadError) {
      fail(`admin SELECT failed: ${adminReadError.message}`);
    } else if (!adminOrder) {
      fail('admin cannot SELECT test order');
    } else {
      pass('admin can SELECT test order');
    }

    const {
      data: adminDeleteData,
      error: adminDeleteError,
    } = await adminClient
      .from('Orders')
      .delete()
      .eq('id', testOrderId)
      .select('id');

    if (adminDeleteError) {
      fail(`admin DELETE failed: ${adminDeleteError.message}`);
    } else if (!adminDeleteData || adminDeleteData.length === 0) {
      fail('admin DELETE affected 0 rows');
    } else {
      pass('admin can DELETE test order');
      testOrderId = null;
    }

    console.log('==== RESULT ====');

    if (failures === 0) {
      console.log('FAILURES: 0');
      console.log('🎉 ALL CUSTOMER ORDERS RLS CHECKS PASS');
    } else {
      console.log(`FAILURES: ${failures}`);
      process.exitCode = 1;
    }
  } finally {
    await cleanup();
  }
}

main().catch(async (error) => {
  console.error('💥 FATAL ERROR');
  console.error(error);
  await cleanup();
  process.exitCode = 1;
});
