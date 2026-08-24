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
assert.match(successBranch, /navigate\(`\/order\/\$\{order\.order_number\}`\)/, 'success must navigate to the returned order number');
assert.ok(
  successBranch.indexOf('navigate(`/order/${order.order_number}`)') < successBranch.indexOf('clearCart()'),
  'success must navigate before clearing the cart can activate the empty-cart redirect',
);

const failureBranch = checkout.slice(catchStart, checkout.indexOf('finally', catchStart));
assert.doesNotMatch(failureBranch, /navigate\(/, 'placement failure must not navigate');

console.log('Post-Place-Order navigation checks passed (returned order detail, navigate-before-clear, and no failure redirect).');
