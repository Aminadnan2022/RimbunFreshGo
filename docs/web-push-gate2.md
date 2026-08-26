# Web Push Gate 2 operations

`notifications` and its existing triggers remain FreshGo's canonical in-app record. Web Push is an asynchronous delivery projection: its trigger creates one internal outbox job for a critical notification and does not add business-event logic.

1. Generate a VAPID key pair through the team's approved secret-management process. Never commit either key or paste the private key into a ticket, chat, or browser environment.
2. Set Supabase Edge Function secrets (replace values locally and do not commit shell history):

   ```sh
   supabase secrets set WEB_PUSH_VAPID_PUBLIC_KEY="..." WEB_PUSH_VAPID_PRIVATE_KEY="..." WEB_PUSH_VAPID_SUBJECT="mailto:operations@your-domain.example" WEB_PUSH_DISPATCH_SECRET="long-random-secret" --project-ref YOUR_PROJECT_REF
   ```

3. Add only the matching public key as `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` in frontend hosting, then rebuild. A private VAPID key must never be `VITE_*`.
4. After reviewing and applying the migration, deploy the dispatcher:

   ```sh
   supabase functions deploy web-push-dispatch --no-verify-jwt --project-ref YOUR_PROJECT_REF
   ```

   The function independently requires `x-freshgo-dispatch-secret` to match `WEB_PUSH_DISPATCH_SECRET`.
5. Configure a protected scheduler to POST every minute to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/web-push-dispatch` with that secret header. Restrict its network identity where supported, set a scheduler concurrency limit of one, and rate-limit the function at the gateway to the scheduler's expected cadence plus a small burst (for example 5 requests/minute per trusted scheduler identity). Alert on 401/429/5xx responses. It claims 25 per-subscription jobs per run, retries transient failures (including subscription-read failures) up to five times using capped exponential backoff, and disables endpoints returning 404/410.

Users explicitly opt in from the notification menu; permission is never requested on load. Browser writes go through owner-scoped RPCs rather than direct table updates, so browser roles cannot alter delivery-maintenance fields. Payloads contain only notification ID, title, body, and a same-origin action route; the service worker rejects cross-origin and backslash routes. Unsubscribe marks the stored record disabled before removing the browser subscription; 404/410 stale endpoints are disabled by the sender. The dispatcher compares its secret without an early-exit loop because the Edge runtime does not expose Node's `timingSafeEqual`.

## Origin change and launch

Web Push subscriptions, service-worker registrations, permission state, and PWA installs are bound to a browser origin. `https://app.freshgo.my` is the production FreshGo app origin. A subscription or installed PWA from localhost, a Cloudflare Pages preview, or any former app hostname is not reusable there. After the custom domain is live, ask users to open `app.freshgo.my` and opt in again; do not copy, migrate, or treat preview subscriptions as production subscriptions. The app registers `/sw.js` with `/` scope relative to its current origin, so the same build remains correct on localhost, previews, and the production subdomain.
