# Gate 3 transactional email

Transactional email is an asynchronous, idempotent delivery channel for the existing customer-facing `notifications` events. The database queue is canonical for dispatch state; Resend is only the delivery provider.

## Covered events

- payment receipt submitted / payment pending (`order_payment_submitted`)
- final amount ready for payment (`price_finalised`)
- payment confirmed (`payment_confirmed`)
- payment receipt rejected (`payment_receipt_rejected`)
- ready for delivery (`ready_for_delivery`, added by the follow-up migration)
- out for delivery (`out_for_delivery`)
- delivered (`order_delivered`)
- cancelled (`order_cancelled`)

Each notification can create only one queue job, and every Resend request has the stable `Idempotency-Key` `freshgo-transactional-email-<job-id>`. A 15-minute lease is recovered by `claim_transactional_email_jobs`; transient provider failures are retried up to five attempts.

## P0 customer templates and privacy

The eight covered events have event-specific, mobile-friendly branded HTML and plain-text templates. Every template shows the human-readable order number, a customer-facing status, an explanation, what happens next, an explicit action only when required, and an absolute order CTA. Receipt submitted remains awaiting verification; only `payment_confirmed` says payment is confirmed. Cancellation wording does not promise a refund.

`get_transactional_email_projection(notification_id)` is a `service_role`-only, forward-only database projection. It returns only the event type, order number, relevant payment status, final amount for `price_finalised`/`payment_confirmed`, and delivery date/window/area for delivery events. It does not return the full order or notification row. Full addresses, phone numbers, customer/preparation notes, receipts, bank details, proof-of-delivery images, supplier data, tokens, and internal UUIDs are excluded from visible content. Rejection reasons are omitted because the existing reason field is free text and is not proven to be sanitized customer-facing content.

CTA construction ignores `notifications.action_url`. The default and only production origin is `https://app.freshgo.my`; explicit `http://localhost` and `http://127.0.0.1` origins are accepted solely through `TRANSACTIONAL_EMAIL_APP_BASE_URL` for local tests. Any invalid or unapproved origin falls back to production. The order route uses the human-readable order number rather than the internal UUID. No separate support or delivery-issue link is rendered because the app currently has no verified customer route for either purpose.

## Required Supabase Edge Function secrets

- `RESEND_API_KEY`
- `TRANSACTIONAL_EMAIL_FROM` — `FreshGo <no-reply@freshgo.my>`
- `TRANSACTIONAL_EMAIL_DISPATCH_SECRET`
- `TRANSACTIONAL_EMAIL_APP_BASE_URL` — optional for local testing only; omit in production

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to Supabase Edge Functions by the platform. Do not place any of these values in repository files, `.env.example`, or browser-visible `VITE_*` variables.

## Review-first rollout

1. In Resend, verify `freshgo.my` and create a restricted API key with send-email access.
2. In Supabase Dashboard for `jypujsyiecgcjtjrqjfx`, open **Edge Functions → Secrets** and save the three values above.
3. Review and apply `20261114000000_transactional_email_foundation.sql`, `20261115000000_add_ready_for_delivery_email_notification.sql`, then `20261118000000_transactional_email_safe_projection.sql` in that order.
4. Deploy `transactional-email-dispatcher` only after review. Its invocation must be a `POST` with `x-freshgo-dispatch-secret`; no scheduler is configured by this change.
5. Make one controlled test notification and inspect `transactional_email_jobs` and `transactional_email_attempts` before enabling any recurring invocation.
