import { supabase } from '../lib/supabase';
import { getPrepOptionsByCategory } from '../lib/preparationOptions';
import type { Product, Category, PreparationOption, OrderingMode, SellingUnit } from '../types';

type DbProduct = {
  id: string;
  name: string;
  name_ms: string;
  category: Category;
  price: number;
  cost_price: number | null;
  cost_supplier_name: string | null;
  unit: string;
  price_note: string | null;
  weight: string | null;
  quantity: number;
  description: string;
  long_description: string;
  image: string;
  images: string[];
  freshness: 'available' | 'limited' | 'sold-out';
  preparation_options: PreparationOption[];
  vendor_id: string;
  vendor_name: string;
  tags: string[];
  is_popular: boolean;
  ordering_mode: string | null;
  display_order: number;
  is_pinned: boolean;
  slice_unit: string | null;
  min_slice: number | null;
  max_slice: number | null;
  default_slice: number | null;
  slice_increment: number | null;
  slice_instruction: string | null;
};

type ProductConfig = {
  orderingMode: OrderingMode;
  averageWeight: number; // grams
  showEstimatedQuantity?: boolean;
};

const productConfig: Record<string, ProductConfig> = {
  // ── Chicken ──────────────────────────────────────────────────
  'broiler-chicken':   { orderingMode: 'fixed_quantity', averageWeight: 1600 },

  // ── Fish – premium (whole_fish_by_weight) ─────────────────────────
  'bawal-emas':        { orderingMode: 'whole_fish_by_weight', averageWeight: 600 },
  'bawal-hitam':       { orderingMode: 'whole_fish_by_weight', averageWeight: 600 },
  'bawal-putih':       { orderingMode: 'whole_fish_by_weight', averageWeight: 600 },
  'jenahak-potong':    { orderingMode: 'whole_fish_by_weight', averageWeight: 1000 },
  'jenahak-b':         { orderingMode: 'whole_fish_by_weight', averageWeight: 800 },
  'tenggiri':          { orderingMode: 'whole_fish_by_weight', averageWeight: 1000 },
  'tenggiri-potong':   { orderingMode: 'whole_fish_by_weight', averageWeight: 1000 },
  'merah-potong':      { orderingMode: 'whole_fish_by_weight', averageWeight: 1000 },
  'merah-b':           { orderingMode: 'whole_fish_by_weight', averageWeight: 800 },

  // ── Fish – small (weight_only) ───────────────────────────────
  'cencaru':           { orderingMode: 'weight_only', averageWeight: 400,  showEstimatedQuantity: true },
  'mabong-a':          { orderingMode: 'weight_only', averageWeight: 300,  showEstimatedQuantity: true },
  'keli':              { orderingMode: 'weight_only', averageWeight: 500,  showEstimatedQuantity: true },
  'nyok':              { orderingMode: 'weight_only', averageWeight: 600,  showEstimatedQuantity: true },
  'pelaling':          { orderingMode: 'weight_only', averageWeight: 150,  showEstimatedQuantity: true },
  'parang':            { orderingMode: 'weight_only', averageWeight: 500,  showEstimatedQuantity: true },
  'talapia-merah':     { orderingMode: 'weight_only', averageWeight: 400,  showEstimatedQuantity: true },
  'tongkol-hitam':     { orderingMode: 'weight_only', averageWeight: 500,  showEstimatedQuantity: true },
  'tongkol-putih':     { orderingMode: 'weight_only', averageWeight: 400,  showEstimatedQuantity: true },
  'selar':             { orderingMode: 'weight_only', averageWeight: 100,  showEstimatedQuantity: true },
  'selar-kuning':      { orderingMode: 'weight_only', averageWeight: 100,  showEstimatedQuantity: true },
  'sardin':            { orderingMode: 'weight_only', averageWeight: 80,   showEstimatedQuantity: true },
  'kerisi-a':          { orderingMode: 'weight_only', averageWeight: 200,  showEstimatedQuantity: true },

  // ── Fish – fixed price (fixed_quantity) ──────────────────────
  'siakap':            { orderingMode: 'fixed_quantity', averageWeight: 700 },

  // ── Prawns ───────────────────────────────────────────────────
  'udang-a':           { orderingMode: 'weight_only', averageWeight: 29,  showEstimatedQuantity: true },
  'udang-rencah':      { orderingMode: 'weight_only', averageWeight: 0 },

  // ── Squid ────────────────────────────────────────────────────
  'sotong-a':          { orderingMode: 'weight_only', averageWeight: 0 },
  'sotong-kembang':    { orderingMode: 'weight_only', averageWeight: 0 },
};

