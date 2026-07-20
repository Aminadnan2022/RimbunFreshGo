import { getPrepOptionsByCategory } from '../lib/preparationOptions';
import type { Combo, ComboExpandedItem, PreparationOption, Product } from '../types';

export const familyCombo: Combo = {
  id: 'family-combo-50',
  name: 'Family Combo',
  tagline: 'Everything your family needs. One price.',
  price: 50,
  originalValue: 86,
  description:
    'Our signature Family Combo brings together the freshest proteins your family needs for a full week of cooking — at an unbeatable price. Every item is prepared fresh the morning of your delivery.',
  items: [
    { productId: 'broiler-chicken', quantity: 1, label: '1 Whole Broiler Chicken (1.5–1.7 kg)' },
    { productId: 'siakap', quantity: 1, label: '1 Whole Siakap (Asian Sea Bass)' },
    { productId: 'udang-a', quantity: 1, label: '500g Fresh Grade A Prawns' },
    { productId: 'cencaru', quantity: 1, label: '1 kg Cencaru (Torpedo Scad)' },
  ],
  image: 'https://images.pexels.com/photos/3639557/pexels-photo-3639557.jpeg?auto=compress&cs=tinysrgb&w=800',
  images: [
    'https://images.pexels.com/photos/3639557/pexels-photo-3639557.jpeg?auto=compress&cs=tinysrgb&w=800',
    'https://images.pexels.com/photos/616354/pexels-photo-616354.jpeg?auto=compress&cs=tinysrgb&w=800',
    'https://images.pexels.com/photos/566344/pexels-photo-566344.jpeg?auto=compress&cs=tinysrgb&w=800',
  ],
  servings: 4,
  highlights: [
    'Save RM36 vs. buying separately',
    'Feeds a family of 4 for 2–3 meals',
    'All items prepared fresh same morning',
    'Mix of proteins for variety all week',
    'Free preparation: cleaned, descaled, cut',
  ],
};

const COMBO_ITEM_PREPS: Record<string, PreparationOption> = {
  'broiler-chicken': 'cut12',
  siakap: 'gutted',
};

export function buildExpandedComboItems(products: Product[]): ComboExpandedItem[] {
  return familyCombo.items.map((ci) => {
    const product = products.find((p) => p.id === ci.productId);
    const category = product?.category;
    const options = category ? getPrepOptionsByCategory(category) : [];
    const prep = COMBO_ITEM_PREPS[ci.productId] ?? options[0];
    const isFixed = category === 'chicken' || ci.productId === 'broiler-chicken';
    return {
      productId: ci.productId,
      name: product?.name ?? ci.label,
      image: product?.image ?? familyCombo.image,
      price: product?.price ?? 0,
      unit: product?.unit ?? (isFixed ? 'per bird' : 'per kg'),
      quantity: ci.quantity,
      preparation: prep,
      pricingType: isFixed ? 'fixed' : 'per_kg',
      label: ci.label,
    };
  });
}
