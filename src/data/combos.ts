import { supabase } from '../lib/supabase';
import { getPrepOptionsByCategory } from '../lib/preparationOptions';
import { deriveSellingUnit } from './products';
import type { CartItem, PreparationOption, Product, SellingUnit } from '../types';
import type { DbCombo, DbComboItem, ComboWithItems, ComboPayload } from '../types';

// NOTE: discount_percent is intentionally NOT selected. The live Supabase
// project does not have that column yet, and selecting it fails the whole
// query (HTTP 400, "column combos.discount_percent does not exist"), which
// made the Admin Combo page show "No combo packages yet." The discount is
// derived on the client from price / original_value instead.
const COMBO_COLUMNS = 'id, name, name_ms, slug, description, badge, category_label, tagline, price, original_value, image, images, servings, highlights, featured, active, is_pinned, display_order, created_at, updated_at';

const COMBO_ITEM_COLUMNS = 'id, combo_id, product_id, quantity_value, selling_unit, sort_order, custom_label, preparation, unit, created_at';

type RawDbComboItem = {
  id: string;
  combo_id: string;
  product_id: string;
  sort_order: number;
  custom_label: string | null;
  preparation: string | null;
  unit: string | null;
  created_at: string;
  quantity_value?: number;
  quantity?: number;
  selling_unit?: string;
};

function mapComboItem(row: RawDbComboItem): DbComboItem {
  return {
    id: row.id,
    combo_id: row.combo_id,
    product_id: row.product_id,
    quantity_value: row.quantity_value ?? (row.quantity ?? 1),
    selling_unit: row.selling_unit ?? '',
    sort_order: row.sort_order,
    custom_label: row.custom_label ?? undefined,
    preparation: row.preparation ?? undefined,
    unit: row.unit ?? undefined,
    created_at: row.created_at,
  };
}

function getSellingUnit(product: Product): SellingUnit {
  return product.selling_unit ?? deriveSellingUnit(product.orderingMode);
}

export async function fetchCombos(): Promise<DbCombo[]> {
  const { data, error } = await supabase
    .from('combos')
    .select(COMBO_COLUMNS)
    .order('is_pinned', { ascending: false })
    .order('display_order', { ascending: true });
  if (error) {
    console.error("COMBOS QUERY ERROR", error);
    throw error;
  }
  return data ?? [];
}

