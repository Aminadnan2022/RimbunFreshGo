import { readFile } from 'node:fs/promises';

const files = {
  redirect: 'src/pages/AuthRedirectPage.tsx',
  consent: 'src/pages/PrivacyConsentPage.tsx',
  checkout: 'src/pages/CheckoutPage.tsx',
  migration: 'supabase/migrations/20261112000000_google_oauth_privacy_consent_gate.sql',
  header: 'src/components/layout/Header.tsx',
};

const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, path]) => [name, await readFile(path, 'utf8')])));
const required = [
  ['first-time Google user is redirected to consent', source.redirect.includes("navigate('/privacy-consent'")],
  ['returning consented user bypasses consent', source.redirect.includes('if (complete) navigate(returnTo')],
  ['verified email user keeps the accepted-consent trigger path', source.migration.includes("NEW.raw_app_meta_data->>'provider' = 'google'") && source.migration.includes("(NEW.id, 'privacy_notice', true, v_version, 'signup')")],
  ['consent is recorded with the current version', source.consent.includes('record_customer_privacy_consents') && source.consent.includes('PRIVACY_POLICY_VERSION')],
  ['checkout is gated in the app', source.checkout.includes('hasCurrentPrivacyConsent()')],
  ['checkout is gated in the database', source.migration.includes('enforce_customer_privacy_consent_before_checkout')],
  ['email verification redirect remains configured', source.header.includes('emailRedirectTo: redirectTo')],
  ['unverified email message remains handled', source.header.includes('isUnverifiedEmailError')],
];

const failures = required.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) throw new Error(`Auth consent regression checks failed: ${failures.join(', ')}`);
console.log(`Auth consent regression checks passed (${required.length} scenarios).`);
