/*
# Supplier Weight Entry Support

## Summary
Adds the columns and RLS policies required for the Supplier Weight Entry workflow.
Suppliers can read all orders (to see their queue) and update orders (to save
actual weights and change status to awaiting-payment).

## Changes to existing table: Orders
### New columns
- `supplier_weights` (jsonb, default '{}') — map of item-array-index → actual weight in grams
- `updated_at`       (timestamptz, nullable)  — timestamp of the last supplier update
- `updated_by`       (uuid, nullable, FK auth.users) — which supplier saved the weights

## New RLS Policies on Orders
- `supplier_select_orders` — suppliers can SELECT all order rows
- `supplier_update_orders` — suppliers can UPDATE any order row

## Notes
1. is_supplier() already exists from the 20260717_add_supplier_role migration.
2. Columns are nullable / have defaults so existing rows are unaffected.
3. The supplier SELECT policy intentionally covers all orders (not just "confirmed")
   to allow for future status-based workflows without another migration.
4. Supplier UPDATE is intentionally broad for the same reason; business logic
   (e.g. only updating confirmed orders) is enforced in the application layer.
*/

-- 1. New columns on Orders
ALTER TABLE "Orders"
  ADD COLUMN IF NOT EXISTS supplier_weights jsonb        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by       uuid         REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Supplier SELECT policy
DROP POLICY IF EXISTS "supplier_select_orders" ON "Orders";
CREATE POLICY "supplier_select_orders" ON "Orders" FOR SELECT
  TO authenticated
  USING (public.is_supplier());

-- 3. Supplier UPDATE policy
DROP POLICY IF EXISTS "supplier_update_orders" ON "Orders";
CREATE POLICY "supplier_update_orders" ON "Orders" FOR UPDATE
  TO authenticated
  USING (public.is_supplier())
  WITH CHECK (public.is_supplier());
