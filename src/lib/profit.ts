// Shared gross-profit math for the accounting feature.
//
// Every order item snapshots its selling `price` AND `costPrice` (RM per unit)
// at checkout inside Orders.order_items JSONB. Per-kg / slice lines get their
// final quantity from the supplier's weight (supplier_weights map or the item's
// actualWeight). Historical orders are never rewritten — reports derive money
// purely from these frozen snapshots.

import type { CartItem } from '../types';
import { roundCurrency } from './currency';

/** Weight-based lines are per-kg or slice; final money depends on actual weight. */
type PricedItem = Pick<CartItem, 'price' | 'costPrice' | 'quantity' | 'actualWeight' | 'estimatedWeight' | 'pricingType' | 'sliceQuantity'>;

export function isWeightLine(item: PricedItem): boolean {
  return item.pricingType === 'per_kg' || item.pricingType === 'slice' || item.sliceQuantity != null;
}

/**
 * Final billable quantity for a line:
 *  - per-kg / slice: weight (supplier) -> actualWeight -> estimatedWeight -> 0
 *  - fixed / combo: item.quantity
 */
export function lineQuantity(item: PricedItem, weightKg?: number): number {
  if (isWeightLine(item)) {
    const w = weightKg ?? item.actualWeight ?? item.estimatedWeight;
    return w != null && w > 0 ? w : 0;
  }
  return item.quantity ?? 0;
}

export function unitSellingPrice(item: PricedItem): number {
  return item.price ?? 0;
}

export function unitCostPrice(item: PricedItem): number {
  return item.costPrice ?? 0;
}

/** Gross profit per unit (selling - cost). */
export function unitGrossProfit(item: PricedItem): number {
  return unitSellingPrice(item) - unitCostPrice(item);
}

export function lineSelling(item: PricedItem, weightKg?: number): number {
  return roundCurrency(unitSellingPrice(item) * lineQuantity(item, weightKg));
}

export function lineCost(item: PricedItem, weightKg?: number): number {
  return roundCurrency(unitCostPrice(item) * lineQuantity(item, weightKg));
}

export function lineGross(item: PricedItem, weightKg?: number): number {
  return roundCurrency(unitGrossProfit(item) * lineQuantity(item, weightKg));
}

/** Sum gross profit over all order items (delivery fee excluded from product gross). */
export function orderGrossProfit(
  items: PricedItem[],
  weights?: Record<string, number> | null,
): number {
  return roundCurrency(
    items.reduce((sum, item, i) => sum + lineGross(item, weights?.[String(i)]), 0),
  );
}

/** Total supplier cost over all order items. */
export function orderCost(
  items: PricedItem[],
  weights?: Record<string, number> | null,
): number {
  return roundCurrency(
    items.reduce((sum, item, i) => sum + lineCost(item, weights?.[String(i)]), 0),
  );
}

/** Total selling amount over all order items. */
export function orderSelling(
  items: PricedItem[],
  weights?: Record<string, number> | null,
): number {
  return roundCurrency(
    items.reduce((sum, item, i) => sum + lineSelling(item, weights?.[String(i)]), 0),
  );
}

/** Gross margin percentage (0-100). Returns 0 when revenue is 0 or negative. */
export function marginPercent(revenue: number, cost: number): number {
  if (!revenue || revenue <= 0) return 0;
  const gross = revenue - cost;
  return roundCurrency((gross / revenue) * 100);
}
