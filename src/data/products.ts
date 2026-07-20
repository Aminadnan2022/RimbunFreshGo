import { supabase } from '../lib/supabase';
import { getPrepOptionsByCategory } from '../lib/preparationOptions';
import type { Product, Category, PreparationOption } from '../types';

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
};

function mapRow(row: DbProduct): Product {
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
  };
}

const SELECT = 'id, name, name_ms, category, price, unit, price_note, weight, quantity, description, long_description, image, images, freshness, preparation_options, vendor_id, vendor_name, tags, is_popular';

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
  const { error } = await supabase.from('Product').delete().eq('id', id);
  if (error) throw error;
}
