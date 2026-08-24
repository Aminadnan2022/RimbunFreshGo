import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const component = readFileSync(resolve(root, 'src/components/admin/AdminCanonicalOrderHistory.tsx'), 'utf8');
const admin = readFileSync(resolve(root, 'src/pages/AdminProductsPage.tsx'), 'utf8');
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
  'Canonical Orders',
  'Primary operational view',
  'Legacy / Historical Orders',
]) if (!component.includes(token)) failures.push(`missing canonical history guard: ${token}`);

if (!admin.includes('AdminCanonicalOrderHistory paymentVerification={<CanonicalPaymentVerificationQueue />} legacy={<OrdersTab />}')) {
  failures.push('Admin Orders must keep payment verification, canonical history, and legacy orders explicitly separated');
}
if (admin.match(/<CanonicalPaymentVerificationQueue \/>/g)?.length !== 1) {
  failures.push('Payment verification must render exactly once at the cohesive Orders page level');
}
if (/\.insert\(|\.update\(|\.delete\(|\.rpc\([^)]*(confirm|reject|archive)/i.test(component)) {
  failures.push('canonical history must remain read-only');
}

if (failures.length) {
  console.error('Admin Canonical Order History checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Admin Canonical Order History checks passed: canonical-first, snapshot-based, read-only audit coverage is present.');
