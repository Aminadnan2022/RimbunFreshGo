import { supabase } from '../lib/supabase';
import { getPrepOptionsByCategory } from '../lib/preparationOptions';
import { deriveSellingUnit } from './products';
import type { Json } from '../types/database';
import type { CartItem, PreparationOption, Product, SellingUnit } from '../types';
import type { DbCombo, DbComboItem, ComboWithItems, ComboPayload } from '../types';

// NOTE: discount_percent is intentionally NOT selected. The live Supabase
// project does not have that column yet, and selecting it fails the whole
// query (HTTP 400, "column combos.discount_percent does not exist"), which
// made the Admin Combo page show "No combo packages yet." The discount is
// derived on the client from price / original_value instead.
const COMBO_COLUMNS = 'id, name, name_ms, slug, description, badge, category_label, tagline, price, original_value, image, images, servings, highlights, featured, active, lifecycle_status, is_pinned, display_order, created_at, updated_at';

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

export async function createCombo(payload: ComboPayload): Promise<DbCombo> {
  const id = await saveCombo(payload.id, payload);
  const saved = await fetchComboById(id);
  if (!saved) throw new Error('Combo not found after save');
  return saved.combo;
}

export async function updateCombo(id: string, payload: Partial<ComboPayload>): Promise<DbCombo> {
  const savedId = await saveCombo(id, payload);
  const saved = await fetchComboById(savedId);
  if (!saved) throw new Error('Combo not found after save');
  return saved.combo;
}

async function saveCombo(id: string, payload: Partial<ComboPayload>): Promise<string> {
  const { items, ...combo } = payload;
  const comboPayload: { [key: string]: Json | undefined } = { ...combo };
  // Lifecycle and presentation changes have dedicated server-side RPCs.
  delete comboPayload.discount_percent;
  delete comboPayload.lifecycle_status;
  delete comboPayload.active;
  delete comboPayload.featured;
  const { data, error } = await supabase.rpc('admin_save_combo', {
    p_combo_id: id,
    p_combo: comboPayload,
    p_items: items ?? null,
  });
  if (error) throw error;
  if (!data) throw new Error('Combo save did not return an id');
  return data;
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
  const { error } = await supabase.rpc('admin_set_combo_presentation', {
    p_combo_id: id, p_is_pinned: isPinned,
  });
  if (error) throw error;
}

export async function setCombosActive(ids: string[], active: boolean): Promise<void> {
  await Promise.all(ids.map((id) => setComboLifecycle(id, active ? 'active' : 'inactive')));
}

export async function setCombosPinned(ids: string[], isPinned: boolean): Promise<void> {
  if (ids.length === 0) return;
  await Promise.all(ids.map((id) => toggleComboPinned(id, isPinned)));
}

export async function deleteCombos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('combos').delete().in('id', ids);
  if (error) throw error;
  await normalizeComboOrder();
}

export async function toggleComboFeatured(id: string, featured: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_combo_presentation', {
    p_combo_id: id, p_featured: featured,
  });
  if (error) throw error;
}

export async function toggleComboActive(id: string, active: boolean): Promise<DbCombo> {
  await setComboLifecycle(id, active ? 'active' : 'inactive');
  const saved = await fetchComboById(id);
  if (!saved) throw new Error('Combo not found after lifecycle update');
  return saved.combo;
}

export async function setComboLifecycle(id: string, lifecycleStatus: 'draft' | 'active' | 'inactive'): Promise<void> {
  const { error } = await supabase.rpc('admin_set_combo_lifecycle', {
    p_combo_id: id,
    p_lifecycle_status: lifecycleStatus,
  });
  if (error) throw error;
}

export async function duplicateCombo(id: string): Promise<DbCombo> {
  const { data: newId, error } = await supabase.rpc('admin_duplicate_combo', {
    p_source_combo_id: id,
  });
  if (error) throw error;
  if (!newId) throw new Error('Duplicate did not return a combo id');
  const duplicate = await fetchComboById(newId);
  if (!duplicate) throw new Error('Duplicated combo not found');
  return duplicate.combo;
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
