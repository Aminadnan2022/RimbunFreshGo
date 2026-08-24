import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const component = readFileSync(resolve(root, 'src/components/admin/AdminCanonicalOrderHistory.tsx'), 'utf8');
const admin = readFileSync(resolve(root, 'src/pages/AdminProductsPage.tsx'), 'utf8');
const batches = readFileSync(resolve(root, 'src/components/admin/CanonicalSupplierDeliveryBatches.tsx'), 'utf8');
const supplier = readFileSync(resolve(root, 'src/pages/SupplierDashboardPage.tsx'), 'utf8');
const rider = readFileSync(resolve(root, 'src/pages/DeliveryDashboardPage.tsx'), 'utf8');
const failures = [];

for (const token of [
  "from('sales_orders')",
  "from('sales_order_lines')",
  "from('sales_order_preparation_answers')",
  "from('sales_order_payment_receipts')",
  "from('sales_order_supplier_fulfilments')",
  "from('canonical_supplier_delivery_batches')",
  "from('canonical_sales_order_deliveries')",
  'fetchCustomerCanonicalDeliveryProofs',
  'final_total ?? order.estimated_total',
  'Search order number, customer or phone',
  'Pending Payment',
  'Paid / Preparing',
  'Out for Delivery',
  '>Orders<',
  'Order history',
  'Search, filter and review current and past orders.',
]) if (!component.includes(token)) failures.push(`missing canonical history guard: ${token}`);

for (const forbidden of ['Canonical Orders', 'Legacy / Historical Orders', 'Pre-canonical records only']) {
  if (component.includes(forbidden)) failures.push(`Admin Orders exposes architecture wording: ${forbidden}`);
}
if (!admin.includes('AdminCanonicalOrderHistory paymentVerification={<CanonicalPaymentVerificationQueue />} />')) {
  failures.push('Admin Orders must compose payment verification with the single order-history view');
}
if (admin.includes('legacy={<OrdersTab />}') || admin.includes('function OrdersTab()')) {
  failures.push('Admin Orders must not retain the obsolete duplicate orders table');
}
for (const [source, token] of [
  [batches, 'Canonical Supplier → Hub Batches'],
  [batches, 'No canonical supplier delivery batches yet.'],
  [supplier, 'Waiting for FreshGo canonical delivery batch / hub dispatch.'],
  [rider, 'Canonical FreshGo hub → customer deliveries'],
  [rider, 'No canonical deliveries assigned to you.'],
]) if (source.includes(token)) failures.push(`portal exposes architecture wording: ${token}`);
for (const [source, token] of [
  [batches, 'Supplier Delivery Batches'],
  [batches, 'Ready for Supplier Dispatch'],
  [batches, 'Hub → Customer Delivery'],
  [supplier, 'Waiting for a FreshGo delivery batch and hub dispatch.'],
  [rider, 'FreshGo Hub → Customer Deliveries'],
]) if (!source.includes(token)) failures.push(`missing plain business wording: ${token}`);
if (admin.match(/<CanonicalPaymentVerificationQueue \/>/g)?.length !== 1) {
  failures.push('Payment verification must render exactly once at the cohesive Orders page level');
}
if (/\.insert\(|\.update\(|\.delete\(|\.rpc\([^)]*(confirm|reject|archive)/i.test(component)) {
  failures.push('order history must remain read-only');
}

if (failures.length) {
  console.error('Admin Canonical Order History checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Admin Orders checks passed: plain wording, one order-history view, payment verification, and read-only detail coverage are present.');
