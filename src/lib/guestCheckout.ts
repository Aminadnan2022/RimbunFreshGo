import { supabase } from './supabase';
import type { CanonicalPlaceOrderRequest, CanonicalPlaceOrderResult } from './canonicalCheckout';
import type { Json } from '../types/database';

const TOKEN_BYTES = 32;

export function createGuestAccessToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function ensureGuestAuthIdentity(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user.id) return sessionData.session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(error?.message || 'Guest checkout is temporarily unavailable.');
  }
  return data.user.id;
}

export async function placeGuestOrder(
  request: CanonicalPlaceOrderRequest,
  accessToken: string,
): Promise<CanonicalPlaceOrderResult> {
  await ensureGuestAuthIdentity();
  const { data, error } = await supabase.rpc('place_guest_sales_order', {
    ...request,
    p_customer_snapshot: request.p_customer_snapshot as Json,
    p_delivery_request: request.p_delivery_request as Json,
    p_items: request.p_items as unknown as Json,
    p_preparation_answers: request.p_preparation_answers as unknown as Json,
    p_access_token: accessToken,
    p_expected_final_total: request.p_expected_final_total ?? null,
    p_expected_payment_configuration_version_id:
      request.p_expected_payment_configuration_version_id ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Guest order placement returned no result.');
  return row as unknown as CanonicalPlaceOrderResult;
}

export function guestOrderUrl(orderNumber: string, accessToken: string): string {
  return `/guest-order/${encodeURIComponent(orderNumber)}#token=${encodeURIComponent(accessToken)}`;
}

export function guestTokenStorageKey(orderNumber: string): string {
  return `freshgo:guest-order:${orderNumber}`;
}
