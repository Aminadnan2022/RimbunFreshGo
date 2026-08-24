import { supabase } from './supabase';
export { isPriceFinalAtCheckout } from './checkoutPricing';

export interface CheckoutPaymentPreview {
  configurationVersionId: string;
  qrStoragePath: string;
  instructions: string | null;
  currencyCode: string;
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
