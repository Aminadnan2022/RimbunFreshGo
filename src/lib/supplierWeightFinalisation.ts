import type { OrderingMode } from '../types';

const SUPPLIER_WEIGHT_MODES = new Set<OrderingMode>([
  'whole_fish_by_weight',
  'weight_only',
  'slice',
]);

export type SupplierWeightPurpose = 'customer_price' | 'supplier_cost' | 'none';

export type CanonicalSupplierItemKind = 'direct' | 'combo_component';

export interface SupplierReadinessWeight {
  purpose: SupplierWeightPurpose;
  submitted: boolean;
}

/**
 * Whether a frozen canonical line/component requires supplier weight entry.
 *
 * Physical-unit rows can exist solely to capture per-item preparation choices,
 * including for fixed_quantity products. They are not a weighing signal.
 */
export function resolveSupplierWeightPurpose(
  orderingMode: string | null | undefined,
  itemKind: CanonicalSupplierItemKind,
): SupplierWeightPurpose {
  if (!SUPPLIER_WEIGHT_MODES.has(orderingMode as OrderingMode)) return 'none';

  // A combo component is never a customer-priced line. Its frozen standalone
  // mode is retained only so FreshGo can optionally capture actual procurement
  // cost. The fixed combo parent remains authoritative for customer price.
  return itemKind === 'combo_component' ? 'supplier_cost' : 'customer_price';
}

/**
 * Order readiness is blocked only by an outstanding measurement that can
 * change the customer's final price. Combo procurement weights remain an
 * operational supplier-cost concern and never hold the order in weighing.
 */
export function hasOutstandingCustomerPriceWeight(
  weights: SupplierReadinessWeight[],
): boolean {
  return weights.some(({ purpose, submitted }) =>
    purpose === 'customer_price' && !submitted
  );
}
