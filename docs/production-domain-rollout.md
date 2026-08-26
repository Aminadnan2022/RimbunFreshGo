# Production domain and Cloudflare Pages rollout

FreshGo uses two separate public origins:

- `https://freshgo.my` is the independently deployed marketing and landing site.
- `https://app.freshgo.my` is the FreshGo web app and PWA.

The application intentionally uses origin-relative routes for its manifest, service worker, offline page, and auth return URL. Therefore one build works on localhost, Cloudflare preview deployments, and `app.freshgo.my`; a preview origin must not be hard-coded as production.

## Cloudflare Pages (review-first)

1. In Cloudflare Pages, open the existing `rimbunfreshgo` project and confirm its production branch is the reviewed branch to publish (not this feature branch until it is approved and merged according to the team's process).
2. Add `app.freshgo.my` under **Custom domains** for that Pages project.
3. Follow the exact DNS target or record Cloudflare displays for that domain. Do not pre-create a guessed CNAME target. If Cloudflare manages the `freshgo.my` zone, it may create the DNS record itself; otherwise create the precise record it supplies at the authoritative DNS provider.
4. Verify HTTPS is active and that `https://app.freshgo.my/sw.js` returns the `Cache-Control: no-cache` header included in this repository's `public/_headers` file. Confirm `/auth/redirect` loads the SPA after a direct request (the repository's `public/_redirects` provides this fallback).
5. Do not attach `freshgo.my` to the `rimbunfreshgo` Pages project and do not alter its A, AAAA, CNAME, or redirect records. It remains reserved for the separate landing-site deployment.

## Frontend environment values

The active app origin is always the browser's current origin. This keeps OAuth return URLs, the PWA manifest, and service-worker scope correct in previews. Set `VITE_MARKETING_SITE_URL=https://freshgo.my` only where the app deliberately renders a link back to marketing. No such cross-site link is assumed or added by this change, so the in-app `/` route remains the app home page.

## Launch verification

1. Open `https://app.freshgo.my`, install the PWA, then inspect that the manifest start URL and service-worker scope both resolve under that origin.
2. Enable Web Push from the explicit notification control and confirm a newly created subscription is used. Do not expect any preview subscription to carry over.
3. Complete email/password and Google sign-in and confirm both return to `https://app.freshgo.my/auth/redirect`.
4. Check a Cloudflare preview separately; it must retain its own origin and must not redirect users or service workers to production.
