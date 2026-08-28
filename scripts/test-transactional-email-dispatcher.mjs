import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CUSTOMER_EMAIL_TYPES, isTransientProviderStatus, renderTransactionalEmail, retryAt } from '../supabase/functions/transactional-email-dispatcher/email.ts';

const orderNumber = 'FG-20260828-00001';
const projection = (notification_type, overrides = {}) => ({
  notification_type, order_number: orderNumber, final_total: null, currency_code: 'MYR', payment_status: 'pending',
  delivery_date: null, delivery_window: null, delivery_area: null, ...overrides,
});

for (const type of CUSTOMER_EMAIL_TYPES) {
  const email = renderTransactionalEmail({ id: 'notification-1', notification_type: type }, projection(type));
  assert.match(email.subject, new RegExp(orderNumber), `${type}: subject must show order number`);
  assert.match(email.html, new RegExp(orderNumber), `${type}: HTML must show order number`);
  assert.match(email.text, new RegExp(orderNumber), `${type}: text must show order number`);
  assert.match(email.html, new RegExp(`href="https://app\\.freshgo\\.my/order/${orderNumber}"`), `${type}: absolute production CTA`);
  assert.match(email.text, new RegExp(`https://app\\.freshgo\\.my/order/${orderNumber}`), `${type}: useful text CTA`);
  assert.match(email.html, /What happens next\?/);
  assert.match(email.text, /What happens next\?/);
  assert.match(email.html, /will never ask for your password or OTP/);
  for (const forbidden of ['full address', '012-3456789', 'customer note', 'preparation note', 'receipt.jpg', 'bank account', 'pod.jpg', 'supplier secret', 'access-token']) {
    assert.doesNotMatch(email.html, new RegExp(forbidden, 'i'), `${type}: forbidden data leaked`);
    assert.doesNotMatch(email.text, new RegExp(forbidden, 'i'), `${type}: forbidden data leaked`);
  }
}

const pending = renderTransactionalEmail({ id: 'n', notification_type: 'order_payment_submitted' }, projection('order_payment_submitted'));
assert.match(pending.text, /awaiting verification/i);
assert.match(pending.text, /payment is not confirmed yet/i);
assert.doesNotMatch(pending.text, /^Payment: Confirmed$/m);

const finalised = renderTransactionalEmail({ id: 'n', notification_type: 'price_finalised' }, projection('price_finalised', { final_total: '42.50' }));
assert.match(finalised.text, /Final amount: RM\s?42\.50/);
assert.match(finalised.text, /ACTION REQUIRED/);
const confirmed = renderTransactionalEmail({ id: 'n', notification_type: 'payment_confirmed' }, projection('payment_confirmed', { final_total: 42.5, payment_status: 'paid' }));
assert.match(confirmed.text, /Payment: Confirmed/);
assert.match(confirmed.text, /Amount paid: RM\s?42\.50/);
const rejected = renderTransactionalEmail({ id: 'n', notification_type: 'payment_receipt_rejected' }, projection('payment_receipt_rejected'));
assert.match(rejected.text, /upload a replacement payment receipt/i);
const cancelled = renderTransactionalEmail({ id: 'n', notification_type: 'order_cancelled' }, projection('order_cancelled'));
assert.doesNotMatch(cancelled.text, /will (be )?refund|refund (has been|is confirmed)/i);
assert.match(cancelled.text, /does not confirm any refund status/i);

const delivery = renderTransactionalEmail({ id: 'n', notification_type: 'out_for_delivery' }, projection('out_for_delivery', { delivery_date: '2026-08-29', delivery_window: '6:30 PM–8:30 PM <late>', delivery_area: 'Putrajaya & Cyberjaya' }));
assert.match(delivery.text, /29 August 2026/);
assert.match(delivery.html, /6:30 PM–8:30 PM &lt;late&gt;/);
assert.match(delivery.html, /Putrajaya &amp; Cyberjaya/);

const escaped = renderTransactionalEmail({ id: 'n', notification_type: 'payment_confirmed' }, projection('payment_confirmed', { order_number: 'FG-<script>&"\'' }));
assert.match(escaped.html, /FG-&lt;script&gt;&amp;&quot;&#39;/);
assert.doesNotMatch(escaped.html, /FG-<script>/);
assert.match(escaped.text, /FG-<script>&"'/);
const hostileBase = renderTransactionalEmail({ id: 'n', notification_type: 'payment_confirmed' }, projection('payment_confirmed'), { appBaseUrl: 'https://evil.example/phish' });
assert.match(hostileBase.text, /https:\/\/app\.freshgo\.my\/order\//);
assert.doesNotMatch(hostileBase.html, /evil\.example/);
const localBase = renderTransactionalEmail({ id: 'n', notification_type: 'payment_confirmed' }, projection('payment_confirmed'), { appBaseUrl: 'http://localhost:4173/ignored' });
assert.match(localBase.text, /http:\/\/localhost:4173\/order\//);
const unsafeLocal = renderTransactionalEmail({ id: 'n', notification_type: 'payment_confirmed' }, projection('payment_confirmed'), { appBaseUrl: 'https://localhost:4173' });
assert.match(unsafeLocal.text, /https:\/\/app\.freshgo\.my\/order\//);

assert.throws(() => renderTransactionalEmail({ id: 'n', notification_type: 'admin_alert' }, projection('payment_confirmed')));
assert.throws(() => renderTransactionalEmail({ id: 'n', notification_type: 'payment_confirmed' }, projection('price_finalised')));
const dispatcher = await readFile('supabase/functions/transactional-email-dispatcher/index.ts', 'utf8');
const migration = await readFile('supabase/migrations/20261118000000_transactional_email_safe_projection.sql', 'utf8');
assert.doesNotMatch(dispatcher, /select\("[^"]*(title|message|action_url)/, 'dispatcher must not load generic or arbitrary action content');
assert.match(dispatcher, /get_transactional_email_projection/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_transactional_email_projection\(uuid\) FROM PUBLIC, anon, authenticated/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_transactional_email_projection\(uuid\) TO service_role/);
for (const forbiddenColumn of ['customer_snapshot', 'house_unit', 'apartment', 'phone', 'customer_notes', 'preparation', 'receipt_image', 'bank', 'proof_of_delivery', 'supplier_snapshot', 'token']) {
  assert.doesNotMatch(migration, new RegExp(forbiddenColumn, 'i'), `projection migration must not reference ${forbiddenColumn}`);
}
assert.equal(isTransientProviderStatus(408), true); assert.equal(isTransientProviderStatus(429), true); assert.equal(isTransientProviderStatus(503), true); assert.equal(isTransientProviderStatus(400), false);
const originalNow = Date.now; Date.now = () => 0; assert.equal(retryAt(1), '1970-01-01T00:00:30.000Z'); assert.equal(retryAt(5), '1970-01-01T00:08:00.000Z'); Date.now = originalNow;
console.log('Transactional email dispatcher tests passed for all 8 customer events.');
