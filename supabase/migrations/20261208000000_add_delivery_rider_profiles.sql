-- Operational contact details for delivery riders. These details must never be
-- read directly by customers; customer-facing functions below project only the
-- assigned rider for an order the caller is authorised to view.
CREATE TABLE public.delivery_rider_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  phone text,
  whatsapp text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_rider_profiles_display_name_not_blank
    CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT delivery_rider_profiles_contact_not_blank
    CHECK (
      NULLIF(btrim(COALESCE(phone, '')), '') IS NOT NULL
      OR NULLIF(btrim(COALESCE(whatsapp, '')), '') IS NOT NULL
    )
);

ALTER TABLE public.delivery_rider_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.delivery_rider_profiles FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_delivery_rider_profile(
  p_user_id uuid,
  p_display_name text,
  p_phone text DEFAULT NULL,
  p_whatsapp text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_display_name text := NULLIF(btrim(p_display_name), '');
  v_phone text := NULLIF(btrim(p_phone), '');
  v_whatsapp text := NULLIF(btrim(p_whatsapp), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;
  IF v_display_name IS NULL THEN
    RAISE EXCEPTION 'Rider display name is required.' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL AND v_whatsapp IS NULL THEN
    RAISE EXCEPTION 'Provide a phone or WhatsApp contact.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE id = p_user_id AND role = 'delivery_rider'
  ) THEN
    RAISE EXCEPTION 'Rider profile can only be saved for a delivery rider.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.delivery_rider_profiles (user_id, display_name, phone, whatsapp)
  VALUES (p_user_id, v_display_name, v_phone, v_whatsapp)
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        phone = EXCLUDED.phone,
        whatsapp = EXCLUDED.whatsapp,
        updated_at = now();
END;
$$;

DROP FUNCTION IF EXISTS public.get_sales_order_canonical_rider_tracking(uuid);

CREATE FUNCTION public.get_sales_order_canonical_rider_tracking(p_sales_order_id uuid)
RETURNS TABLE (
  ready_for_rider_at timestamptz,
  delivery_started_at timestamptz,
  delivered_at timestamptz,
  delivery_status text,
  rider_name text,
  rider_phone text,
  rider_whatsapp text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_orders o
    WHERE o.id = p_sales_order_id
      AND (public.is_admin() OR (public.is_permanent_authenticated_user() AND o.customer_id = auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Order access denied.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT d.ready_for_rider_at, d.delivery_started_at, d.delivered_at, d.status,
    rp.display_name, rp.phone, rp.whatsapp
  FROM public.canonical_sales_order_deliveries d
  LEFT JOIN public.delivery_rider_profiles rp ON rp.user_id = d.assigned_rider_id
  WHERE d.sales_order_id = p_sales_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_sales_order_canonical_rider_tracking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sales_order_canonical_rider_tracking(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_guest_sales_order(
  p_order_number text,
  p_access_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_result jsonb;
BEGIN
  v_order_id := public.authorize_guest_sales_order(p_order_number, p_access_token);
  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Order access could not be verified.');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'order', jsonb_build_object(
      'id', o.id, 'orderNumber', o.order_number, 'createdAt', o.created_at,
      'status', o.status, 'priceStatus', o.price_status, 'paymentStatus', o.payment_status,
      'estimatedTotal', o.estimated_total, 'finalSubtotal', o.final_subtotal,
      'finalTotal', o.final_total, 'deliveryFee', o.delivery_fee,
      'receiptSubmittedAt', o.receipt_submitted_at,
      'customer', jsonb_build_object('name', o.customer_snapshot ->> 'name', 'phone', o.customer_snapshot ->> 'phone', 'email', NULLIF(o.customer_snapshot ->> 'email', '')),
      'delivery', o.delivery_snapshot,
      'payment', CASE WHEN o.price_status = 'final' THEN jsonb_build_object(
        'qrStoragePath', o.payment_configuration_snapshot ->> 'qr_storage_path',
        'instructions', o.payment_configuration_snapshot ->> 'instructions',
        'rejectionReason', (SELECT r.rejection_reason FROM public.sales_order_payment_receipts r WHERE r.sales_order_id = o.id AND r.verification_status = 'rejected' ORDER BY r.created_at DESC LIMIT 1)
      ) ELSE NULL END,
      'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'lineNumber', l.line_number, 'name', COALESCE(l.product_snapshot ->> 'name', l.product_snapshot ->> 'label', 'Item'),
        'quantity', l.quantity, 'sellingUnit', l.selling_unit, 'orderingMode', l.ordering_mode,
        'unitSellingPrice', l.unit_selling_price, 'estimatedLineTotal', l.estimated_line_total, 'finalLineTotal', l.final_line_total
      ) ORDER BY l.line_number) FROM public.sales_order_lines l WHERE l.sales_order_id = o.id), '[]'::jsonb),
      'tracking', jsonb_build_object(
        'packingStartedAt', (SELECT min(f.packing_started_at) FROM public.sales_order_supplier_fulfilments f WHERE f.sales_order_id = o.id),
        'packingCompletedAt', (SELECT CASE WHEN count(*) > 0 AND count(*) FILTER (WHERE f.status = 'packed') = count(*) THEN max(f.packing_completed_at) END FROM public.sales_order_supplier_fulfilments f WHERE f.sales_order_id = o.id),
        'supplierDispatchStartedAt', (SELECT min(b.dispatched_at) FROM public.canonical_supplier_delivery_batch_orders bo JOIN public.canonical_supplier_delivery_batches b ON b.id = bo.batch_id WHERE bo.sales_order_id = o.id AND b.status IN ('dispatched', 'arrived_hub')),
        'supplierDispatchCompletedAt', (SELECT CASE WHEN count(*) > 0 AND count(*) FILTER (WHERE b.status = 'arrived_hub') = count(*) THEN max(b.arrived_hub_at) END FROM public.canonical_supplier_delivery_batch_orders bo JOIN public.canonical_supplier_delivery_batches b ON b.id = bo.batch_id WHERE bo.sales_order_id = o.id AND b.status <> 'cancelled'),
        'trackingUrl', (SELECT b.tracking_url FROM public.canonical_supplier_delivery_batch_orders bo JOIN public.canonical_supplier_delivery_batches b ON b.id = bo.batch_id WHERE bo.sales_order_id = o.id AND b.status = 'dispatched' AND b.tracking_url IS NOT NULL ORDER BY b.dispatched_at DESC LIMIT 1),
        'readyForRiderAt', d.ready_for_rider_at,
        'deliveryStartedAt', d.delivery_started_at,
        'deliveredAt', d.delivered_at,
        'deliveryStatus', d.status,
        'riderName', rp.display_name,
        'riderPhone', rp.phone,
        'riderWhatsapp', rp.whatsapp
      ),
      'deliveryProofs', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', p.proof_type, 'storagePath', p.storage_path, 'uploadedAt', p.uploaded_at))
        FROM public.canonical_sales_order_deliveries d2 JOIN public.canonical_delivery_proofs p ON p.delivery_id = d2.id
        WHERE d2.sales_order_id = o.id AND d2.status = 'delivered' AND d2.delivered_at IS NOT NULL), '[]'::jsonb)
    )
  ) INTO v_result
  FROM public.sales_orders o
  LEFT JOIN public.canonical_sales_order_deliveries d ON d.sales_order_id = o.id
  LEFT JOIN public.delivery_rider_profiles rp ON rp.user_id = d.assigned_rider_id
  WHERE o.id = v_order_id;
  RETURN v_result;
END;
$$;

-- Keep the legacy tracking-name fallback off auth metadata as well. It has no
-- contact details because old delivery batches are not tied to one order.
CREATE OR REPLACE FUNCTION public.tracking_rider_name(p_delivery_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rider_name text;
BEGIN
  IF NOT (
    (
      public.is_permanent_authenticated_user()
      AND EXISTS (
        SELECT 1
        FROM public."Orders" o
        JOIN public.delivery_batches db ON db.id = o.delivery_batch_id
        WHERE o.user_id = auth.uid() AND db.delivery_date = p_delivery_date
      )
    )
    OR public.is_admin()
    OR public.is_delivery_rider()
  ) THEN
    RETURN NULL;
  END IF;

  SELECT rp.display_name INTO rider_name
  FROM public.delivery_assignments da
  JOIN public.delivery_rider_profiles rp ON rp.user_id = da.rider_id
  WHERE da.delivery_date = p_delivery_date
  ORDER BY da.id
  LIMIT 1;
  RETURN rider_name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_delivery_rider_profile(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_delivery_rider_profile(uuid, text, text, text) TO authenticated;

COMMENT ON TABLE public.delivery_rider_profiles IS
  'Admin-managed operational rider contacts. Customer access is only via authorised order-tracking projections.';
