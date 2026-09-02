import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const migration = read('supabase/migrations/20261130000000_freshgo_guest_checkout.sql');
const sessionConflictFix = read('supabase/migrations/20261202000000_fix_guest_checkout_session_conflict.sql');
const e2eCleanup = read('supabase/migrations/20261203000000_service_role_canonical_e2e_cleanup.sql');
const checkout = read('src/pages/CheckoutPage.tsx');
const guestClient = read('src/lib/guestCheckout.ts');
const guestAuth = read('src/lib/guestAuth.ts');
const captchaPanel = read('src/components/auth/GuestCaptchaPanel.tsx');
const tracking = read('src/pages/GuestOrderTrackingPage.tsx');
const cart = read('src/pages/CartPage.tsx');
const productCard = read('src/components/ui/ProductCard.tsx');
const comboCard = read('src/components/combo/ComboCard.tsx');
const failures = [];

const requireAll = (label, source, tokens) => {
  for (const token of tokens) if (!source.includes(token)) failures.push(`${label}: missing ${token}`);
};

requireAll('guest success uses canonical pipeline', migration, [
  'CREATE OR REPLACE FUNCTION public.place_guest_sales_order(',
  'FROM public.place_sales_order(',
  'FROM public.place_sales_order_with_checkout_payment_preview(',
  'INSERT INTO public.guest_sales_order_access',
]);
requireAll('required immutable buyer fields', migration, [
  "Customer name is required.", "phone or WhatsApp number is required.",
  "A delivery address is required.", "v_order.customer_snapshot ->> 'phone'",
  "v_order.delivery_snapshot ->> 'house_unit'",
]);
requireAll('256-bit hash-only token access', migration, [
  'access_token_hash bytea NOT NULL', "octet_length(access_token_hash) = 32",
  "extensions.digest(convert_to(p_access_token, 'UTF8'), 'sha256')",
  'char_length(p_access_token) < 43',
]);
if (/access_token\s+text\s+(not null|default)/i.test(migration.replaceAll('p_access_token', ''))) {
  failures.push('raw guest token appears to be persisted');
}
requireAll('non-enumerating verification and cross-order isolation', migration, [
  "RETURN jsonb_build_object('ok', false, 'message', 'Order access could not be verified.')",
  's.sales_order_id = v_order_id', 's.session_identity_id = v_session_id',
  'a.access_token_hash', 'o.order_number = btrim(p_order_number)',
]);
requireAll('registered customer regression boundary', migration, [
  "NOT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false)",
  'AND NOT public.has_current_customer_privacy_consent()',
  'GRANT EXECUTE ON FUNCTION public.place_guest_sales_order',
]);
requireAll('idempotent retry and server pricing', migration, [
  'p_idempotency_key', 'v_existing_hash <> v_token_hash',
  'p_expected_final_total', 'p_expected_payment_configuration_version_id',
]);
requireAll('24-hour scoped guest browser sessions', migration, [
  "expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')",
  's.expires_at > now()',
  'REVOKE ALL ON TABLE public.guest_sales_order_sessions FROM PUBLIC, anon, authenticated',
]);
requireAll('unambiguous guest session upsert', sessionConflictFix, [
  'CREATE OR REPLACE FUNCTION public.place_guest_sales_order(',
  'ON CONFLICT ON CONSTRAINT guest_sales_order_sessions_pkey DO UPDATE',
]);
requireAll('service-role-only canonical E2E cleanup', e2eCleanup, [
  "IF auth.role() <> 'service_role' THEN",
  'REVOKE ALL ON FUNCTION public.e2e_cleanup_canonical_orders(uuid[], uuid[]) FROM PUBLIC, anon, authenticated',
  'GRANT EXECUTE ON FUNCTION public.e2e_cleanup_canonical_orders(uuid[], uuid[]) TO service_role',
]);
requireAll('receipt access scoping', migration, [
  'public.has_guest_sales_order_session_path(split_part(name, \'/\', 2))',
  "bucket_id = 'sales-order-payment-receipts'", "p_storage_path !~ ('^guest/'",
  "p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')",
  'p_file_size > 5242880',
]);
requireAll('canonical progression projection', migration, [
  'sales_order_supplier_fulfilments', 'canonical_supplier_delivery_batch_orders',
  'canonical_sales_order_deliveries', 'canonical_delivery_proofs',
]);
requireAll('bootstrap token session and URL cleanup', tracking, [
  'sessionStorage.setItem', 'window.history.replaceState',
  "supabase.rpc('get_guest_sales_order'", "supabase.rpc('submit_guest_sales_order_payment_receipt'",
  'capture="environment"',
]);
requireAll('private guest tracking link recovery', tracking, [
  'navigator.clipboard.writeText', 'Copy private link', 'https://wa.me/', 'mailto:',
  'Do not share it publicly.',
]);
requireAll('client token generation', guestClient, [
  'const TOKEN_BYTES = 32', 'crypto.getRandomValues', "replace(/\\+/g, '-')",
]);
requireAll('supported Supabase CAPTCHA handoff', guestAuth, [
  'captchaConfigured && !normalizedToken',
  'options: { captchaToken: normalizedToken }',
  'signInAnonymously(credentials)',
]);
requireAll('guest CAPTCHA retry and rapid-tap safety', captchaPanel, [
  'verificationLock.current', 'expired-callback', 'turnstile.reset',
  'Security check is unavailable',
]);
requireAll('guest checkout UX', checkout, ['Guest Checkout', 'isGuestCheckout', 'placeGuestOrder', 'guestOrderUrl']);
if (cart.includes('if (!user)') || productCard.includes('openSignIn') || comboCard.includes('openSignIn')) {
  failures.push('storefront still forces sign-in before guest checkout');
}

const migrationIds = readdirSync(resolve(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql')).map((name) => name.slice(0, 14));
const duplicateIds = migrationIds.filter((id, index) => migrationIds.indexOf(id) !== index);
if (duplicateIds.length) failures.push(`duplicate migration IDs: ${[...new Set(duplicateIds)].join(', ')}`);

if (failures.length) {
  console.error('Guest Checkout checks failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Guest Checkout checks passed: canonical placement, validation, token isolation, non-enumeration, registered regression boundary, idempotency, pricing authority, receipt scoping, and lifecycle projection are present.');
