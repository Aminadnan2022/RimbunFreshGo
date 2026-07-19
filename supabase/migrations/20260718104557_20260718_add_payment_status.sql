/*
# Add Payment Status to Orders

## Summary
Adds three columns to the Orders table to support the manual payment workflow:
- payment_status: the independent payment state (Pending → Ready To Pay → Paid)
- paid_at: timestamp set when admin confirms payment
- paid_by: which admin confirmed payment

## Notes
- payment_status is completely independent from order_summary.status (Order Status).
- Default 'Pending' means every new order automatically starts in the correct state.
- No new RLS policies are needed: customers have no UPDATE policy, suppliers use
  supplier_update_orders, admins use admin_update_orders.
*/

ALTER TABLE "Orders"
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS paid_at        timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL;