function resolveOrderingMode(row: DbProduct): OrderingMode {
  if (row.ordering_mode && ['fixed_quantity', 'weight_only', 'whole_fish_by_weight', 'combo', 'slice'].includes(row.ordering_mode)) {
    return row.ordering_mode as OrderingMode;
  }
  const cfg = productConfig[row.id];
  if (cfg) return cfg.orderingMode;
  if (row.category === 'combo') return 'combo';
  if (row.category === 'chicken') return 'fixed_quantity';
  if (row.unit === 'per kg') return 'weight_only';
  return 'fixed_quantity';
}

export function deriveSellingUnit(orderingMode: OrderingMode): SellingUnit {
  if (orderingMode === 'weight_only' || orderingMode === 'slice') return 'kg';
  return 'piece';
}

function mapRow(row: DbProduct): Product {
  const orderingMode = resolveOrderingMode(row);
  const cfg = productConfig[row.id];
  return {
    id: row.id,
    name: row.name,
    nameMs: row.name_ms,
    category: row.category,
    price: Number(row.price),
    costPrice: row.cost_price != null ? Number(row.cost_price) : undefined,
    costSupplierName: row.cost_supplier_name ?? '',
    unit: row.unit,
    priceNote: row.price_note ?? undefined,
    weight: row.weight ?? undefined,
    description: row.description,
    longDescription: row.long_description,
    image: row.image,
    images: row.images ?? [],
    freshness: row.freshness,
    preparationOptions: getPrepOptionsByCategory(row.category),
    vendorId: row.vendor_id,
    tags: row.tags ?? [],
    isPopular: row.is_popular,
    showEstimatedQuantity: cfg?.showEstimatedQuantity,
    orderingMode,
    averageWeight: cfg?.averageWeight ?? 0,
    selling_unit: deriveSellingUnit(orderingMode),
    displayOrder: row.display_order ?? 0,
    isPinned: row.is_pinned ?? false,
    sliceUnit: row.slice_unit ?? 'slice',
    minSlice: row.min_slice ?? 1,
    maxSlice: row.max_slice ?? 20,
    defaultSlice: row.default_slice ?? 2,
    sliceIncrement: row.slice_increment ?? 1,
    sliceInstruction: row.slice_instruction ?? '',
  };
}

const SELECT = 'id, name, name_ms, category, price, cost_price, cost_supplier_name, unit, price_note, weight, quantity, description, long_description, image, images, freshness, preparation_options, vendor_id, vendor_name, tags, is_popular, ordering_mode, display_order, is_pinned, slice_unit, min_slice, max_slice, default_slice, slice_increment, slice_instruction';

export async function fetchProducts(includeInactive = false): Promise<Product[]> {
  let query = supabase
    .from('Product')
    .select(SELECT)
    .order('is_pinned', { ascending: false })
    .order('display_order', { ascending: true });
  if (!includeInactive) query = query.neq('freshness', 'sold-out');
  const { data, error } = await query;
  if (error) throw error;
  return (data as DbProduct[]).map(mapRow);
}

export async function fetchProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('Product')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as DbProduct) : null;
}

export async function fetchProductsByCategory(category: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('Product')
    .select(SELECT)
    .eq('category', category as Category)
    .neq('freshness', 'sold-out')
    .order('is_pinned', { ascending: false })
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data as DbProduct[]).map(mapRow);
}

export async function fetchPopularProducts(limit = 4): Promise<Product[]> {
  const { data, error } = await supabase
    .from('Product')
    .select(SELECT)
    .eq('is_popular', true)
    .neq('freshness', 'sold-out')
    .order('is_pinned', { ascending: false })
    .order('display_order', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data as DbProduct[]).map(mapRow);
}

// ── Admin CRUD ───────────────────────────────────────────────────────────

export type ProductPayload = {
  id: string;
  name: string;
  name_ms: string;
  category: Category;
  price: number;
  cost_price?: number;
  cost_supplier_name?: string;
  unit: string;
  price_note?: string | null;
  weight?: string | null;
  quantity?: number;
  description: string;
  long_description: string;
  image: string;
  images?: string[];
  freshness?: 'available' | 'limited' | 'sold-out';
  preparation_options?: PreparationOption[];
  vendor_id: string;
  vendor_name: string;
  tags?: string[];
  is_popular?: boolean;
  ordering_mode?: string;
  selling_unit?: SellingUnit;
  display_order?: number;
  is_pinned?: boolean;
  slice_unit?: string;
  min_slice?: number;
  max_slice?: number;
  default_slice?: number;
  slice_increment?: number;
  slice_instruction?: string;
};

async function getNextDisplayOrder(): Promise<number> {
  const { data, error } = await supabase
    .from('Product')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = data?.[0]?.display_order;
  return typeof max === 'number' ? max + 1 : 0;
}

