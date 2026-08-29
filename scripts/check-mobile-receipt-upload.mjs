import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tracking = readFileSync(resolve(root, 'src/pages/OrderTrackingPage.tsx'), 'utf8');
const checkout = readFileSync(resolve(root, 'src/pages/CheckoutPage.tsx'), 'utf8');

for (const [name, source, fileId, cameraId] of [
  ['checkout', checkout, 'checkout-payment-receipt-file', 'checkout-payment-receipt-camera'],
]) {
  assert.match(source, new RegExp(`id=\"${fileId}\"`), `${name} must have a separate gallery picker`);
  assert.match(source, new RegExp(`id=\"${cameraId}\"`), `${name} must have a separate camera picker`);
  const captureBeforeState = source.match(/const file = event\.currentTarget\.files\?\.\[0\];\s*if \(!file\) return;\s*(?:selectReceiptFile\(file\)|setReceiptFile\(file\))/g) ?? [];
  assert.equal(captureBeforeState.length, 2, `${name} must capture a File before updating state in both handlers`);
  assert.doesNotMatch(source, /\.click\(\)/, `${name} must not use programmatic clicks for its native pickers`);
  assert.doesNotMatch(source, /currentTarget\.value = ''/, `${name} must never clear a native file input during Android picker handoff`);
  assert.doesNotMatch(source, /onChange=\{[\s\S]{0,500}event\.currentTarget\.value = ''/, `${name} must not clear the native input in its change handler`);
  assert.match(source, /capture="environment"/, `${name} camera picker must retain the rear-camera hint`);
  assert.match(source, /image\/jpeg,image\/png,image\/webp,application\/pdf/, `${name} must retain accepted receipt types`);
}

assert.match(tracking, /id="canonical-payment-receipt-file"/, 'tracking must have one gallery/files picker');
assert.match(tracking, /htmlFor="canonical-payment-receipt-camera"/, 'tracking camera picker must have a visible label target');
assert.match(tracking, />\s*Use camera\s*<input/, 'tracking camera picker must have a clear visible label');
assert.match(tracking, /id="canonical-payment-receipt-camera"[\s\S]{0,220}capture="environment"/, 'tracking must keep camera capture separate from gallery/files');
assert.match(tracking, /id="canonical-payment-receipt-camera"[\s\S]{0,360}className="sr-only"/, 'tracking camera input must not appear as a second unlabeled Choose file control');
assert.match(tracking, /onInput=\{captureFile\}/, 'tracking must capture Android input events');
assert.match(tracking, /onChange=\{captureFile\}/, 'tracking must retain the standard file change event');
assert.match(tracking, /const file = event\.currentTarget\.files\?\.\[0\];\s*if \(!file/, 'tracking must capture the File before setting picker state');
assert.match(tracking, /setSelectedFile\(file\);\s*onSelect\(file\)/, 'tracking picker must retain the filename locally before passing the File to the page');
assert.doesNotMatch(tracking, /currentTarget\.value = ''/, 'tracking must never clear the native file input during Android picker handoff');
assert.match(tracking, /scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/, 'tracking must reveal the upload area after selection');
assert.match(tracking, /const userId = user\?\.id;/, 'tracking must use a stable user identity during native picker handoff');
assert.match(tracking, /\[id, loadLive, userId\]/, 'tracking refresh must not remount the picker when auth returns a new User object');
assert.doesNotMatch(tracking, /\[id, loadLive, user\]/, 'tracking refresh must not depend on the unstable auth User object');
assert.match(tracking, /p_expected_final_total: canonicalPayment\.finalTotal/, 'tracking submission must remain bound to the final total');
const trackingNativePickerControls = tracking.match(/className="block w-full text-sm text-gray-600 file:mr-3/g) ?? [];
assert.equal(trackingNativePickerControls.length, 0, 'tracking picker must retain mobile width containment');
assert.match(tracking, /className="block w-full min-w-0 max-w-full text-sm text-gray-600 file:mr-3/, 'tracking must expose one width-contained Android-compatible native file control');
assert.match(checkout, /p_expected_final_total: total/, 'checkout staging must remain bound to the checkout total');
const checkoutNativePickerControls = checkout.match(/className="block w-full text-sm text-gray-600 file:mr-3/g) ?? [];
assert.equal(checkoutNativePickerControls.length, 2, 'checkout must expose its two Android-compatible native file controls');
assert.match(tracking, /submit_sales_order_payment_receipt/, 'tracking submission must retain the guarded receipt RPC');
assert.match(checkout, /stage_checkout_payment_receipt/, 'checkout staging must retain the guarded receipt RPC');
assert.doesNotMatch(checkout, /const ReceiptPicker = \(\) =>/, 'checkout picker must not be a nested component that remounts on selection');
assert.doesNotMatch(checkout, /const Payment = \(\) =>/, 'checkout payment subtree must not remount on receipt state changes');
assert.match(checkout, /const receiptPicker = \(/, 'checkout picker must render as a stable inline element');
assert.match(checkout, /const payment = <div/, 'checkout payment content must render as a stable inline element');
assert.match(checkout, /min-w-0 max-w-full overflow-hidden rounded-xl border border-green-200/, 'checkout selected-file panel must contain long filenames');
assert.match(checkout, /<span className="min-w-0 break-all">\{t\('payment\.receiptUploaded'\)\}: \{stagedReceipt\.fileName\}<\/span>/, 'checkout uploaded-file status must wrap long filenames');
assert.match(checkout, /createBrowserUuid\(\)/, 'checkout receipt flow must use the HTTP-compatible UUID helper');
assert.doesNotMatch(checkout, /crypto\.randomUUID\(\)/, 'checkout receipt flow must not require secure-context randomUUID support');

console.log('Mobile receipt picker regression checks passed.');
