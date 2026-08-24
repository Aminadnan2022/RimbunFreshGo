import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const checkout = readFileSync(resolve(root, 'src/pages/CheckoutPage.tsx'), 'utf8');
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');

assert.match(app, /<Route path="\/order\/:id" element={<OrderTrackingPage \/>} \/>/, 'canonical order detail route must remain /order/:id');

const successStart = checkout.indexOf('const order = await placeCanonicalOrder(request)');
const catchStart = checkout.indexOf('} catch (err)', successStart);
assert.notEqual(successStart, -1, 'placement success result must be handled');
assert.notEqual(catchStart, -1, 'placement errors must be handled separately');

const successBranch = checkout.slice(successStart, catchStart);
assert.match(successBranch, /navigate\(`\/order\/\$\{order\.order_number\}`, \{ replace: true \}\)/, 'success must navigate to the returned order number');
assert.ok(
  successBranch.indexOf('navigate(`/order/${order.order_number}`, { replace: true })') < successBranch.indexOf('clearCart()'),
  'success must navigate before clearing the cart can activate the empty-cart redirect',
);
assert.match(successBranch, /placementSucceeded\.current = true;[\s\S]*navigate\(`\/order\/\$\{order\.order_number\}`, \{ replace: true \}\)/, 'success must suppress the empty-cart guard before navigation');
assert.match(checkout, /!cart\.items\.length && !placing && !placementSucceeded\.current/, 'empty-cart redirect must not override successful order navigation');

const failureBranch = checkout.slice(catchStart, checkout.indexOf('finally', catchStart));
assert.doesNotMatch(failureBranch, /navigate\(/, 'placement failure must not navigate');

console.log('Post-Place-Order navigation checks passed (returned order detail, navigate-before-clear, and no failure redirect).');
