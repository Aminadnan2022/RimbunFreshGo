import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureGuestAuthIdentityWith, GuestCaptchaRequiredError, type GuestAuthClient } from '../src/lib/guestAuth.ts';

const calls: unknown[] = [];
const successfulAuth: GuestAuthClient = {
  getSession: async () => ({ data: { session: null } }),
  signInAnonymously: async (credentials) => {
    calls.push(credentials);
    return { data: { user: { id: 'guest-id' } }, error: null };
  },
};

await assert.rejects(
  ensureGuestAuthIdentityWith(successfulAuth, true),
  GuestCaptchaRequiredError,
  'configured guest auth must block when no CAPTCHA token is available',
);
assert.equal(calls.length, 0, 'missing CAPTCHA must not call anonymous sign-in');

assert.equal(await ensureGuestAuthIdentityWith(successfulAuth, true, ' captcha-token '), 'guest-id');
assert.deepEqual(calls.at(-1), { options: { captchaToken: 'captcha-token' } });

let existingSignups = 0;
const existingSession: GuestAuthClient = {
  getSession: async () => ({ data: { session: { user: { id: 'registered-id' } } } }),
  signInAnonymously: async () => {
    existingSignups += 1;
    return { data: { user: null }, error: { message: 'must not run' } };
  },
};
assert.equal(await ensureGuestAuthIdentityWith(existingSession, true), 'registered-id');
assert.equal(existingSignups, 0, 'an authenticated customer must bypass CAPTCHA and anonymous signup');

let attempts = 0;
const expiringAuth: GuestAuthClient = {
  getSession: async () => ({ data: { session: null } }),
  signInAnonymously: async () => {
    attempts += 1;
    return attempts === 1
      ? { data: { user: null }, error: { message: 'captcha verification process failed' } }
      : { data: { user: { id: 'retry-guest' } }, error: null };
  },
};
await assert.rejects(ensureGuestAuthIdentityWith(expiringAuth, true, 'expired-token'));
assert.equal(await ensureGuestAuthIdentityWith(expiringAuth, true, 'fresh-token'), 'retry-guest');

const root = resolve(import.meta.dirname, '..');
const panel = readFileSync(resolve(root, 'src/components/auth/GuestCaptchaPanel.tsx'), 'utf8');
const checkout = readFileSync(resolve(root, 'src/pages/CheckoutPage.tsx'), 'utf8');
const guestClient = readFileSync(resolve(root, 'src/lib/guestCheckout.ts'), 'utf8');
const header = readFileSync(resolve(root, 'src/components/layout/Header.tsx'), 'utf8');
assert.match(panel, /verificationLock\.current/, 'CAPTCHA callback must reject rapid duplicate verification');
assert.match(panel, /turnstile\.reset/, 'failed and expired challenges must be resettable');
assert.match(panel, /resolve\(window\.turnstile\)/, 'the explicit loader must resolve immediately after the script load event');
assert.doesNotMatch(panel, /window\.turnstile\.ready/, 'the explicit loader must not wait forever on turnstile.ready after load');
assert.match(checkout, /placementLock\.current/, 'checkout must retain its rapid-tap lock');
assert.match(checkout, /guestCaptchaPending/, 'configured CAPTCHA must disable guest placement until verified');
assert.match(header, /signInWithPassword\([\s\S]*captchaToken/, 'registered password sign-in must keep working when project CAPTCHA is enabled');
assert.match(header, /signUp\([\s\S]*captchaToken/, 'registered sign-up must keep working when project CAPTCHA is enabled');
assert.doesNotMatch(`${panel}\n${guestClient}`, /console\.(log|warn|error)\([^)]*(captcha|token)/i, 'CAPTCHA tokens must never be logged');

console.log('Guest CAPTCHA checks passed: configured blocking, supported token forwarding, failure/retry, registered-session bypass, token non-logging, and rapid-tap locks are present.');
