import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const edge = readFileSync(new URL('../supabase/functions/address-search/index.ts', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../src/pages/CheckoutPage.tsx', import.meta.url), 'utf8');
const canonical = readFileSync(new URL('../src/lib/canonicalCheckout.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261209000000_store_selected_delivery_addresses.sql', import.meta.url), 'utf8');

assert.match(edge, /GOOGLE_MAPS_API_KEY/);
assert.doesNotMatch(edge, /VITE_GOOGLE_MAPS_API_KEY/);
assert.match(edge, /includedRegionCodes: \["my"\]/);
assert.match(edge, /authClient\.auth\.getUser\(\)/);
assert.match(edge, /ADDRESS_SEARCH_ALLOWED_ORIGINS/);
assert.match(edge, /places:autocomplete/);
assert.match(edge, /formattedAddress,location/);
assert.match(edge, /maps\.googleapis\.com\/maps\/api\/geocode\/json/);

assert.match(checkout, /resolveMalaysiaAddress/);
assert.match(checkout, /reverseGeocodeMalaysiaAddress/);
assert.match(checkout, /selectedAddressRequired/);
assert.match(checkout, /setSelectedDeliveryAddress\(null\)/);
assert.match(checkout, /deliveryLatitude: selectedDeliveryAddress!\.latitude/);
assert.match(checkout, /deliveryLongitude: selectedDeliveryAddress!\.longitude/);

for (const field of ['display_address', 'latitude', 'longitude']) {
  assert.match(canonical, new RegExp(`${field}: input\\.selectedDeliveryAddress\\.${field}`));
  assert.match(migration, new RegExp(field));
}
assert.match(migration, /CREATE TABLE public\.sales_order_delivery_locations/);
assert.match(migration, /ALTER TABLE public\.sales_order_delivery_locations ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /REVOKE ALL ON TABLE public\.sales_order_delivery_locations FROM PUBLIC, anon, authenticated/);
assert.match(migration, /INSERT INTO public\.sales_order_delivery_locations/);
assert.match(migration, /p_delivery_request ->> 'method_code' = 'instant_customer_lalamove'/);

console.log('Address search checks passed: Malaysia-only provider proxy, explicit selection, optional device location, and selected coordinates in quote/order payloads.');
