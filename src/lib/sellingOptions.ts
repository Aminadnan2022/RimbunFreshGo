import type { CartItem, PreparationOption, Product } from '../types';

// Single source of truth for how products are sold.
export type SellingMode =
  | 'quantity'
  | 'weight'
  | 'whole_fish_by_weight'
  | 'slice';

export const DEFAULT_WEIGHT_OPTIONS_G = [500, 1000, 1500, 2000, 3000];

export function getSellingMode(product: Product): SellingMode {
  const mode = product.orderingMode ?? 'fixed_quantity';

  if (mode === 'weight_only') return 'weight';
  if (mode === 'whole_fish_by_weight') return 'whole_fish_by_weight';
  if (mode === 'slice') return 'slice';

  return 'quantity';
}

/**
 * Customers choose a number of fish while the supplier records one combined
 * actual weight for the line. The price is still per kg.
 *
 * This deliberately uses the existing canonical `weight_only` fulfilment
 * path: it already accepts one line-level actual weight and never creates
 * per-fish weight rows. `selling_unit: piece` is the customer-facing choice.
 */
export function isBulkWeighedPieceProduct(product: Product): boolean {
  return product.orderingMode === 'weight_only' && product.selling_unit === 'piece';
}

export function isBulkWeighedPieceItem(item: CartItem): boolean {
  return item.orderingMode === 'weight_only' && item.sellingUnit === 'piece';
}

export function usesWeight(product: Product): boolean {
  const mode = getSellingMode(product);

  return (
    mode === 'weight' ||
    mode === 'whole_fish_by_weight' ||
    mode === 'slice'
  );
}

export function isSliceProduct(product: Product): boolean {
  return (product.orderingMode ?? 'fixed_quantity') === 'slice';
}

export function isSliceItem(item: CartItem): boolean {
  return (
    item.orderingMode === 'slice' ||
    item.pricingType === 'slice' ||
    item.sliceQuantity != null
  );
}

export function isWholeFishByWeightItem(item: CartItem): boolean {
  return item.orderingMode === 'whole_fish_by_weight';
}

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

  const defaultSlice =
    item.defaultSlice != null ? item.defaultSlice : min;

  return {
    min,
    max,
    increment,
    defaultSlice: Math.min(Math.max(defaultSlice, min), max),
  };
}

export function getWeightOptions(): number[] {
  return DEFAULT_WEIGHT_OPTIONS_G;
}

export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    const kg = (grams / 1000)
      .toFixed(grams % 1000 === 0 ? 0 : 1)
      .replace(/\.0$/, '');

    return `${kg}kg`;
  }

  return `${grams}g`;
}

export type BuildCartOptions = {
  quantity?: number;
  weightG?: number;
  sliceQuantity?: number;

  /**
   * Legacy compatibility for historical whole_fish_by_weight carts.
   * New whole_fish_by_weight products do not expose a mode toggle.
   */
  orderMode?: 'whole' | 'weight';

  preparation?: PreparationOption;
};

export function buildCartItem(
  product: Product,
  opts: BuildCartOptions = {},
): CartItem {
  const mode = getSellingMode(product);

  const qty = opts.quantity ?? 1;
  const weightKg =
    (opts.weightG ?? DEFAULT_WEIGHT_OPTIONS_G[0]) / 1000;

  const base: CartItem = {
    productId: product.id,
    name: product.name,
    image: product.image,
    price: product.price,
    quantity: qty,
    unit: product.unit,
    category: product.category,
    showEstimatedQuantity: product.showEstimatedQuantity,
    orderingMode: product.orderingMode,
    sellingUnit: product.selling_unit,
    averageWeight: product.averageWeight,
    ...(opts.preparation !== undefined && { preparation: opts.preparation }),
    costPrice: product.costPrice != null ? product.costPrice : 0,
    supplierName: product.costSupplierName ?? '',
  };

  /**
   * Whole fish priced by weight:
   * - customer orders physical fish quantity
   * - cart stores estimated weight for estimated total only
   * - supplier records actual weight later
   */
  if (mode === 'whole_fish_by_weight') {
    const estimatedWeight =
      (qty * (product.averageWeight ?? 0)) / 1000;

    return {
      ...base,
      quantity: qty,
      estimatedWeight:
        estimatedWeight > 0 ? estimatedWeight : undefined,
      pricingType: 'per_kg',
    };
  }

  if (mode === 'weight') {
    if (isBulkWeighedPieceProduct(product)) {
      const estimatedWeight = (qty * (product.averageWeight ?? 0)) / 1000;

      return {
        ...base,
        quantity: qty,
        estimatedWeight: estimatedWeight > 0 ? estimatedWeight : undefined,
        pricingType: 'per_kg',
      };
    }

    return {
      ...base,
      quantity: 1,
      estimatedWeight: weightKg,
      pricingType: 'per_kg',
    };
  }

  if (mode === 'slice') {
    const range = getSliceRange(product);

    const slices = Math.min(
      Math.max(
        opts.sliceQuantity ?? range.defaultSlice,
        range.min,
      ),
      range.max,
    );

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

  return {
    ...base,
    quantity: qty,
    estimatedWeight: undefined,
    pricingType: 'fixed',
  };
}

export function computeSubtotal(
  product: Product,
  opts: BuildCartOptions = {},
): number {
  const item = buildCartItem(product, opts);

  if (item.pricingType === 'per_kg') {
    return item.price * (item.estimatedWeight ?? 0);
  }

  if (item.pricingType === 'slice') {
    return 0;
  }

  return item.price * item.quantity;
}

export function computeComboItemSubtotal(
  product: Product,
  quantityValue: number,
  sellingUnit: string,
): number {
  if (sellingUnit === 'kg') {
    return product.price * quantityValue;
  }

  return product.price * Math.max(1, Math.round(quantityValue));
}
