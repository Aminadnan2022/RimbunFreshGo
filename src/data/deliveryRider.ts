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
