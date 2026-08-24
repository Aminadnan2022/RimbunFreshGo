import type { CartItem, OrderingMode } from '../types';

const VARIABLE_CUSTOMER_PRICE_MODES = new Set<OrderingMode>([
  'whole_fish_by_weight',
  'weight_only',
  'slice',
]);

/**
 * Whether every customer-priced sales line has a price known at checkout.
 *
 * Combo components are fulfilment/cost records, not customer-priced lines.
 * Their physical unit or later actual weight therefore cannot make a fixed
 * combo's selling price variable.
 */
export function isPriceFinalAtCheckout(items: CartItem[]): boolean {
  return items.every((item) => {
    if (item.isCombo) return Boolean(item.comboId);
    if (item.orderingMode && VARIABLE_CUSTOMER_PRICE_MODES.has(item.orderingMode)) return false;
    return item.orderingMode === 'fixed_quantity' || item.pricingType === 'fixed';
  });
}
