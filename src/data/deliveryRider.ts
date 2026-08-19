import { supabase } from '../lib/supabase';

/**
 * Canonical Rider data layer.
 *
 * Canonical source of truth:
 *   canonical_sales_order_deliveries
 *
 * Rider reads and lifecycle mutations are exposed only through
 * SECURITY DEFINER RPCs.
 */

export interface RiderOrder {
  id: string;
  ref: string;
  customer: string;
  phone: string;
  apartment: string;
  houseUnit: string;
  pickupLocation: string;
  pointName: string;
  items: { name: string; detail: string }[];
  productCount: number;
  notes: string;
  paymentStatus: string;
  readyForRiderAt: string | null;
  deliveryStartedAt: string | null;
  deliveryStatus: string;
  deliveredAt: string | null;
  deliveryDate: string;
}

interface CanonicalRiderOrderRow {
  sales_order_id: string;
  order_number: string;
  delivery_date: string;
  delivery_status: string;
  ready_for_rider_at: string | null;
  delivery_started_at: string | null;
  delivered_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  apartment: string | null;
  house_unit: string | null;
  pickup_location: string | null;
  delivery_point_name: string | null;
  customer_notes: string | null;
  payment_status: string;
  items: unknown;
}

async function rpc(
  name: string,
  params?: Record<string, unknown>,
): Promise<{
  data: unknown;
  error: {
    message?: string;
    details?: string;
    hint?: string;
  } | null;
}> {
  return (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: {
      message?: string;
      details?: string;
      hint?: string;
    } | null;
  }>)(name, params);
}

function toRiderOrder(row: CanonicalRiderOrderRow): RiderOrder {
  const rawItems = Array.isArray(row.items)
    ? row.items
    : [];

  const items = rawItems.map((raw) => {
    const item =
      raw && typeof raw === 'object'
        ? raw as Record<string, unknown>
        : {};

    const name =
      typeof item.name === 'string'
        ? item.name
        : 'Order item';

    const quantity =
      typeof item.quantity === 'number' ||
      typeof item.quantity === 'string'
        ? String(item.quantity)
        : '1';

    const sellingUnit =
      typeof item.selling_unit === 'string'
        ? item.selling_unit
        : '';

    return {
      name,
      detail: sellingUnit
        ? `${quantity} ${sellingUnit}`
        : `x${quantity}`,
    };
  });

  return {
    id: row.sales_order_id,
    ref: row.order_number,
    customer: row.customer_name ?? '',
    phone: row.customer_phone ?? '',
    apartment: row.apartment ?? '',
    houseUnit: row.house_unit ?? '',
    pickupLocation: row.pickup_location ?? '',
    pointName:
      row.delivery_point_name ??
      row.pickup_location ??
      row.apartment ??
      '',
    items,
    productCount: items.length,
    notes: row.customer_notes ?? '',
    paymentStatus: row.payment_status ?? 'pending',
    readyForRiderAt: row.ready_for_rider_at ?? null,
    deliveryStartedAt: row.delivery_started_at ?? null,
    deliveryStatus: row.delivery_status ?? 'ready_for_rider',
    deliveredAt: row.delivered_at ?? null,
    deliveryDate: row.delivery_date,
  };
}

/**
 * Canonical deliveries assigned to the currently logged-in rider.
 * Delivered orders are excluded by the RPC.
 */
export async function fetchTodaysDeliveries(): Promise<RiderOrder[]> {
  const { data, error } = await rpc('get_my_canonical_rider_orders');

  if (error) throw error;

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) =>
    toRiderOrder(row as CanonicalRiderOrderRow),
  );
}

/**
 * Start canonical hub → customer delivery.
 */
export async function startOrderDelivery(
  salesOrderId: string,
): Promise<void> {
  const { error } = await rpc(
    'rider_start_canonical_sales_order_delivery',
    {
      p_sales_order_id: salesOrderId,
    },
  );

  if (error) throw error;
}

/**
 * Complete canonical hub → customer delivery.
 */
export async function markOrderDelivered(
  salesOrderId: string,
): Promise<void> {
  const { error } = await rpc(
    'rider_complete_canonical_sales_order_delivery',
    {
      p_sales_order_id: salesOrderId,
    },
  );

  if (error) throw error;
}


// ---------------------------------------------------------------------------
// Canonical proof of delivery
// ---------------------------------------------------------------------------

export type DeliveryProofType = 'closeup' | 'placement';

export interface DeliveryProof {
  proofType: DeliveryProofType;
  storagePath: string;
  uploadedAt: string;
  signedUrl: string | null;
}

interface DeliveryProofRpcRow {
  proof_type: string;
  storage_path: string;
  uploaded_at: string;
}

function getDeliveryProofExtension(file: File): string {
  switch (file.type) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      throw new Error(
        'Unsupported image format. Please use JPG, PNG or WEBP.',
      );
  }
}

/**
 * Read registered proof-of-delivery images for one canonical sales order.
 *
 * The storage bucket is private, so short-lived signed URLs are generated
 * only after the metadata RPC confirms that the current user may access it.
 */
export async function fetchCanonicalDeliveryProofs(
  salesOrderId: string,
): Promise<DeliveryProof[]> {
  const { data, error } = await rpc(
    'get_sales_order_canonical_delivery_proofs',
    {
      p_sales_order_id: salesOrderId,
    },
  );

  if (error) throw error;

  if (!Array.isArray(data)) {
    return [];
  }

  const rows = data as DeliveryProofRpcRow[];

  return Promise.all(
    rows.map(async (row) => {
      const { data: signed, error: signedError } =
        await supabase.storage
          .from('delivery-proof')
          .createSignedUrl(row.storage_path, 3600);

      if (signedError) throw signedError;

      return {
        proofType: row.proof_type as DeliveryProofType,
        storagePath: row.storage_path,
        uploadedAt: row.uploaded_at,
        signedUrl: signed?.signedUrl ?? null,
      };
    }),
  );
}

/**
 * Upload and register one proof-of-delivery image.
 *
 * Required object format:
 *   <sales_order_uuid>/<proof_type>/<file_uuid>.<ext>
 */
export async function uploadCanonicalDeliveryProof(
  salesOrderId: string,
  proofType: DeliveryProofType,
  file: File,
): Promise<DeliveryProof> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file.');
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Delivery proof photo must be 10 MB or smaller.');
  }

  const extension = getDeliveryProofExtension(file);
  const fileId = crypto.randomUUID();

  const storagePath =
    `${salesOrderId}/${proofType}/${fileId}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('delivery-proof')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { error: registerError } = await rpc(
    'rider_register_canonical_delivery_proof',
    {
      p_sales_order_id: salesOrderId,
      p_proof_type: proofType,
      p_storage_path: storagePath,
    },
  );

  if (registerError) throw registerError;

  const { data: signed, error: signedError } =
    await supabase.storage
      .from('delivery-proof')
      .createSignedUrl(storagePath, 3600);

  if (signedError) throw signedError;

  return {
    proofType,
    storagePath,
    uploadedAt: new Date().toISOString(),
    signedUrl: signed?.signedUrl ?? null,
  };
}
