import type { CartItem } from '../types';

export interface CanonicalCheckoutItem {
  product_id?: string;
  combo_id?: string;
  quantity: number;
  estimated_weight_kg?: number;
  component_estimated_weights?: Record<string, number>;
  combo_selections?: Array<{ choice_group_key: string; combo_item_id: string }>;
  combo_components?: Array<{ component_number: number; combo_item_id: string; product_id: string }>;
}

export function canonicalCheckoutItems(items: CartItem[]): CanonicalCheckoutItem[] {
  return items.map((item) => ({
    ...(item.isCombo && item.comboId ? { combo_id: item.comboId } : { product_id: item.productId }),
    quantity: item.quantity,
    ...(item.estimatedWeight !== undefined && { estimated_weight_kg: item.estimatedWeight }),
    ...(item.isCombo && item.comboItems ? {
      combo_components: item.comboItems.map((part, index) => {
        if (!part.comboItemId) {
          throw new Error('This combo has changed. Refresh and reselect it before placing the order.');
        }
        return { component_number: index + 1, combo_item_id: part.comboItemId, product_id: part.productId };
      }),
      combo_selections: item.comboItems
        .filter((part) => part.choiceGroupKey && part.comboItemId)
        .map((part) => ({ choice_group_key: part.choiceGroupKey!, combo_item_id: part.comboItemId! })),
    } : {}),
  }));
}
