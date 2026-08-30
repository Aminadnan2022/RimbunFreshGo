import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const finalisation = read('supabase/migrations/20261128000000_separate_customer_price_and_combo_procurement_finalisation.sql');
const privacyExpand = read('supabase/migrations/20261128000001_supplier_financial_privacy_expand.sql');
const privacyContract = read('supabase/migrations/20261128000002_supplier_financial_privacy_contract.sql');
const supplier = read('src/pages/SupplierDashboardPage.tsx');
const products = read('src/data/products.ts');
const prelaunch = read('e2e/prelaunch-canonical.ts');
const failures = [];

for (const token of [
  "AND item_kind = 'product'",
  'Procurement-only combo measurements are opportunistic',
  'HAVING count(*) = count(c.final_supplier_cost)',
  "IF v_previous_final_total IS DISTINCT FROM v_final_total THEN",
  "v_order.payment_status = 'receipt_submitted'",
  "v_order.payment_status = 'paid'",
  'PERFORM public.reprice_final_sales_order_after_weight_correction(p_sales_order_id)',
]) {
  if (!finalisation.includes(token)) failures.push(`finalisation migration missing: ${token}`);
}

const helperStart = finalisation.indexOf('CREATE OR REPLACE FUNCTION public.phase4c6_finalize_if_measurements_complete');
const helper = finalisation.slice(helperStart, finalisation.indexOf('$$;', helperStart));
if (/sales_order_line_components/.test(helper)) {
  failures.push('customer-finality helper still waits on combo components');
}

for (const policy of [
  'phase4c1_sales_orders_supplier_select',
  'phase4c1_sales_order_lines_supplier_select',
  'phase4c1_sales_order_line_units_supplier_select',
  'phase4c1_sales_order_line_components_supplier_select',
  'phase4c1_sales_order_line_component_units_supplier_select',
  'phase4c1_sales_order_preparation_answers_supplier_select',
]) {
  if (!privacyContract.includes(`DROP POLICY IF EXISTS ${policy}`)) failures.push(`contract does not remove raw supplier policy: ${policy}`);
}

for (const token of [
  'CREATE OR REPLACE FUNCTION public.supplier_get_canonical_work()',
  'SECURITY DEFINER',
  "RAISE EXCEPTION 'Supplier access required.'",
  'CREATE OR REPLACE FUNCTION public.admin_list_products',
  'CREATE OR REPLACE FUNCTION public.admin_read_legacy_financial_report',
]) {
  if (!privacyExpand.includes(token)) failures.push(`privacy expand migration missing: ${token}`);
}
for (const forbiddenExpandMutation of [
  'DROP POLICY IF EXISTS phase4c1_',
  'REVOKE SELECT ON TABLE public.sales_order_lines',
  'REVOKE SELECT ON TABLE public.sales_order_line_components',
  'REVOKE SELECT ON TABLE public."Product"',
  'REVOKE SELECT ON TABLE\n  public.vw_order_item_flat',
]) {
  if (privacyExpand.includes(forbiddenExpandMutation)) {
    failures.push(`privacy expand is not backward compatible: ${forbiddenExpandMutation}`);
  }
}
for (const token of [
  'REVOKE SELECT ON TABLE public.sales_order_lines FROM authenticated',
  'REVOKE SELECT ON TABLE public.sales_order_line_components FROM authenticated',
  'REVOKE SELECT ON TABLE public."Product" FROM anon, authenticated',
  'public.vw_order_item_flat',
  'public.vw_order_profit',
  'FROM anon, authenticated',
]) {
  if (!privacyContract.includes(token)) failures.push(`privacy contract migration missing: ${token}`);
}

const safeProjectionStart = privacyExpand.indexOf('CREATE OR REPLACE FUNCTION public.supplier_get_canonical_work()');
const safeProjection = privacyExpand.slice(safeProjectionStart, privacyExpand.indexOf('$$;', safeProjectionStart));
for (const forbiddenReference of [
  'l.unit_cost_price', 'l.estimated_supplier_cost', 'l.final_supplier_cost',
  'l.supplier_snapshot', 'c.unit_cost_price', 'c.estimated_supplier_cost',
  'c.final_supplier_cost', 'c.supplier_snapshot',
]) {
  if (safeProjection.includes(forbiddenReference)) failures.push(`supplier projection exposes ${forbiddenReference}`);
}
if (!safeProjection.includes("l.product_snapshot - ARRAY[") || !safeProjection.includes("c.product_snapshot - ARRAY[")) {
  failures.push('supplier projection does not strip financial keys from JSON snapshots');
}

if (!supplier.includes("supabase.rpc('supplier_get_canonical_work')")) {
  failures.push('supplier dashboard does not use the safe canonical RPC');
}
for (const rawTable of [
  'sales_orders', 'sales_order_lines', 'sales_order_line_units',
  'sales_order_line_components', 'sales_order_line_component_units',
]) {
  if (supplier.includes(`.from('${rawTable}')`)) failures.push(`supplier dashboard still reads raw ${rawTable}`);
}
if (!products.includes('PUBLIC_SELECT') || !products.includes("supabase.rpc('admin_list_products'")) {
  failures.push('Product reads are not split into public-safe and admin-only paths');
}
if (/const PUBLIC_SELECT = [^;]*(cost_price|cost_supplier_name)/.test(products)) {
  failures.push('public Product projection still includes procurement fields');
}

for (const scenario of [
  'mixed standalone weighted + fixed combo finalisation semantics',
  'late combo procurement weight leaves customer total/finality/notifications unchanged',
  'post-expand supplier safe projection and ownership',
  'post-contract supplier safe projection and database financial privacy',
]) {
  if (!prelaunch.includes(scenario)) failures.push(`live prelaunch regression missing: ${scenario}`);
}
for (const stageToken of [
  "process.env.PRIVACY_ROLLOUT_STAGE === 'expand'",
  "if (privacyRolloutStage === 'contract')",
  'EXPAND validation intentionally preserves the old frontend read paths until cutover.',
]) {
  if (!prelaunch.includes(stageToken)) failures.push(`privacy rollout stage handling missing: ${stageToken}`);
}

if (failures.length) {
  console.error(`Pre-launch correctness blocker checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Pre-launch blocker checks passed (customer-price finality and supplier database financial privacy).');
