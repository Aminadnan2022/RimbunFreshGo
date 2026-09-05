import type { SelectedDeliveryAddress } from './addressSearch';

const STORAGE_KEY = 'freshgo:delivery-address-prefill';
const MAX_AGE_MS = 30 * 60 * 1000;
const MALAYSIA_BOUNDS = { minLat: 0.8, maxLat: 7.5, minLng: 99.5, maxLng: 120 };

function isValidAddress(value: unknown): value is SelectedDeliveryAddress {
  if (!value || typeof value !== 'object') return false;

  const address = value as Partial<SelectedDeliveryAddress>;
  return typeof address.display_address === 'string' &&
    address.display_address.trim().length >= 5 &&
    address.display_address.trim().length <= 300 &&
    typeof address.latitude === 'number' && Number.isFinite(address.latitude) &&
    typeof address.longitude === 'number' && Number.isFinite(address.longitude) &&
    address.latitude >= MALAYSIA_BOUNDS.minLat && address.latitude <= MALAYSIA_BOUNDS.maxLat &&
    address.longitude >= MALAYSIA_BOUNDS.minLng && address.longitude <= MALAYSIA_BOUNDS.maxLng;
}

export function saveDeliveryAddressPrefill(address: SelectedDeliveryAddress): void {
  if (!isValidAddress(address)) return;

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      address: {
        display_address: address.display_address.trim(),
        latitude: address.latitude,
        longitude: address.longitude,
      },
      savedAt: Date.now(),
    }));
  } catch {
    // Session storage may be unavailable in private browsing.
  }
}

export function readDeliveryAddressPrefill(): SelectedDeliveryAddress | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { address?: unknown; savedAt?: unknown };
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > MAX_AGE_MS || Date.now() < savedAt) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return isValidAddress(parsed.address) ? parsed.address : null;
  } catch {
    return null;
  }
}

export function clearDeliveryAddressPrefill(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Session storage may be unavailable in private browsing.
  }
}
