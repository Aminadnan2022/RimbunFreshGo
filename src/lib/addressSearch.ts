import { supabase } from './supabase';
import { isCommunityResidenceAddress } from './deliveryResidence';

export interface AddressSuggestion {
  placeId: string;
  displayAddress: string;
}

export interface SelectedDeliveryAddress {
  display_address: string;
  latitude: number;
  longitude: number;
  /** Original Google suggestion label, retained when the resolver shortens the address. */
  place_label?: string;
}

export function isJalanZamrudUtamaAddress(displayAddress: string, placeLabel?: string): boolean {
  return isCommunityResidenceAddress(displayAddress, placeLabel ?? '');
}

type AddressSearchResponse = {
  suggestions?: AddressSuggestion[];
  address?: SelectedDeliveryAddress;
};

async function invokeAddressSearch(body: Record<string, unknown>): Promise<AddressSearchResponse> {
  const { data, error } = await supabase.functions.invoke('address-search', { body });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') throw new Error('Address search returned an invalid response.');
  return data as AddressSearchResponse;
}

export async function searchMalaysiaAddresses(
  query: string,
  sessionToken: string,
  language: 'en' | 'ms',
): Promise<AddressSuggestion[]> {
  const data = await invokeAddressSearch({ action: 'search', query, sessionToken, language });
  return Array.isArray(data.suggestions) ? data.suggestions : [];
}

export async function resolveMalaysiaAddress(
  placeId: string,
  sessionToken: string,
  language: 'en' | 'ms',
): Promise<SelectedDeliveryAddress> {
  const data = await invokeAddressSearch({ action: 'resolve', placeId, sessionToken, language });
  if (!data.address) throw new Error('The selected address could not be resolved.');
  return data.address;
}

export async function reverseGeocodeMalaysiaAddress(
  latitude: number,
  longitude: number,
  language: 'en' | 'ms',
): Promise<SelectedDeliveryAddress> {
  const data = await invokeAddressSearch({ action: 'reverse', latitude, longitude, language });
  if (!data.address) throw new Error('Your current address could not be resolved.');
  return data.address;
}