export async function createProduct(payload: ProductPayload): Promise<Product> {
  const { data, error } = await supabase
    .from('Product')
    .insert({
      ...payload,
      display_order: payload.display_order ?? (await getNextDisplayOrder()),
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return mapRow(data as DbProduct);
}

export async function updateProduct(id: string, payload: Partial<ProductPayload>): Promise<Product> {
  const { data, error } = await supabase
    .from('Product')
    .update(payload)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return mapRow(data as DbProduct);
}

export async function deleteProduct(id: string): Promise<void> {
  const { data: product, error: fetchError } = await supabase
    .from('Product')
    .select('image')
    .eq('id', id)
    .single();
  if (fetchError) throw fetchError;

  if (product?.image && !product.image.startsWith('http')) {
    await supabase.storage.from('product-images').remove([product.image]);
  }

  const { error } = await supabase.from('Product').delete().eq('id', id);
  if (error) throw error;
}

export async function duplicateProduct(id: string): Promise<Product> {
  const original = await fetchProductById(id);
  if (!original) throw new Error('Product not found');
  const newId = `${id}-copy-${Date.now()}`;
  const displayOrder = await getNextDisplayOrder();
  return createProduct({
    id: newId,
    name: `${original.name} (Copy)`,
    name_ms: `${original.nameMs} (Copy)`,
    category: original.category,
    price: original.price,
    cost_price: original.costPrice ?? 0,
    cost_supplier_name: original.costSupplierName ?? '',
    unit: original.unit,
    price_note: original.priceNote ?? null,
    weight: original.weight ?? null,
    quantity: 0,
    description: original.description,
    long_description: original.longDescription,
    image: original.image,
    images: original.images,
    freshness: original.freshness,
    preparation_options: original.preparationOptions,
    vendor_id: original.vendorId,
    vendor_name: '',
    tags: original.tags,
    is_popular: false,
    ordering_mode: original.orderingMode,
    selling_unit: original.selling_unit,
    display_order: displayOrder,
    is_pinned: false,
  });
}

export async function reorderProducts(orderedIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_products', { p_ids: orderedIds });
  if (error) throw error;
}

export async function moveProduct(id: string, toIndex: number): Promise<void> {
  const { error } = await supabase.rpc('move_product', { p_id: id, p_to_index: toIndex });
  if (error) throw error;
}

export async function normalizeProductOrder(): Promise<void> {
  const { error } = await supabase.rpc('normalize_product_order');
  if (error) throw error;
}

export async function toggleProductPinned(id: string, isPinned: boolean): Promise<void> {
  const { error } = await supabase.from('Product').update({ is_pinned: isPinned }).eq('id', id);
  if (error) throw error;
}

export async function setProductsActive(ids: string[], active: boolean): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('Product')
    .update({ freshness: active ? 'available' : 'sold-out' })
    .in('id', ids);
  if (error) throw error;
}

export async function setProductsPinned(ids: string[], isPinned: boolean): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('Product').update({ is_pinned: isPinned }).in('id', ids);
  if (error) throw error;
}

export async function deleteProducts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('Product').delete().in('id', ids);
  if (error) throw error;
  await normalizeProductOrder();
}

// ── Pricing history (accounting) ────────────────────────────────────────────

export type SupplierPriceHistoryRow = {
  id: number;
  product_id: string;
  supplier_id: number | null;
  supplier_name: string;
  cost_price: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SellingPriceHistoryRow = {
  id: number;
  product_id: string;
  selling_price: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductPriceHistory = {
  supplier: SupplierPriceHistoryRow[];
  selling: SellingPriceHistoryRow[];
};

export async function fetchProductPriceHistory(productId: string): Promise<ProductPriceHistory> {
  const [supplierRes, sellingRes] = await Promise.all([
    supabase
      .from('supplier_price_history')
      .select('*')
      .eq('product_id', productId)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('selling_price_history')
      .select('*')
      .eq('product_id', productId)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);
  if (supplierRes.error) throw supplierRes.error;
  if (sellingRes.error) throw sellingRes.error;
  return {
    supplier: (supplierRes.data ?? []) as SupplierPriceHistoryRow[],
    selling: (sellingRes.data ?? []) as SellingPriceHistoryRow[],
  };
}

/**
 * Publish a new selling price. Closes the previous active record (effective_to
 * set, is_active = false) and updates the live Product.price. Never overwrites
 * history.
 */
export async function addProductSellingPrice(productId: string, sellingPrice: number): Promise<void> {
  const { error } = await supabase.rpc('set_product_selling_price', {
    p_product_id: productId,
    p_selling_price: sellingPrice,
  });
  if (error) throw error;
}

/**
 * Publish a new supplier cost. Closes the previous active record and updates
 * the live Product.cost_price / cost_supplier_name. Never overwrites history.
 */
export async function addProductSupplierPrice(
  productId: string,
  costPrice: number,
  supplierName: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_product_supplier_price', {
    p_product_id: productId,
    p_cost_price: costPrice,
    p_supplier_name: supplierName,
  });
  if (error) throw error;
}
