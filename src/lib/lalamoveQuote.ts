import { supabase } from './supabase';

export interface LalamoveQuote {
  quotationId: string;
  quotedFee: string;
  currency: string;
  expiresAt: string;
}

export interface LalamoveQuoteRequest {
  deliveryAddress: string;
  deliveryLatitude: number;
  deliveryLongitude: number;
  requestedDate: string;
  requestedTime: string;
}

export async function requestLalamoveQuote(
  request: LalamoveQuoteRequest,
): Promise<LalamoveQuote> {
  const { data, error } = await supabase.functions.invoke('lalamove-quote', {
    body: request,
  });

  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object' || typeof data.quotationId !== 'string') {
    throw new Error('Lalamove returned an invalid quotation response.');
  }

  return data as LalamoveQuote;
}
