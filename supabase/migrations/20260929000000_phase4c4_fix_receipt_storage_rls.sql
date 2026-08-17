-- Phase 4C.4
-- Fix canonical payment receipt storage RLS.
--
-- Migration 160 used an ambiguous escaped dot in the storage object-name
-- regular expression. Replace it additively with [.] and avoid UUID casts
-- inside the policy.

BEGIN;

DROP POLICY IF EXISTS phase4a_receipt_storage_insert
ON storage.objects;

DROP POLICY IF EXISTS phase4a_receipt_storage_select
ON storage.objects;

CREATE POLICY phase4c4_receipt_storage_insert
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'sales-order-payment-receipts'
  AND (
    public.is_admin()
    OR (
      name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp|pdf)$'
      AND EXISTS (
        SELECT 1
        FROM public.sales_orders o
        WHERE o.id::text = split_part(name, '/', 1)
          AND o.customer_id = auth.uid()
          AND o.status <> 'cancelled'
      )
    )
  )
);

CREATE POLICY phase4c4_receipt_storage_select
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'sales-order-payment-receipts'
  AND (
    public.is_admin()
    OR (
      name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp|pdf)$'
      AND EXISTS (
        SELECT 1
        FROM public.sales_orders o
        WHERE o.id::text = split_part(name, '/', 1)
          AND o.customer_id = auth.uid()
      )
    )
  )
);

COMMIT;