export async function fetchActiveCombos(): Promise<DbCombo[]> {
  const { data, error } = await supabase
    .from('combos')
    .select(COMBO_COLUMNS)
    .eq('active', true)
    .order('is_pinned', { ascending: false })
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchComboBySlug(slug: string): Promise<ComboWithItems | null> {
  const { data: combo, error: comboError } = await supabase
    .from('combos')
    .select(COMBO_COLUMNS)
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();
  if (comboError || !combo) return null;

  const { data: items, error: itemsError } = await supabase
    .from('combo_items')
    .select(COMBO_ITEM_COLUMNS)
    .eq('combo_id', combo.id)
    .order('sort_order', { ascending: true });
  if (itemsError) throw itemsError;

  return { combo, items: (items ?? []).map(mapComboItem) };
}

export async function fetchActiveComboList(): Promise<ComboWithItems[]> {
  const { data: combos, error } = await supabase
    .from('combos')
    .select(COMBO_COLUMNS)
    .eq('active', true)
    .order('is_pinned', { ascending: false })
    .order('display_order', { ascending: true });
  if (error) throw error;
  const rows = combos ?? [];
  if (rows.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from('combo_items')
    .select(COMBO_ITEM_COLUMNS)
    .in('combo_id', rows.map((c) => c.id))
    .order('combo_id', { ascending: true })
    .order('sort_order', { ascending: true });
  if (itemsError) throw itemsError;

  const byCombo = new Map<string, DbComboItem[]>();
  (items ?? []).forEach((row) => {
    const item = mapComboItem(row as RawDbComboItem);
    const arr = byCombo.get(item.combo_id) ?? [];
    arr.push(item);
    byCombo.set(item.combo_id, arr);
  });

  return rows.map((combo) => ({ combo, items: byCombo.get(combo.id) ?? [] }));
}

export async function fetchComboById(id: string): Promise<ComboWithItems | null> {
  const { data: combo, error: comboError } = await supabase
    .from('combos')
    .select(COMBO_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (comboError || !combo) return null;

  const { data: items, error: itemsError } = await supabase
    .from('combo_items')
    .select(COMBO_ITEM_COLUMNS)
    .eq('combo_id', combo.id)
    .order('sort_order', { ascending: true });
  if (itemsError) throw itemsError;

  return { combo, items: (items ?? []).map(mapComboItem) };
}

async function getNextComboDisplayOrder(): Promise<number> {
  const { data, error } = await supabase
    .from('combos')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = data?.[0]?.display_order;
  return typeof max === 'number' ? max + 1 : 0;
}

export async function createCombo(payload: ComboPayload): Promise<DbCombo> {
  const { items, ...comboData } = payload;
  delete comboData.discount_percent;
  const { data: combo, error: comboError } = await supabase
    .from('combos')
    .insert({
      ...comboData,
      image: (comboData.images && comboData.images[0]) ?? comboData.image ?? '',
      display_order: comboData.display_order ?? (await getNextComboDisplayOrder()),
      updated_at: new Date().toISOString(),
    })
    .select(COMBO_COLUMNS)
    .maybeSingle();
  if (comboError) throw comboError;
  if (!combo) throw new Error('Combo not found');

  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from('combo_items')
      .insert(items.map((item, i) => ({
        combo_id: combo.id,
        product_id: item.product_id,
        quantity_value: item.quantity_value,
        selling_unit: item.selling_unit,
        sort_order: item.sort_order ?? i,
        custom_label: item.custom_label ?? null,
        preparation: item.preparation ?? null,
        unit: item.unit ?? null,
      })));
    if (itemsError) throw itemsError;
  }

  return combo;
}

export async function updateCombo(id: string, payload: Partial<ComboPayload>): Promise<DbCombo> {
  const { items, ...comboData } = payload;
  delete comboData.discount_percent;
  const { data: combo, error: comboError } = await supabase
    .from('combos')
    .update({
      ...comboData,
      image: comboData.images
        ? (comboData.images[0] ?? '')
        : comboData.image,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(COMBO_COLUMNS)
    .maybeSingle();
  if (comboError) throw comboError;
  if (!combo) throw new Error('Combo not found');

  if (items) {
    const { error: deleteError } = await supabase
      .from('combo_items')
      .delete()
      .eq('combo_id', id);
    if (deleteError) throw deleteError;

    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from('combo_items')
        .insert(items.map((item, i) => ({
          combo_id: id,
          product_id: item.product_id,
          quantity_value: item.quantity_value,
          selling_unit: item.selling_unit,
          sort_order: item.sort_order ?? i,
          custom_label: item.custom_label ?? null,
          preparation: item.preparation ?? null,
          unit: item.unit ?? null,
        })));
      if (itemsError) throw itemsError;
    }
  }

  return combo;
}

export async function deleteCombo(id: string): Promise<void> {
  const { error } = await supabase.from('combos').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderCombos(orderedIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_combos', { p_ids: orderedIds });
  if (error) throw error;
}

export async function moveCombo(id: string, toIndex: number): Promise<void> {
  const { error } = await supabase.rpc('move_combo', { p_id: id, p_to_index: toIndex });
  if (error) throw error;
}

export async function normalizeComboOrder(): Promise<void> {
  const { error } = await supabase.rpc('normalize_combo_order');
  if (error) throw error;
}

export async function toggleComboPinned(id: string, isPinned: boolean): Promise<void> {
  const { error } = await supabase
    .from('combos')
    .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function setCombosActive(ids: string[], active: boolean): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('combos')
    .update({ active, updated_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
}

export async function setCombosPinned(ids: string[], isPinned: boolean): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('combos')
    .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
}

export async function deleteCombos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('combos').delete().in('id', ids);
  if (error) throw error;
  await normalizeComboOrder();
}

export async function toggleComboFeatured(id: string, featured: boolean): Promise<void> {
  const { error } = await supabase
    .from('combos')
    .update({ featured, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function toggleComboActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('combos')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function duplicateCombo(id: string): Promise<DbCombo> {
  const original = await fetchComboById(id);
  if (!original) throw new Error('Combo not found');
  const newId = `${original.combo.id}-copy-${Date.now()}`;
  return createCombo({
    id: newId,
    name: `${original.combo.name} (Copy)`,
    slug: `${original.combo.slug}-copy-${Date.now()}`,
    description: original.combo.description,
    badge: original.combo.badge,
    category_label: original.combo.category_label,
    tagline: original.combo.tagline,
    price: original.combo.price,
    original_value: original.combo.original_value,
    discount_percent: original.combo.discount_percent,
    image: original.combo.image,
    images: original.combo.images,
    servings: original.combo.servings,
    highlights: original.combo.highlights,
    featured: false,
    active: false,
    is_pinned: false,
    items: original.items.map((item) => ({
      product_id: item.product_id,
      quantity_value: item.quantity_value,
      selling_unit: item.selling_unit,
      sort_order: item.sort_order,
      custom_label: item.custom_label ?? undefined,
      preparation: item.preparation ?? undefined,
      unit: item.unit ?? undefined,
    })),
  });
}

export function buildComboItems(
  comboWithItems: ComboWithItems,
  products: Product[]
): {
  id: string;
  productId: string;
  name: string;
  image: string;
  price: number;
  unit: string;
  quantity: number;
  quantityValue: number;
  sellingUnit: string;
  preparation?: PreparationOption;
  pricingType?: 'per_kg' | 'fixed';
  label: string;
}[] {
  return comboWithItems.items.map((ci) => {
    const product = products.find((p) => p.id === ci.product_id);
    const category = product?.category;
    const options = category ? getPrepOptionsByCategory(category) : [];
    const prep = (ci.preparation as PreparationOption) ?? options[0];
    const sellingUnit = ci.selling_unit || (product ? getSellingUnit(product) : 'piece');
    const isKg = sellingUnit === 'kg';
    return {
      id: ci.id,
      productId: ci.product_id,
      name: product?.name ?? ci.custom_label ?? ci.product_id,
      image: product?.image ?? comboWithItems.combo.image,
      price: product?.price ?? 0,
      unit: isKg ? 'kg' : product?.unit ?? 'per item',
      quantity: Math.round(ci.quantity_value),
      quantityValue: ci.quantity_value,
      sellingUnit,
      preparation: prep,
      pricingType: isKg ? 'per_kg' : 'fixed',
      label: ci.custom_label ?? (
        isKg
          ? `${product?.name ?? ci.product_id} ${ci.quantity_value}kg`
          : `${product?.name ?? ci.product_id} x${Math.round(ci.quantity_value)}`
      ),
    };
  });
}

export function buildComboCartItem(
  comboWithItems: ComboWithItems,
  products: Product[],
  quantity = 1
): CartItem {
  const expanded = buildComboItems(comboWithItems, products);
  return {
    productId: comboWithItems.combo.id,
    comboId: comboWithItems.combo.id,
    name: comboWithItems.combo.name,
    image: comboWithItems.combo.image,
    price: comboWithItems.combo.price,
    unit: 'combo',
    quantity,
    isCombo: true,
    comboItems: expanded.map((item) => ({
      productId: item.productId,
      name: item.name,
      image: item.image,
      price: item.price,
      unit: item.unit,
      quantity: item.quantity,
      quantityValue: item.quantityValue,
      sellingUnit: item.sellingUnit,
      preparation: item.preparation as PreparationOption,
      pricingType: item.pricingType,
      label: item.label,
    })),
  };
}
