import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

type Env = Record<string, string>;

function loadTestEnv(): Env {
  const env: Env = {};
  const content = fs.readFileSync('.env.test', 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');

    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '');

    env[key] = value;
  }

  return env;
}

const env = loadTestEnv();

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = env.TEST_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error('Missing VITE_SUPABASE_URL in .env.test');
}

if (!ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY in .env.test');
}

if (!SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing TEST_SUPABASE_SERVICE_ROLE_KEY in .env.test'
  );
}

if (/production|prod/i.test(SUPABASE_URL)) {
  throw new Error(
    `SAFETY STOP: URL appears to be production: ${SUPABASE_URL}`
  );
}

const service = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

console.log('==== ORDERS SCHEMA DISCOVERY ====');
console.log(`url=${SUPABASE_URL}`);

async function main() {
  console.log('\n==== [1/3] CHECK ORDERS TABLE ====');

  const { error: tableError } =
    await service
      .from('Orders')
      .select('*')
      .limit(0);

  if (tableError) {
    console.error(
      `❌ Orders table query failed: ${tableError.message}`
    );
    process.exitCode = 1;
    return;
  }

  console.log('✅ PASS: public."Orders" is accessible');

  console.log('\n==== [2/3] CHECK ORDERS COLUMNS ====');

  const { data: columns, error: columnsError } =
    await service.rpc('get_orders_schema_for_e2e');

  if (columnsError) {
    console.log(
      'ℹ️  Schema RPC does not exist; using information_schema via REST is not available.'
    );
    console.log(
      'ℹ️  We will use the column information already confirmed from the SQL audit.'
    );
  } else {
    console.log(columns);
  }

  console.log('\n==== [3/3] CHECK ORDERS RLS STATUS ====');

  console.log(
    'ℹ️  RLS/policy verification will be performed after we confirm the exact required INSERT columns.'
  );

  console.log('\n==== RESULT ====');
  console.log('✅ Orders table exists.');
  console.log(
    '⏸️  No test order was created and no production/test data was modified.'
  );
}

main().catch((error) => {
  console.error('\n💥 FATAL ERROR');
  console.error(error);
  process.exitCode = 1;
});