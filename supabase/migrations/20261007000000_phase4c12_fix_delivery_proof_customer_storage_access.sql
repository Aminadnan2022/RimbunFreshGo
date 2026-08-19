-- Phase 4C12
-- Fix customer access to private Proof of Delivery images.
--
-- Root cause:
-- The storage.objects SELECT policy previously queried
-- canonical_sales_order_deliveries directly.
--
-- Customers do not have direct SELECT access to that table, therefore the
-- nested RLS check returned no rows even though the customer legitimately
-- owns the delivered sales order.
--
-- Solution:
-- Resolve POD object access through a SECURITY DEFINER helper.
-- The delivery-proof bucket remains private.

BEGIN;

-- ===========================================================================
-- 1. SECURITY DEFINER ACCESS HELPER
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.can_read_canonical_delivery_proof_object(
  p_storage_path text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sales_order_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF p_storage_path IS NULL
     OR p_storage_path !~
       '^[0-9a-fA-F-]{36}/(closeup|placement)/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|webp)$'
  THEN
    RETURN false;
  END IF;

  BEGIN
    v_sales_order_id :=
      split_part(p_storage_path, '/', 1)::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN false;
  END;

  -- Admin may read all POD images.
  IF public.is_admin() THEN
    RETURN true;
  END IF;

  -- Assigned rider may read POD images for their own delivery.
  IF public.is_delivery_rider()
     AND EXISTS (
       SELECT 1
       FROM public.canonical_sales_order_deliveries d
       WHERE d.sales_order_id = v_sales_order_id
         AND d.assigned_rider_id = auth.uid()
     )
  THEN
    RETURN true;
  END IF;

  -- Customer may read POD only for their own completed delivery.
  IF EXISTS (
    SELECT 1
    FROM public.canonical_sales_order_deliveries d
    JOIN public.sales_orders o
      ON o.id = d.sales_order_id
    WHERE d.sales_order_id = v_sales_order_id
      AND o.customer_id = auth.uid()
      AND d.status = 'delivered'
      AND d.delivered_at IS NOT NULL
  )
  THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL
ON FUNCTION public.can_read_canonical_delivery_proof_object(text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.can_read_canonical_delivery_proof_object(text)
TO authenticated;


-- ===========================================================================
-- 2. REPLACE PRIVATE STORAGE SELECT POLICY
-- ===========================================================================

DROP POLICY IF EXISTS phase4c11_delivery_proof_select
ON storage.objects;

DROP POLICY IF EXISTS phase4c12_delivery_proof_select
ON storage.objects;

CREATE POLICY phase4c12_delivery_proof_select
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'delivery-proof'
  AND public.can_read_canonical_delivery_proof_object(name)
);


-- ===========================================================================
-- 3. DOCUMENTATION
-- ===========================================================================

COMMENT ON FUNCTION public.can_read_canonical_delivery_proof_object(text) IS
  'Authorizes private canonical delivery proof storage reads for admin, assigned rider, or owning customer after delivery completion. Uses SECURITY DEFINER so nested canonical delivery RLS does not block legitimate customer POD access.';

COMMIT;
