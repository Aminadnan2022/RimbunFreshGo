# Supabase Anonymous Sign-In Security Audit

Audit baseline: `b0c8a67` (`feat: add secure guest checkout`)

Audit scope: every migration and frontend reference containing `authenticated`,
`auth.uid()`, `auth.jwt()`, role helpers, grants, RLS, storage policies, RPCs,
or `SECURITY DEFINER`. Anonymous Sign-Ins remain disabled and no migration in
this audit was deployed.

## Findings

### BLOCKER — hardened

- `capture_signup_privacy_consents()` rejected an anonymous `auth.users` row
  because anonymous sign-in has no registered-account privacy metadata. It now
  returns immediately for `NEW.is_anonymous` without creating a consent row.
- `place_sales_order()` and its idempotency replay path accepted any non-null
  `auth.uid()`. Anonymous calls now require the transaction-local marker set by
  `place_guest_sales_order()`; direct calls are denied.
- An anonymous user could call `record_customer_privacy_consents()`, manufacture
  registered-customer consent, and satisfy the old canonical checkout trigger.
  Consent reads/writes now require `is_permanent_authenticated_user()` and the
  checkout trigger independently denies anonymous calls outside the guest wrapper.
- Product-image and branding storage mutation policies granted upload, update,
  and delete to every `authenticated` user. The broad policies are removed and
  replaced with `is_admin()` policies.
- The frontend role fallback classified an anonymous identity with no role row
  as `customer`. Anonymous identities now receive no registered role, and the
  profile, order history, canonical order tracking, privacy-consent, and
  notification pages reject anonymous sessions.

### NEEDS HARDENING — hardened

- Direct customer profile and legacy `Orders` RLS used only `auth.uid()`. Added
  restrictive permanent-user policies for profile/history reads and writes.
- Canonical order tables already had anonymous-deny restrictive SELECT policies,
  but customer `SECURITY DEFINER` RPCs could outlive the 24-hour verified guest
  session. Payment display, supplier tracking, rider tracking, delivery proof
  metadata, receipt submission, legacy preparation snapshots, and rider-name
  lookup now require a permanent customer for their customer branch. Admin and
  assigned-rider branches remain unchanged.
- The canonical receipt storage insert policy treated an anonymous order owner
  as a registered customer. A restrictive policy now allows permanent users,
  guest-owned checkout staging, or the `guest/<order-id>/...` path only with an
  active verified guest order session.
- Delivery-proof storage could be read by the original anonymous order identity
  after its guest access session expired. Anonymous reads now require
  `can_guest_read_delivery_proof()` and an unexpired verified session.
- Notifications and web-push ownership checks used only `auth.uid()`. Restrictive
  RLS and guarded push RPCs now reserve them for permanent accounts.
- Legacy delivery batches expose supplier notes and private tracking URLs under
  a broad authenticated SELECT policy. A restrictive permanent-user SELECT
  boundary now excludes temporary identities.

### SAFE

- `is_admin()`, `is_supplier()`, `is_delivery_rider()`, staff RLS, and staff RPCs
  require explicit rows in `user_roles`, `supplier_users`, delivery assignments,
  or equivalent active membership. Anonymous identity creation does not create
  any of those rows; role mutation remains admin-only.
- `user_roles` self-read and `supplier_profiles` self-read/update cannot grant a
  role or supplier link. An anonymous UUID has no matching pre-provisioned row,
  while creation/assignment is admin-only.
- Guest capability tables have RLS enabled and all direct privileges revoked.
  Their `SECURITY DEFINER` functions bind access to a SHA-256 token hash,
  anonymous identity, order-specific verified session, expiry, and non-enumerating
  responses.
- Guest direct reads of canonical order, line, component, receipt, event,
  fulfilment, delivery, proof, and supplier-batch tables are denied by restrictive
  policies from `20261130000000_freshgo_guest_checkout.sql`.
- Guest receipt uploads are limited to a verified order session, a UUID-scoped
  object path, allowed MIME/extension, 5 MiB, current final amount, and an
  existing storage object. Anonymous users cannot browse the private receipt
  bucket.
- Active catalog, published preparation/configuration, public product images,
  public branding, public payment QR, active combo, site setting, and active
  delivery-point reads are intentional storefront/public data.
- Reporting views previously granted to `anon, authenticated` are revoked by
  later reporting/privacy migrations. Direct financial tables and admin report
  RPCs remain admin-only.
- Guest checkout staging remains owner/path scoped because fixed-price guest
  checkout must upload a receipt before canonical placement. It does not grant
  canonical order placement; the verified guest wrapper is still required.

## Remaining gates before enabling Anonymous Sign-Ins

1. Apply `20261201000000_anonymous_auth_boundary_hardening.sql` to a local or
   dedicated test database and run database lint. The Supabase CLI was not
   installed during this audit, so SQL execution was not simulated locally.
2. Enable Anonymous Sign-Ins only in that disposable/local test environment,
   then run `test:guest-checkout:rpc`. Keep the production setting disabled.
3. Gate 3A adds the supported Supabase Auth + Cloudflare Turnstile handoff. The browser
   obtains a token and passes it only as `signInAnonymously({ options: { captchaToken } })`.
   Supabase remains the server-side verifier. TEST live configuration still requires a
   Cloudflare TEST widget/site key/secret and enabling Turnstile under Bot and Abuse
   Protection for `FreshGo Test` (`jypujsyiecgcjtjrqjfx`). The 30 sign-ins/IP/hour
   limit remains an independent control and must not be weakened.
4. Repeat the registered customer/admin/supplier/rider RLS suites against the
   same migrated test database before a production change window.

## Later PowerShell commands (local/test only)

```powershell
Set-Location C:\Project\RimbunFreshGo
npx supabase start
npx supabase db reset
npx supabase db lint --local --level warning
npm run test:anonymous-auth-boundaries
npm run test:guest-checkout
npm run test:guest-captcha
npm run typecheck
npm run build
```

After Anonymous Sign-Ins are explicitly enabled in the local/test environment
and `.env.test` points only to that environment:

```powershell
Set-Location C:\Project\RimbunFreshGo
npm run test:guest-checkout:rpc
npm run test:e2e:prelaunch
```

For the dedicated TEST project currently recorded in `.env.test`, review before
applying and never substitute a production project reference:

```powershell
Set-Location C:\Project\RimbunFreshGo
npx supabase link --project-ref jypujsyiecgcjtjrqjfx
npx supabase db push --dry-run
npx supabase db push
```
