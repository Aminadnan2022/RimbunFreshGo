import type { CartItem } from '../types';

export interface CanonicalCheckoutItem {
  product_id?: string;
  combo_id?: string;
  quantity: number;
  estimated_weight_kg?: number;
  component_estimated_weights?: Record<string, number>;
  combo_selections?: Array<{ choice_group_key: string; combo_item_id: string }>;
}

export function canonicalCheckoutItems(items: CartItem[]): CanonicalCheckoutItem[] {
  return items.map((item) => ({
    ...(item.isCombo && item.comboId ? { combo_id: item.comboId } : { product_id: item.productId }),
    quantity: item.quantity,
    ...(item.estimatedWeight !== undefined && { estimated_weight_kg: item.estimatedWeight }),
    ...(item.isCombo && item.comboItems ? {
      combo_selections: item.comboItems
        .filter((part) => part.choiceGroupKey && part.comboItemId)
        .map((part) => ({ choice_group_key: part.choiceGroupKey!, combo_item_id: part.comboItemId! })),
    } : {}),
  }));
}
