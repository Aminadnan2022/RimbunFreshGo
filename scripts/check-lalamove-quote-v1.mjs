import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const edge = readFileSync(new URL('../supabase/functions/lalamove-quote/index.ts', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../src/pages/CheckoutPage.tsx', import.meta.url), 'utf8');
const canonical = readFileSync(new URL('../src/lib/canonicalCheckout.ts', import.meta.url), 'utf8');

assert.match(edge, /quotationPath = "\/v3\/quotations"/);
assert.doesNotMatch(edge, /\/v3\/orders/);
assert.match(edge, /crypto\.subtle\.sign\("HMAC"/);
assert.match(edge, /"Market": "MY"/);
assert.match(edge, /rest\.sandbox\.lalamove\.com/);
assert.match(edge, /rest\.lalamove\.com/);
assert.match(edge, /authClient\.auth\.getUser\(\)/);
assert.match(edge, /LALAMOVE_ALLOWED_ORIGINS/);
assert.match(edge, /LALAMOVE_PRODUCTION_QUOTES_ENABLED/);

assert.match(checkout, /requestLalamoveQuote/);
assert.match(checkout, /setLalamoveQuote\(null\)/);
assert.match(checkout, /details\.apartment, details\.houseUnit, instantDate, instantTime/);
assert.match(checkout, /lalamoveQuoteButton/);
assert.match(checkout, /selectedDeliveryAddress!\.latitude/);
assert.match(checkout, /selectedDeliveryAddress!\.longitude/);
assert.match(checkout, /selectCurrentDeliveryLocation/);

assert.match(canonical, /method_code: deliveryMethod/);
assert.doesNotMatch(canonical, /quotationId|quotedFee/);
assert.match(checkout, /const fee = isExternalDelivery \? 0 : BULK_DELIVERY_FEE/);

console.log('Lalamove Quote V1 checks passed: quotation-only, server-authenticated, invalidating, and excluded from order totals.');
