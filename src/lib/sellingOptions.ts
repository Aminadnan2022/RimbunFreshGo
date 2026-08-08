import type { CartItem, PreparationOption, Product } from '../types';

// Single source of truth for how products are sold (quantity vs weight).
// Used by Product Detail Page, Product Card, and the Combo Builder so that
// selling logic only needs to change in one place.

export type SellingMode = 'quantity' | 'weight' | 'whole_or_weight' | 'slice';

export const DEFAULT_WEIGHT_OPTIONS_G = [500, 1000, 1500, 2000, 3000];

export function getSellingMode(product: Product): SellingMode {
  const mode = product.orderingMode ?? 'fixed_quantity';
  if (mode === 'weight_only') return 'weight';
  if (mode === 'whole_or_weight') return 'whole_or_weight';
  if (mode === 'slice') return 'slice';
  return 'quantity';
}

export function usesWeight(product: Product, orderMode?: 'whole' | 'weight'): boolean {
  const mode = getSellingMode(product);
  if (mode === 'weight') return true;
  if (mode === 'whole_or_weight') return orderMode === 'weight';
  return false;
}

export function isSliceProduct(product: Product): boolean {
  return (product.orderingMode ?? 'fixed_quantity') === 'slice';
}

export function isSliceItem(item: CartItem): boolean {
  return item.orderingMode === 'slice' || item.pricingType === 'slice' || item.sliceQuantity != null;
}

/** Resolve the customer's allowed slice range, clamped to sensible defaults. */
export function getSliceRange(item: {
  minSlice?: number;
  maxSlice?: number;
  sliceIncrement?: number;
  defaultSlice?: number;
}) {
  const rawMin = item.minSlice ?? 1;
  const rawMax = item.maxSlice ?? 20;
  const min = Math.max(1, rawMin);
  let max = Math.max(min, rawMax);
  const increment = Math.max(1, item.sliceIncrement ?? 1);
  const stepCount = Math.max(1, Math.floor((max - min) / increment));
  max = min + stepCount * increment;
  const defaultSlice = item.defaultSlice != null ? item.defaultSlice : min;
  return { min, max, increment, defaultSlice: Math.min(Math.max(defaultSlice, min), max) };
}

export function getWeightOptions(): number[] {
  return DEFAULT_WEIGHT_OPTIONS_G;
}

export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    const kg = (grams / 1000).toFixed(grams % 1000 === 0 ? 0 : 1).replace(/\.0$/, '');
    return `${kg}kg`;
  }
  return `${grams}g`;
}

export type BuildCartOptions = {
  quantity?: number;
  weightG?: number;
  sliceQuantity?: number;
  orderMode?: 'whole' | 'weight';
  preparation?: PreparationOption;
};

export function buildCartItem(product: Product, opts: BuildCartOptions = {}): CartItem {
  const mode = getSellingMode(product);
  const prep = opts.preparation ?? product.preparationOptions[0] ?? 'whole';
  const qty = opts.quantity ?? 1;
  const weightKg = (opts.weightG ?? DEFAULT_WEIGHT_OPTIONS_G[0]) / 1000;

  const base = {
    productId: product.id,
    name: product.name,
    image: product.image,
    price: product.price,
    unit: product.unit,
    category: product.category,
    showEstimatedQuantity: product.showEstimatedQuantity,
    orderingMode: product.orderingMode,
    averageWeight: product.averageWeight,
    preparation: prep,
    costPrice: product.costPrice != null ? product.costPrice : 0,
    supplierName: product.costSupplierName ?? '',
  };

  if (mode === 'whole_or_weight' && opts.orderMode === 'whole') {
    const estWeightKg = (qty * (product.averageWeight ?? 0)) / 1000;
    return {
      ...base,
      quantity: qty,
      estimatedWeight: estWeightKg > 0 ? estWeightKg : undefined,
      pricingType: 'per_kg',
    };
  }

  if (mode === 'weight' || (mode === 'whole_or_weight' && opts.orderMode === 'weight')) {
    return { ...base, quantity: 1, estimatedWeight: weightKg, pricingType: 'per_kg' };
  }

  if (mode === 'slice') {
    const range = getSliceRange(product);
    const slices = Math.min(Math.max(opts.sliceQuantity ?? range.defaultSlice, range.min), range.max);
    return {
      ...base,
      quantity: slices,
      estimatedWeight: undefined,
      pricingType: 'slice',
      sliceQuantity: slices,
      sliceUnit: product.sliceUnit ?? 'slice',
      minSlice: range.min,
      maxSlice: range.max,
      sliceIncrement: range.increment,
      sliceInstruction: product.sliceInstruction ?? '',
    };
  }

  return { ...base, quantity: qty, estimatedWeight: undefined, pricingType: 'fixed' };
}

export function computeSubtotal(product: Product, opts: BuildCartOptions = {}): number {
  const item = buildCartItem(product, opts);
  if (item.pricingType === 'per_kg') return item.price * (item.estimatedWeight ?? 0);
  if (item.pricingType === 'slice') return 0; // price unknown until supplier weighs
  return item.price * item.quantity;
}

// Combo items are stored as quantity_value + selling_unit. For 'kg' items the
// quantity_value is the weight in kg; for piece items it is the item count.
export function computeComboItemSubtotal(product: Product, quantityValue: number, sellingUnit: string): number {
  if (sellingUnit === 'kg') return product.price * quantityValue;
  return product.price * Math.max(1, Math.round(quantityValue));
}
