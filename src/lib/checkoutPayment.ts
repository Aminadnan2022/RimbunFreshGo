import type { CartItem, OrderingMode } from '../types';
import { supabase } from './supabase';

const WEIGHED_MODES = new Set<OrderingMode>([
  'whole_fish_by_weight',
  'weight_only',
  'slice',
]);

export interface CheckoutPaymentPreview {
  configurationVersionId: string;
  qrStoragePath: string;
  instructions: string | null;
  currencyCode: string;
}

export function isPriceFinalAtCheckout(items: CartItem[]): boolean {
  return items.every((item) => {
    if (item.isCombo) {
      return Boolean(item.comboItems?.length) && (item.comboItems ?? []).every(
        (component) => component.pricingType === 'fixed',
      );
    }

    if (item.orderingMode && WEIGHED_MODES.has(item.orderingMode)) return false;
    return item.orderingMode === 'fixed_quantity' || item.pricingType === 'fixed';
  });
}

export async function getCheckoutPaymentPreview(): Promise<CheckoutPaymentPreview | null> {
  const { data, error } = await supabase.rpc('get_checkout_payment_configuration');
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.id || !row.qr_storage_path) return null;

  return {
    configurationVersionId: String(row.id),
    qrStoragePath: String(row.qr_storage_path),
    instructions: row.instructions ? String(row.instructions) : null,
    currencyCode: String(row.currency_code ?? 'MYR'),
  };
}

export function paymentQrPublicUrl(storagePath: string): string {
  return supabase.storage.from('payment-qr').getPublicUrl(storagePath).data.publicUrl;
}
