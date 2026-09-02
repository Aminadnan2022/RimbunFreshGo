import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const checkout = readFileSync(new URL('../src/pages/CheckoutPage.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261205000000_delivery_schedule_policy.sql', import.meta.url), 'utf8');
const canonical = readFileSync(new URL('../src/lib/canonicalCheckout.ts', import.meta.url), 'utf8');
const selector = readFileSync(new URL('../src/components/ui/DeliverySlotSelector.tsx', import.meta.url), 'utf8');

for (const marker of [
  'bulkDeliveryTitle',
  'externalDeliveryTitle',
  'externalCourierFeePending',
  'fullDeliveryAddress',
  'isDeliveryDateAllowed',
  'selectedDate={instantDate}',
  'scope="bulk"',
  'scope="external"',
]) assert.ok(checkout.includes(marker), `Checkout missing ${marker}`);

for (const marker of [
  'getUpcomingCustomerDeliverySlots',
  'communityOrCourierSlot',
  'courierSlot',
]) assert.ok(selector.includes(marker), `Delivery selector missing ${marker}`);

for (const marker of [
  'ARRAY[0, 2, 3, 4, 5, 6]',
  "v_weekday = 1",
  "v_weekday NOT IN (3, 5)",
  "time '15:00'",
  "round(NEW.delivery_fee, 2) <> 2.00",
  "'Lalamove / Grab'",
]) assert.ok(migration.includes(marker), `Migration missing ${marker}`);

assert.ok(canonical.includes('isBulkDeliveryPointEligible'));
assert.ok(canonical.includes("['zamrud', 'residensi_zamrud']"));
console.log('Delivery policy static checks passed');
