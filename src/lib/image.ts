import { supabase } from './supabase';

const BUCKET = 'product-images';

export function isExternalUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://');
}

export function getProductImage(path: string | null | undefined): string {
  if (!path) return '';
  if (isExternalUrl(path)) return path;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  console.log('PATH:', path);
  console.log('PUBLIC URL:', data.publicUrl);
  return data.publicUrl;
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
