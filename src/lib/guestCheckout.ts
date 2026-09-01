import { supabase } from './supabase';
import type { CanonicalPlaceOrderRequest, CanonicalPlaceOrderResult } from './canonicalCheckout';
import type { Json } from '../types/database';
import { ensureGuestAuthIdentityWith } from './guestAuth';

const TOKEN_BYTES = 32;
export const guestCaptchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? '';
export const guestCaptchaConfigured = guestCaptchaSiteKey.length > 0;

export function createGuestAccessToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function ensureGuestAuthIdentity(captchaToken?: string): Promise<string> {
  return ensureGuestAuthIdentityWith(supabase.auth, guestCaptchaConfigured, captchaToken);
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
