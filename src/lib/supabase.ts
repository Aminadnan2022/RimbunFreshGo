import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

// This is Supabase's default browser storage-key convention, kept explicit so
// the stale-session recovery path clears only this client's auth state.
export const supabaseAuthStorageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: supabaseAuthStorageKey },
});

export function clearSupabaseAuthStorage(): void {
  if (typeof window === 'undefined') return;

  // These are the exact entries removed by auth-js _removeSession(). Do not
  // clear unrelated localStorage, such as the customer's cart or preferences.
  for (const key of [
    supabaseAuthStorageKey,
    `${supabaseAuthStorageKey}-code-verifier`,
    `${supabaseAuthStorageKey}-user`,
  ]) {
    window.localStorage.removeItem(key);
  }
}
