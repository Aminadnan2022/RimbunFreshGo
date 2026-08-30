import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  hasOutstandingCustomerPriceWeight,
  resolveSupplierWeightPurpose,
} from '../src/lib/supplierWeightFinalisation.ts';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const dashboard = read('src/pages/SupplierDashboardPage.tsx');
const supplierRls = read('supabase/migrations/20260926000000_phase4c1_supplier_canonical_read_access.sql');
const weightCorrection = read('supabase/migrations/20261123000000_allow_pre_payment_weight_corrections.sql');
const failures = [];

for (const token of [
  ".from('sales_order_line_components')",
  ".from('sales_order_line_component_units')",
  'ownedLines.length === 0 && ownedComponents.length === 0',
  "canonicalItemKind: 'direct'",
  "canonicalItemKind: 'combo_component'",
  '[...directItems, ...componentItems]',
  "if (line.item_kind !== 'product') return;",
  'componentQuantityPerCombo * comboQuantity',
  "weightPurpose: resolveSupplierWeightPurpose(component.ordering_mode, 'combo_component')",
  'procurementWeightHint',
  'answersByComponent',
  'supplier_start_canonical_packing',
  'supplier_complete_canonical_packing',
]) {
  if (!dashboard.includes(token)) failures.push(`supplier dashboard is missing combo operation coverage: ${token}`);
}

// A physical unit may exist only for per-fish preparation answers. A fixed
// whole fish such as Siakap must remain non-weighable despite those unit rows.
const fixedWholeFishComponent = {
  orderingMode: 'fixed_quantity',
  physicalUnits: [{ id: 'siakap-1', unitNumber: 1 }],
};
if (fixedWholeFishComponent.physicalUnits.length !== 1) {
  failures.push('fixed whole-fish regression fixture must include a physical unit');
}

const mixedFixedCombo = [
  { orderingMode: 'fixed_quantity' },
  { orderingMode: 'whole_fish_by_weight' },
  { orderingMode: 'weight_only' },
];
if (mixedFixedCombo.some((item) =>
  resolveSupplierWeightPurpose(item.orderingMode, 'combo_component') === 'customer_price'
)) {
  failures.push('a mixed fixed-price combo inherited customer repricing from a standalone component');
}
if (resolveSupplierWeightPurpose(fixedWholeFishComponent.orderingMode, 'combo_component') !== 'none') {
  failures.push('fixed_quantity combo component became weighable merely because it has physical units');
}
for (const mode of ['weight_only', 'slice', 'whole_fish_by_weight']) {
  if (resolveSupplierWeightPurpose(mode, 'direct') !== 'customer_price') {
    failures.push(`standalone weighted mode no longer drives customer-price finalisation: ${mode}`);
  }
  if (resolveSupplierWeightPurpose(mode, 'combo_component') !== 'supplier_cost') {
    failures.push(`weighted combo component no longer remains isolated to supplier-cost tracking: ${mode}`);
  }
}

const readinessCases = [
  {
    name: 'paid fixed-price combo-only order',
    weights: [],
    waiting: false,
  },
  {
    name: 'fixed-price combo with unrecorded weighted Siakap procurement component',
    weights: [{ purpose: 'supplier_cost', submitted: false }],
    waiting: false,
  },
  {
    name: 'standalone weighted Siakap without customer-price weight',
    weights: [{ purpose: 'customer_price', submitted: false }],
    waiting: true,
  },
  {
    name: 'mixed direct weighted line plus fixed combo procurement component',
    weights: [
      { purpose: 'customer_price', submitted: false },
      { purpose: 'supplier_cost', submitted: false },
    ],
    waiting: true,
  },
  {
    name: 'mixed order after direct weighted line is finalised',
    weights: [
      { purpose: 'customer_price', submitted: true },
      { purpose: 'supplier_cost', submitted: false },
    ],
    waiting: false,
  },
];

for (const testCase of readinessCases) {
  if (hasOutstandingCustomerPriceWeight(testCase.weights) !== testCase.waiting) {
    failures.push(`incorrect readiness classification: ${testCase.name}`);
  }
}

for (const token of [
  'hasOutstandingCustomerPriceWeightForOrder',
  'const needsWeighing = orders.filter(hasOutstandingCustomerPriceWeightForOrder)',
  '!hasOutstandingCustomerPriceWeightForOrder(o) && o.packingStartedAt == null',
]) {
  if (!dashboard.includes(token)) failures.push(`supplier readiness bucket is missing: ${token}`);
}

for (const rpc of [
  'record_sales_order_line_actual_weight',
  'record_sales_order_line_unit_actual_weight',
  'record_sales_order_line_component_actual_weight',
  'record_sales_order_line_component_unit_actual_weight',
]) {
  if (!dashboard.includes(rpc)) failures.push(`supplier dashboard is missing weight RPC routing: ${rpc}`);
}

for (const forbiddenField of [
  'estimated_supplier_cost',
  'final_supplier_cost',
  'unit_cost_price',
  'supplier_snapshot',
  'gross_profit',
  'profit_margin',
]) {
  const componentSelect = dashboard.match(/\.from\('sales_order_line_components'\)[\s\S]*?\.select\('([^']+)'\)/)?.[1] ?? '';
  if (componentSelect.includes(forbiddenField)) {
    failures.push(`combo component query exposes internal financial field: ${forbiddenField}`);
  }
}

for (const token of [
  'phase4c1_sales_order_line_components_supplier_select',
  'public.is_supplier_for_sales_order_line_component(id)',
  'phase4c1_sales_order_line_component_units_supplier_select',
  'phase4c1_sales_order_preparation_answers_supplier_select',
]) {
  if (!supplierRls.includes(token)) failures.push(`supplier ownership boundary is missing: ${token}`);
}

for (const token of [
  "v_order.payment_status = 'receipt_submitted'",
  "v_order.payment_status = 'paid'",
  "v_order.payment_status NOT IN ('pending', 'rejected')",
  'public.is_supplier_for_sales_order_line_component(v_component.id)',
]) {
  if (!weightCorrection.includes(token)) failures.push(`combo weight correction safeguard is missing: ${token}`);
}

if (failures.length) {
  console.error('Supplier combo dashboard checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Supplier combo dashboard checks passed: owned direct lines and combo components remain distinct, actionable, and privacy-scoped.');
