import type { ComboWithItems } from '../types';

export function selectComboCartItems(
  comboWithItems: ComboWithItems,
  selectedChoiceItemIds: Iterable<string>,
): ComboWithItems {
  const selectedIds = new Set(selectedChoiceItemIds);
  return {
    ...comboWithItems,
    items: comboWithItems.items.filter(
      (item) => !item.choice_group_key || selectedIds.has(item.id),
    ),
  };
}
