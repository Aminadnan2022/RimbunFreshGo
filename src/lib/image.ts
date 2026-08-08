import { supabase } from './supabase';

export function isExternalUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://');
}

export function getImageUrl(path: string | null | undefined, bucket = 'product-images'): string {
  if (!path) return '';
  if (isExternalUrl(path)) return path;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export function getProductImage(path: string | null | undefined): string {
  return getImageUrl(path, 'product-images');
}

export function getBrandImage(path: string | null | undefined, version?: string | null): string {
  const url = getImageUrl(path, 'branding');
  if (!url) return '';
  if (!version) return url;
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`;
}

export function getStoragePath(category: string, name: string): string {
  const folder = category.toLowerCase();
  const filename = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    + '.webp';
  return `${folder}/${filename}`;
}
