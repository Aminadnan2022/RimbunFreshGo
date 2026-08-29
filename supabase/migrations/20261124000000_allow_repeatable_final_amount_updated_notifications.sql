-- A final-amount correction is a repeatable customer event.  Every successful
-- correction already carries its own explicit, globally unique dedupe_key;
-- retain the older one-per-order/type guard for all other notification types.
BEGIN;

DROP INDEX IF EXISTS public.notifications_user_order_type_unique;

CREATE UNIQUE INDEX notifications_user_order_type_unique
  ON public.notifications (recipient_user_id, sales_order_id, notification_type)
  WHERE recipient_user_id IS NOT NULL
    AND sales_order_id IS NOT NULL
    AND notification_type <> 'final_amount_updated';

COMMIT;
