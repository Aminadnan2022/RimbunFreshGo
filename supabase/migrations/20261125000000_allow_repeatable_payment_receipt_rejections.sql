-- A customer can submit a replacement receipt after a rejection.  Each
-- submission has its own receipt_submitted_at-derived dedupe key, so allow a
-- later rejection notification while retaining the one-per-order/type guard
-- for non-repeatable notification types.
BEGIN;

DROP INDEX IF EXISTS public.notifications_user_order_type_unique;

CREATE UNIQUE INDEX notifications_user_order_type_unique
  ON public.notifications (recipient_user_id, sales_order_id, notification_type)
  WHERE recipient_user_id IS NOT NULL
    AND sales_order_id IS NOT NULL
    AND notification_type NOT IN (
      'final_amount_updated',
      'payment_receipt_rejected'
    );

COMMIT;
