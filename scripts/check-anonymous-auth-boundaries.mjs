import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const migrationPath = path.join(
  root,
  'supabase/migrations/20261201000000_anonymous_auth_boundary_hardening.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const guestMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261130000000_freshgo_guest_checkout.sql'),
  'utf8',
);

const failures = [];
const requireText = (source, text, label) => {
  if (!source.includes(text)) failures.push(label);
};

requireText(migration, 'CREATE OR REPLACE FUNCTION public.is_permanent_authenticated_user()', 'missing reusable permanent-user JWT predicate');
requireText(migration, "COALESCE(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'", 'permanent-user predicate does not deny anonymous JWTs');
requireText(migration, 'IF COALESCE(NEW.is_anonymous, false) THEN', 'auth.users consent trigger does not admit anonymous identity creation');
requireText(migration, "current_setting('freshgo.guest_checkout', true) IS DISTINCT FROM 'verified'", 'canonical checkout lacks verified guest-wrapper gate');

for (const policy of [
  'permanent_customer_profiles_boundary',
  'permanent_legacy_orders_boundary',
  'permanent_notifications_boundary',
  'permanent_push_subscriptions_boundary',
  'permanent_delivery_batches_boundary',
  'anonymous_receipt_insert_boundary',
  'anonymous_delivery_proof_read_boundary',
]) {
  requireText(migration, `CREATE POLICY ${policy}`, `missing ${policy}`);
}

for (const oldPolicy of [
  '"Authenticated users can upload"',
  '"Authenticated users can update"',
  '"Authenticated users can delete"',
  '"Branding Authenticated users can upload"',
  '"Branding Authenticated users can update"',
  '"Branding Authenticated users can delete"',
]) {
  requireText(migration, `DROP POLICY IF EXISTS ${oldPolicy}`, `legacy broad storage policy is not dropped: ${oldPolicy}`);
}

for (const fn of [
  'place_sales_order',
  'submit_sales_order_payment_receipt',
  'record_order_preparation_snapshot',
  'get_sales_order_payment_display',
  'get_sales_order_supplier_fulfilment_tracking',
  'get_sales_order_canonical_delivery_tracking',
  'get_sales_order_canonical_rider_tracking',
  'get_sales_order_canonical_delivery_proofs',
  'can_read_canonical_delivery_proof_object',
  'tracking_rider_name',
  'upsert_own_push_subscription',
  'disable_own_push_subscription',
]) {
  const start = migration.indexOf(`FUNCTION public.${fn}(`);
  const next = migration.indexOf('CREATE OR REPLACE FUNCTION public.', start + 1);
  const body = start >= 0 ? migration.slice(start, next >= 0 ? next : migration.length) : '';
  if (!body.includes('is_permanent_authenticated_user()') && fn !== 'place_sales_order') {
    failures.push(`${fn} lacks a permanent-user boundary`);
  }
}

requireText(guestMigration, "NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false)", 'guest placement no longer requires an anonymous JWT');
requireText(guestMigration, 'public.has_guest_sales_order_session_path', 'guest receipt upload is not tied to a verified order session');
requireText(guestMigration, "p_storage_path !~ ('^guest/' || p_sales_order_id::text", 'guest receipt RPC path is not order scoped');

const frontendGuards = [
  'src/context/AuthContext.tsx',
  'src/pages/OrdersPage.tsx',
  'src/pages/OrderTrackingPage.tsx',
  'src/pages/ProfilePage.tsx',
  'src/pages/PrivacyConsentPage.tsx',
  'src/pages/NotificationsPage.tsx',
];
for (const relative of frontendGuards) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  if (!source.includes('is_anonymous === true')) {
    failures.push(`${relative} does not distinguish anonymous auth from a permanent customer`);
  }
}

if (failures.length > 0) {
  console.error('Anonymous authorization boundary check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Anonymous authorization boundaries are present and guest checkout guards remain intact.');
