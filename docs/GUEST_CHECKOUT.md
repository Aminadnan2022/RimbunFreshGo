# FreshGo Guest Checkout

## Architecture

Guest checkout uses a temporary Supabase Anonymous Auth identity as a browser/session principal. It does not create a second order model. `place_guest_sales_order` validates guest contact and delivery fields, then calls the existing `place_sales_order` or `place_sales_order_with_checkout_payment_preview` RPC. Pricing, snapshots, supplier fulfilment, hub batching, rider delivery, payment verification, and proof of delivery therefore remain canonical.

The browser creates a random 32-byte (256-bit) access token. Only its SHA-256 hash is stored in `guest_sales_order_access`; the raw token is never stored or logged by the application or database. The successful checkout URL carries the token in its fragment for bootstrap only. The guest tracking page moves it to session storage, establishes an expiring order-scoped database session, and immediately removes the fragment from the URL.

Guest pages never directly select `sales_orders` or related sensitive tables. `get_guest_sales_order` returns a customer-safe projection without supplier costs or internal administration data. Unknown orders and wrong tokens return the same response. Access attempts are limited per authenticated browser identity. Receipt uploads use private storage, random object paths, an active order-scoped session, and the existing 5 MB JPG/PNG/WebP/PDF constraints. Android gallery and rear-camera inputs remain separate.

The access table includes nullable `claimed_customer_id` and `claimed_at` fields as schema hooks for a future guest-to-registered claim flow. This release does not expose conversion UX.

## Deployment prerequisites

- Confirm the intended target before every configuration action. Gate 3A is limited to
  `FreshGo Test` (`jypujsyiecgcjtjrqjfx`). Production is `Rimbun FreshGo Project`
  (`zcfpdmjjmihhvtuwngii`) and must remain unchanged until the production cutover gate.
- Enable Anonymous Sign-Ins only in the intended target's Authentication settings.
- Keep the anonymous sign-in rate limit at **30 sign-ins per IP per hour** or lower.
- Configure Cloudflare Turnstile as described below before enabling Supabase CAPTCHA.
- Review the dry run before applying any database migration. Gate 3A adds no migration.

```powershell
npx supabase link --project-ref <PRODUCTION_PROJECT_REF>
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

### Turnstile and Supabase Auth setup (TEST only)

The frontend uses Cloudflare's explicit SPA widget. A solved token is passed directly
to Supabase Auth with `signInAnonymously({ options: { captchaToken } })`; FreshGo does
not implement a parallel verification endpoint or bypass. Supabase Auth performs the
server-side verification with the configured Turnstile secret.

1. In Cloudflare Turnstile, create a widget for the TEST web hostname(s). Add localhost
   only when local manual testing is required. Copy the public site key and secret key.
2. Set the public site key as `VITE_TURNSTILE_SITE_KEY` in the TEST frontend environment.
   It is safe to expose this site key. Never place the Turnstile secret in a `VITE_`
   variable, repository file, browser bundle, log, screenshot, or test report.
3. Reconfirm the Supabase dashboard header says `FreshGo Test` and project ref
   `jypujsyiecgcjtjrqjfx`. Under Authentication > Bot and Abuse Protection, enable
   CAPTCHA, choose Cloudflare Turnstile, enter the secret, and save.
4. Test a new private-browser guest checkout, an expired/reset challenge, rapid taps,
   receipt staging, order placement, and opening the private order link in a second
   private browser. Then repeat a registered checkout and login.
5. Confirm the anonymous sign-in rate limit remains 30/IP/hour. Turnstile filters bots;
   the rate limit remains an independent backstop and must not be weakened.

Do not enable CAPTCHA in Supabase before the matching public site key is deployed: doing
so makes new auth sessions fail closed. Because Supabase CAPTCHA is project-wide, the
public registered sign-in and create-account forms also pass a Turnstile token. Existing
registered sessions bypass the guest widget. Existing anonymous sessions are reused and
do not create duplicate anonymous accounts. Turnstile tokens are single-use and expire;
errors and expiry clear the token and reset the widget before retry.

After deployment, regenerate database types from the target if its schema has changed independently:

```powershell
npx supabase gen types typescript --linked | Set-Content -Encoding utf8 src/types/database.ts
npm run typecheck
```

## Manual mobile verification

1. In a private/logged-out Android browser, add a normal product and a combo from both cards and detail pages. Confirm no sign-in modal appears and the cart icon is visible.
2. Open the cart, choose a delivery day, and proceed to `Guest Checkout`.
3. Confirm Name, Phone/WhatsApp, Unit/Address, and delivery location are required; confirm Email is optional but rejects malformed non-empty input.
4. Place a fixed-price order. Test both `Choose file` and `Use camera`; test JPG, PNG, WebP, and PDF, plus a file over 5 MB. Confirm invalid files are rejected.
5. Rapidly tap `Place order`, then simulate a retry after a network interruption. Confirm only one canonical order exists and the retry returns the same order.
6. Confirm the private guest page opens, the `#token=...` fragment disappears immediately, refresh still works, and the displayed total matches the server-created canonical order.
7. In another private browser, open the complete original private link. Confirm it works. Change one token character and use a nonexistent order number; confirm both show the same generic access failure.
8. Confirm a guest cannot open another guest order by changing only the order number, and cannot query canonical order/line/receipt tables directly with its anonymous session.
9. For a weighed order, progress the existing supplier flow through final pricing. Refresh the guest page, confirm the final amount and QR appear, upload a receipt, reject once, re-upload, and confirm payment as admin.
10. Progress the same order through supplier packing, supplier dispatch, hub arrival, rider assignment, out-for-delivery, and delivered with both POD images. Confirm each guest timeline stage advances and delivered proof images display.
11. Repeat receipt capture and tracking at 360 px viewport width and with Android back navigation. Confirm no horizontal overflow, hidden file input trap, duplicate upload, or token reappearance in the URL.
12. Place and progress a registered customer order to confirm saved details, privacy consent gating, My Orders, canonical tracking, receipt submission, supplier, admin, and rider behavior remain unchanged.

## Operational risks

- Anonymous Sign-Ins are a required target-project setting and cannot be enabled by SQL migration.
- CAPTCHA is an Auth project setting and its secret cannot be supplied by a migration.
  Code completion does not mean live configuration completion.
- The built-in per-session attempt limit complements a 256-bit token but is not a distributed IP/WAF rate limit. Add edge-level throttling if abuse is observed.
- Full guest-to-registered claiming is deliberately deferred; the schema hooks must be paired with a separately reviewed ownership-transfer RPC before use.
