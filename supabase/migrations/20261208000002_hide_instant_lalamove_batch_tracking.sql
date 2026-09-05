-- Keep supplier-to-hub batch and FreshGo rider details out of instant
-- customer Lalamove tracking while preserving the guest projection shape.
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
        'supplierDispatchStartedAt', CASE WHEN o.delivery_snapshot ->> 'method_code' = 'instant_customer_lalamove' THEN NULL ELSE (SELECT min(b.dispatched_at) FROM public.canonical_supplier_delivery_batch_orders bo JOIN public.canonical_supplier_delivery_batches b ON b.id = bo.batch_id WHERE bo.sales_order_id = o.id AND b.status IN ('dispatched', 'arrived_hub')) END,
        'supplierDispatchCompletedAt', CASE WHEN o.delivery_snapshot ->> 'method_code' = 'instant_customer_lalamove' THEN NULL ELSE (SELECT CASE WHEN count(*) > 0 AND count(*) FILTER (WHERE b.status = 'arrived_hub') = count(*) THEN max(b.arrived_hub_at) END FROM public.canonical_supplier_delivery_batch_orders bo JOIN public.canonical_supplier_delivery_batches b ON b.id = bo.batch_id WHERE bo.sales_order_id = o.id AND b.status <> 'cancelled') END,
        'trackingUrl', CASE WHEN o.delivery_snapshot ->> 'method_code' = 'instant_customer_lalamove' THEN NULL ELSE (SELECT b.tracking_url FROM public.canonical_supplier_delivery_batch_orders bo JOIN public.canonical_supplier_delivery_batches b ON b.id = bo.batch_id WHERE bo.sales_order_id = o.id AND b.status = 'dispatched' AND b.tracking_url IS NOT NULL ORDER BY b.dispatched_at DESC LIMIT 1) END,
        'readyForRiderAt', CASE WHEN o.delivery_snapshot ->> 'method_code' = 'instant_customer_lalamove' THEN NULL ELSE d.ready_for_rider_at END,
        'deliveryStartedAt', CASE WHEN o.delivery_snapshot ->> 'method_code' = 'instant_customer_lalamove' THEN NULL ELSE d.delivery_started_at END,
        'deliveredAt', CASE WHEN o.delivery_snapshot ->> 'method_code' = 'instant_customer_lalamove' THEN NULL ELSE d.delivered_at END,
        'deliveryStatus', CASE WHEN o.delivery_snapshot ->> 'method_code' = 'instant_customer_lalamove' THEN NULL ELSE d.status END,
        'riderName', CASE WHEN o.delivery_snapshot ->> 'method_code' = 'instant_customer_lalamove' THEN NULL ELSE rp.display_name END,
        'riderPhone', CASE WHEN o.delivery_snapshot ->> 'method_code' = 'instant_customer_lalamove' THEN NULL ELSE rp.phone END,
        'riderWhatsapp', CASE WHEN o.delivery_snapshot ->> 'method_code' = 'instant_customer_lalamove' THEN NULL ELSE rp.whatsapp END
      ),
      'deliveryProofs', CASE WHEN o.delivery_snapshot ->> 'method_code' = 'instant_customer_lalamove' THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('type', p.proof_type, 'storagePath', p.storage_path, 'uploadedAt', p.uploaded_at))
        FROM public.canonical_sales_order_deliveries d2 JOIN public.canonical_delivery_proofs p ON p.delivery_id = d2.id
        WHERE d2.sales_order_id = o.id AND d2.status = 'delivered' AND d2.delivered_at IS NOT NULL), '[]'::jsonb) END
    )
  ) INTO v_result
  FROM public.sales_orders o
  LEFT JOIN public.canonical_sales_order_deliveries d ON d.sales_order_id = o.id
  LEFT JOIN public.delivery_rider_profiles rp ON rp.user_id = d.assigned_rider_id
  WHERE o.id = v_order_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_guest_sales_order(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_guest_sales_order(text,text) TO authenticated;

COMMENT ON FUNCTION public.get_guest_sales_order(text,text) IS
  'Returns one guest order after token/session authorization, excluding FreshGo batch and rider data for instant customer Lalamove delivery.';
