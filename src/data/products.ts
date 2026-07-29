import { supabase } from '../lib/supabase';
import { getPrepOptionsByCategory } from '../lib/preparationOptions';
import type { Product, Category, PreparationOption, OrderingMode } from '../types';

type DbProduct = {
  id: string;
  name: string;
  name_ms: string;
  category: Category;
  price: number;
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
};

type ProductConfig = {
  orderingMode: OrderingMode;
  averageWeight: number; // grams
  showEstimatedQuantity?: boolean;
};

const productConfig: Record<string, ProductConfig> = {
  // ── Chicken ──────────────────────────────────────────────────
  'broiler-chicken':   { orderingMode: 'fixed_quantity', averageWeight: 1600 },

  // ── Fish – premium (whole_or_weight) ─────────────────────────
  'bawal-emas':        { orderingMode: 'whole_or_weight', averageWeight: 600 },
  'bawal-hitam':       { orderingMode: 'whole_or_weight', averageWeight: 600 },
  'bawal-putih':       { orderingMode: 'whole_or_weight', averageWeight: 600 },
  'jenahak-potong':    { orderingMode: 'whole_or_weight', averageWeight: 1000 },
  'jenahak-b':         { orderingMode: 'whole_or_weight', averageWeight: 800 },
  'tenggiri':          { orderingMode: 'whole_or_weight', averageWeight: 1000 },
  'tenggiri-potong':   { orderingMode: 'whole_or_weight', averageWeight: 1000 },
  'merah-potong':      { orderingMode: 'whole_or_weight', averageWeight: 1000 },
  'merah-b':           { orderingMode: 'whole_or_weight', averageWeight: 800 },

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
  // 1. DB value takes precedence
  if (row.ordering_mode && ['fixed_quantity', 'weight_only', 'whole_or_weight', 'combo'].includes(row.ordering_mode)) {
    return row.ordering_mode as OrderingMode;
  }
  // 2. Explicit config map (covers all known products including whole_or_weight)
  const cfg = productConfig[row.id];
  if (cfg) return cfg.orderingMode;
  // 3. Backward compatibility heuristics for truly unknown products
  if (row.category === 'combo') return 'combo';
  if (row.category === 'chicken') return 'fixed_quantity';
  if (row.unit === 'per kg') return 'weight_only';
  return 'fixed_quantity';
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
  };
}

const SELECT = 'id, name, name_ms, category, price, unit, price_note, weight, quantity, description, long_description, image, images, freshness, preparation_options, vendor_id, vendor_name, tags, is_popular, ordering_mode';

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from('Product').select(SELECT);
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
    .eq('category', category);
  if (error) throw error;
  return (data as DbProduct[]).map(mapRow);
}

export async function fetchPopularProducts(limit = 4): Promise<Product[]> {
  const { data, error } = await supabase
    .from('Product')
    .select(SELECT)
    .eq('is_popular', true)
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
};

export async function createProduct(payload: ProductPayload): Promise<Product> {
  const { data, error } = await supabase
    .from('Product')
    .insert(payload)
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
