import { supabase } from '../lib/supabase';

/**
 * Customer Live Tracking data layer.
 *
 * Derives the customer-facing delivery timeline purely from the `"Orders"`
 * table — the order owns every operational timestamp:
 *   - payment_status / paid_at
 *   - packing_started_at / packing_completed_at
 *   - supplier_dispatch_started_at / supplier_dispatch_completed_at
 *   - ready_for_rider_at
 *   - delivery_status / delivered_at
 *   - lalamove_tracking_url
 *
 * `delivery_batches` is optional reporting/logistics only and never drives the
 * customer timeline. The only remaining external lookup is the assigned rider's
 * name (via `tracking_rider_name`), keyed on the order's own delivery date.
 */

export interface CustomerStageInput {
  /** Order payment state ('Pending' | 'Ready To Pay' | 'Paid'). */
  paymentStatus?: 'Pending' | 'Ready To Pay' | 'Paid';
  packingStartedAt?: string | null;
  packingCompletedAt?: string | null;
  supplierDispatchStartedAt?: string | null;
  supplierDispatchCompletedAt?: string | null;
  readyForRiderAt?: string | null;
  /** Per-order rider progress. Legacy 'arrived' remains supported during cutover. */
  deliveryStatus?:
    | 'pending'
    | 'arrived'
    | 'ready_for_rider'
    | 'out_for_delivery'
    | 'delivered';
  deliveredAt?: string | null;
}

/**
 * Customer timeline stages, in order. This is the real FreshGo lifecycle:
 *
 *   Order Received -> Awaiting Payment -> Payment Confirmed -> Preparing
 *   -> Supplier Dispatch -> Arrived At Hub -> Ready For Rider
 *   -> Out For Delivery -> Delivered
 */
export const TRACKING_STAGES = [
  'orderReceived',
  'awaitingPayment',
  'paymentConfirmed',
  'preparing',
  'supplierDispatch',
  'arrivedHub',
  'readyForRider',
  'outForDelivery',
  'delivered',
] as const;
export type TrackingStage = (typeof TRACKING_STAGES)[number];

/**
 * Index (0-8) of the customer's current stage. Always read live, never stored.
 * Purely order-owned — no delivery_batches dependency.
 *
 *   delivered_at set / delivery_status 'delivered'   -> Delivered (8)
 *   delivery_status 'arrived' / 'out_for_delivery'   -> Out For Delivery (7)
 *   ready_for_rider_at set                           -> Ready For Rider (6)
 *   supplier_dispatch_completed_at set               -> Arrived At Hub (5)
 *   supplier_dispatch_started_at set                 -> Supplier Dispatch (4)
 *   packing_started_at set                           -> Preparing (3)
 *   payment_status 'Paid'                            -> Payment Confirmed (2)
 *   otherwise (Pending / Ready To Pay)               -> Awaiting Payment (1)
 *   Order Received (0) is always complete and never "current".
 */
export function customerStageIndex(input: CustomerStageInput): number {
  const {
    paymentStatus,
    packingStartedAt,
    supplierDispatchStartedAt,
    supplierDispatchCompletedAt,
    readyForRiderAt,
    deliveryStatus,
    deliveredAt,
  } = input;

  if (deliveredAt != null || deliveryStatus === 'delivered') return 8;
  if (deliveryStatus === 'arrived' || deliveryStatus === 'out_for_delivery') return 7;
  if (readyForRiderAt != null) return 6;
  if (supplierDispatchCompletedAt != null) return 5;
  if (supplierDispatchStartedAt != null) return 4;
  if (packingStartedAt != null) return 3;
  if (paymentStatus === 'Paid') return 2;
  return 1;
}

/** Resolve the assigned rider's name for a delivery date (caller must own an order that day). */
export async function fetchRiderNameForDate(deliveryDate: string): Promise<string | null> {
  const res = await (supabase.rpc as unknown as (
    name: string,
    params?: Record<string, unknown>
  ) => Promise<{ data: string | null; error: { message?: string } | null }>)('tracking_rider_name', {
    p_delivery_date: deliveryDate,
  });
  if (res.error) throw res.error;
  return res.data || null;
}

// ---------------------------------------------------------------------------
// Canonical customer proof of delivery
// ---------------------------------------------------------------------------

export type CustomerDeliveryProofType = 'closeup' | 'placement';

export interface CustomerDeliveryProof {
  proofType: CustomerDeliveryProofType;
  storagePath: string;
  uploadedAt: string;
  signedUrl: string | null;
}

interface CustomerDeliveryProofRpcRow {
  proof_type: string;
  storage_path: string;
  uploaded_at: string;
}

/**
 * Fetch proof-of-delivery photos for a canonical sales order.
 *
 * Backend authorization permits:
 *   - admin
 *   - assigned rider
 *   - owning customer only after Delivered
 *
 * delivery-proof is a private bucket, therefore short-lived
 * signed URLs are generated after the metadata RPC succeeds.
 */
export async function fetchCustomerCanonicalDeliveryProofs(
  salesOrderId: string,
): Promise<CustomerDeliveryProof[]> {
  const res = await (supabase.rpc as unknown as (
    name: string,
    params?: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: {
      message?: string;
      details?: string;
      hint?: string;
    } | null;
  }>)(
    'get_sales_order_canonical_delivery_proofs',
    {
      p_sales_order_id: salesOrderId,
    },
  );

  if (res.error) throw res.error;

  if (!Array.isArray(res.data)) {
    return [];
  }

  const rows = res.data as CustomerDeliveryProofRpcRow[];

  return Promise.all(
    rows.map(async (row) => {
      const { data: signed, error: signedError } =
        await supabase.storage
          .from('delivery-proof')
          .createSignedUrl(row.storage_path, 3600);

      if (signedError) throw signedError;

      return {
        proofType: row.proof_type as CustomerDeliveryProofType,
        storagePath: row.storage_path,
        uploadedAt: row.uploaded_at,
        signedUrl: signed?.signedUrl ?? null,
      };
    }),
  );
}

