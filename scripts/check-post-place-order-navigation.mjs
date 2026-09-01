import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const checkout = readFileSync(resolve(root, 'src/pages/CheckoutPage.tsx'), 'utf8');
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');

assert.match(app, /<Route path="\/order\/:id" element={<OrderTrackingPage \/>} \/>/, 'canonical order detail route must remain /order/:id');
assert.match(app, /<Route path="\/guest-order\/:orderNumber" element={<GuestOrderTrackingPage \/>} \/>/, 'guest order detail route must remain token-bootstrap scoped');

const successStart = checkout.indexOf('const order = token');
const catchStart = checkout.indexOf('} catch (err)', successStart);
assert.notEqual(successStart, -1, 'placement success result must be handled');
assert.notEqual(catchStart, -1, 'placement errors must be handled separately');

const successBranch = checkout.slice(successStart, catchStart);
assert.match(successBranch, /navigate\(`\/order\/\$\{order\.order_number\}`, \{ replace: true \}\)/, 'success must navigate to the returned order number');
assert.match(successBranch, /navigate\(guestOrderUrl\(order\.order_number, token\), \{ replace: true \}\)/, 'guest success must navigate to the token-bootstrap URL');
assert.ok(
  successBranch.indexOf('navigate(`/order/${order.order_number}`, { replace: true })') < successBranch.indexOf('clearCart()') &&
    successBranch.indexOf('navigate(guestOrderUrl(order.order_number, token), { replace: true })') < successBranch.indexOf('clearCart()'),
  'registered and guest success must navigate before clearing the cart can activate the empty-cart redirect',
);
assert.match(successBranch, /placementSucceeded\.current = true;[\s\S]*navigate\(guestOrderUrl\(order\.order_number, token\), \{ replace: true \}\)[\s\S]*navigate\(`\/order\/\$\{order\.order_number\}`, \{ replace: true \}\)/, 'success must suppress the empty-cart guard before either navigation path');
assert.match(checkout, /!cart\.items\.length && !placing && !placementSucceeded\.current/, 'empty-cart redirect must not override successful order navigation');

const failureBranch = checkout.slice(catchStart, checkout.indexOf('finally', catchStart));
assert.doesNotMatch(failureBranch, /navigate\(/, 'placement failure must not navigate');

console.log('Post-Place-Order navigation checks passed (returned order detail, navigate-before-clear, and no failure redirect).');
