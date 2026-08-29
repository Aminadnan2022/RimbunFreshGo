import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');
const [migration, supplier, tracking, email, notificationClient] = await Promise.all([
  read('supabase/migrations/20261123000000_allow_pre_payment_weight_corrections.sql'),
  read('src/pages/SupplierDashboardPage.tsx'),
  read('src/pages/OrderTrackingPage.tsx'),
  read('supabase/functions/transactional-email-dispatcher/email.ts'),
  read('src/data/notifications.ts'),
]);

const required = [
  'reprice_final_sales_order_after_weight_correction',
  "v_order.payment_status = 'receipt_submitted'",
  "v_order.payment_status = 'paid'",
  "v_order.payment_status NOT IN ('pending', 'rejected')",
  'FOR UPDATE OF o',
  "v_operation = 'price_correction'",
  "'final_amount_updated'",
  "'previous_final_total'",
  'gen_random_uuid()',
  'DROP FUNCTION IF EXISTS public.submit_sales_order_payment_receipt(uuid, text, text, text, integer)',
  'round(p_expected_final_total, 2) <> round(v_order.final_total, 2)',
  'CREATE OR REPLACE FUNCTION public.enqueue_web_push_delivery()',
  'CREATE OR REPLACE FUNCTION public.enqueue_transactional_email()',
];
const failures = required.filter((token) => !migration.includes(token)).map((token) => `migration missing ${token}`);

for (const rpc of [
  'record_sales_order_line_actual_weight',
  'record_sales_order_line_unit_actual_weight',
  'record_sales_order_line_component_actual_weight',
  'record_sales_order_line_component_unit_actual_weight',
]) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${rpc}`);
  const body = start < 0 ? '' : migration.slice(start, migration.indexOf('$$;', start));
  if (!body.includes("payment_status = 'receipt_submitted'")) failures.push(`${rpc} must block receipt_submitted`);
  if (!body.includes("payment_status = 'paid'")) failures.push(`${rpc} must block paid`);
  if (body.includes('already finalised')) failures.push(`${rpc} must not use finalisation as a weight lock`);
}

if (!supplier.includes('canonicalPaymentStatus')) failures.push('supplier UI must retain raw canonical payment state');
if (!supplier.includes("['receipt_submitted', 'paid']")) failures.push('supplier UI lock must follow the four-state rule');
if (!supplier.includes('receiptUnderReview')) failures.push('supplier UI must explain receipt-under-review lock');
if (!tracking.includes('p_expected_final_total: canonicalPayment.finalTotal')) failures.push('receipt submission must include the displayed final total');
if (!email.includes('final_amount_updated') || !email.includes('Previous amount')) failures.push('email renderer must show previous and updated amounts');
if (!notificationClient.includes("case 'final_amount_updated'")) failures.push('amount update notification must open the order');
if (/UPDATE\s+public\.(?:products?|product_versions|supplier_price_history|selling_price_history)/i.test(migration)) {
  failures.push('correction migration must not mutate catalog or pricing-history snapshots');
}

if (failures.length) throw new Error(`Pre-payment weight correction checks failed:\n- ${failures.join('\n- ')}`);
console.log('Pre-payment weight correction checks passed (payment lock states, frozen-rate repricing, stale receipt guard, and notifications).');
