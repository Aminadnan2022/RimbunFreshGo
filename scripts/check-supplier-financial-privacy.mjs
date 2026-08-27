import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const supplier = read('src/pages/SupplierDashboardPage.tsx');
const reports = read('src/pages/BusinessReportsPage.tsx');
const adminHistory = read('src/pages/AdminHistoricalDataPage.tsx');
const migration = read('supabase/migrations/20261117000000_secure_legacy_supplier_order_operations.sql');
const failures = [];

const supplierOnlyLabels = [
  'weightEntry.labels.supplierCost',
  'weightEntry.labels.grossProfit',
  'weightEntry.labels.deliveryFee',
  'supplierOrder.labels.supplierCost',
  'supplierOrder.labels.grossProfit',
  'supplierOrder.labels.deliveryFee',
  'deliverySchedule.labels.deliveryFee',
];

for (const label of supplierOnlyLabels) {
  if (supplier.includes(label)) failures.push(`supplier UI still renders internal label: ${label}`);
}

for (const helper of ['orderGrossProfit(', 'orderCost(', 'marginPercent(']) {
  if (supplier.includes(helper)) failures.push(`supplier UI still calculates an internal metric for display: ${helper}`);
}

if (supplier.includes('formatCurrency(')) {
  failures.push('supplier UI still formats monetary values for display');
}

for (const token of ['supplier_record_legacy_order_weight', 'record_sales_order_line_actual_weight', 'record_sales_order_line_unit_actual_weight']) {
  if (!supplier.includes(token)) failures.push(`supplier finalisation data path was unexpectedly removed: ${token}`);
}

for (const field of ['unit_selling_price', 'unit_cost_price', 'delivery_fee', 'gross_profit', 'costPrice']) {
  if (supplier.includes(field)) failures.push(`canonical supplier query still fetches unnecessary financial field: ${field}`);
}

const detailStart = supplier.indexOf('function OrderDetailsView(');
if (detailStart < 0) {
  failures.push('supplier View Order detail component is missing');
} else {
  const detail = supplier.slice(detailStart);
  for (const token of [
    'formatCurrency(',
    'RM{',
    'item.price',
    'order.deliveryFee',
    'orderCost(',
    'orderGrossProfit(',
    'marginPercent(',
    'supplierOrder.labels.supplierCost',
    'supplierOrder.labels.grossProfit',
    'supplierOrder.labels.deliveryFee',
    'supplierOrder.labels.grandTotal',
  ]) {
    if (detail.includes(token)) failures.push(`supplier View Order still exposes financial content: ${token}`);
  }

  for (const operationalToken of [
    'order.orderRef',
    'order.items.map(',
    'item.quantity',
    'item.preparation',
    'order.supplierWeights',
    'order.orderNotes',
    '<PaymentBadge status={order.paymentStatus}',
  ]) {
    if (!detail.includes(operationalToken)) failures.push(`supplier View Order lost operational content: ${operationalToken}`);
  }
}

if (supplier.includes("supplier_snapshot, ordering_mode")) {
  failures.push('canonical supplier browser query still fetches the cost-bearing supplier snapshot');
}

for (const token of [
  "supabase.rpc('supplier_list_legacy_orders')",
  "supabase.rpc(\n        'supplier_mark_legacy_order_ready'",
  "supabase.rpc(\n        'supplier_record_legacy_order_weight'",
]) {
  if (!supplier.includes(token)) failures.push(`supplier network path is not using protected RPC: ${token}`);
}

if (/\.from\(["']Orders["']\)/.test(supplier)) {
  failures.push('supplier browser code still reads or updates the raw legacy Orders table');
}

for (const token of [
  'SECURITY DEFINER',
  'public.is_supplier()',
  'supplier_operational_order_item',
  'supplier_record_legacy_order_weight',
  'supplier_mark_legacy_order_ready',
  'DROP POLICY IF EXISTS "supplier_select_orders"',
  'DROP POLICY IF EXISTS "supplier_update_orders"',
]) {
  if (!migration.includes(token)) failures.push(`legacy privacy migration is missing: ${token}`);
}

for (const field of [
  "'price'", "'costPrice'", "'grossProfit'", "'selling_price_per_unit'",
  "'supplier_cost_per_unit'", "'selling_total'", "'supplier_total'",
  "'gross_profit'", "'profit_margin_percent'",
]) {
  if (!migration.includes(field)) failures.push(`legacy operational response does not strip financial field: ${field}`);
}

for (const token of ['businessReports.table.profit', 'businessReports.table.cost', 'businessReports.table.margin']) {
  if (!reports.includes(token)) failures.push(`admin reporting metric was unexpectedly removed: ${token}`);
}

for (const token of ['supplier_cost_amount', 'gross_profit_amount']) {
  if (!adminHistory.includes(token)) failures.push(`admin historical metric was unexpectedly removed: ${token}`);
}

if (failures.length) {
  console.error('Supplier financial privacy checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Supplier financial privacy checks passed: internal metrics are hidden while finalisation and admin/reporting data paths remain present.');
