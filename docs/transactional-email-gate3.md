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

## Privacy

The dispatcher loads only the recipient email and the canonical notification title/message/type. It does not send an address, phone number, customer note, order items, receipt content, payment total, or a receipt image. The rendered email intentionally contains no action URL; customers open FreshGo to view the update.

## Required Supabase Edge Function secrets

- `RESEND_API_KEY`
- `TRANSACTIONAL_EMAIL_FROM` — `FreshGo <no-reply@freshgo.my>`
- `TRANSACTIONAL_EMAIL_DISPATCH_SECRET`

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to Supabase Edge Functions by the platform. Do not place any of these values in repository files, `.env.example`, or browser-visible `VITE_*` variables.

## Review-first rollout

1. In Resend, verify `freshgo.my` and create a restricted API key with send-email access.
2. In Supabase Dashboard for `jypujsyiecgcjtjrqjfx`, open **Edge Functions → Secrets** and save the three values above.
3. Review and apply `20261114000000_transactional_email_foundation.sql`, then `20261115000000_add_ready_for_delivery_email_notification.sql` in that order.
4. Deploy `transactional-email-dispatcher` only after review. Its invocation must be a `POST` with `x-freshgo-dispatch-secret`; no scheduler is configured by this change.
5. Make one controlled test notification and inspect `transactional_email_jobs` and `transactional_email_attempts` before enabling any recurring invocation.
