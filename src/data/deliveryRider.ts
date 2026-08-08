import { supabase } from '../lib/supabase';

/**
 * Order-Based Rider data layer.
 *
 * The `"Orders"` table is the single source of truth. All rider mutations run
 * through SECURITY DEFINER RPCs (riders have no UPDATE policy on Orders).
 *
 *   - Incoming Shipments : supplier_dispatch_started_at set, completed null.
 *   - Receive at hub     : sets supplier_dispatch_completed_at + ready_for_rider_at.
 *   - Today's Deliveries : ready_for_rider_at set, not yet delivered.
 *   - Start Delivery     : delivery_status = 'out_for_delivery'.
 *   - Delivered          : delivery_status = 'delivered' (existing RPC).
 */

export interface RiderOrder {
  id: number;
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
  /** supplier_dispatch_started_at */
  dispatchStartedAt: string | null;
  /** supplier_dispatch_completed_at */
  dispatchCompletedAt: string | null;
  /** ready_for_rider_at */
  readyForRiderAt: string | null;
  /** delivery_status */
  deliveryStatus: string;
  deliveredAt: string | null;
  lalamoveTrackingUrl: string | null;
  bookingReference: string | null;
}

interface RiderOrderRow {
  id: number;
  full_name: string;
  phone_number: string | null;
  apartment: string | null;
  house_unit: string | null;
  pickup_location: string | null;
  delivery_point_name: string | null;
  order_notes: string | null;
  order_items: unknown;
  order_summary: unknown;
  payment_status: string;
  supplier_dispatch_started_at: string | null;
  supplier_dispatch_completed_at: string | null;
  ready_for_rider_at: string | null;
  delivery_status: string | null;
  delivered_at: string | null;
  lalamove_tracking_url: string | null;
  booking_reference: string | null;
}

const toRiderOrder = (row: RiderOrderRow): RiderOrder => {
  const summary = (row.order_summary ?? {}) as { orderRef?: string };
  const items = (row.order_items ?? []) as { name?: string; preparation?: string; quantity?: number; comboItems?: { name?: string }[] }[];
  const expanded: { name: string; detail: string }[] = [];
  items.forEach((it) => {
    const qty = it.quantity ?? 1;
    if (it.comboItems && it.comboItems.length > 0) {
      it.comboItems.forEach((ci) => expanded.push({ name: ci.name ?? 'Item', detail: `x${qty}` }));
    } else {
      expanded.push({ name: it.name ?? 'Item', detail: it.preparation ? `${it.preparation} · x${qty}` : `x${qty}` });
    }
  });
  return {
    id: row.id,
    ref: summary.orderRef ?? String(row.id),
    customer: row.full_name,
    phone: row.phone_number ?? '',
    apartment: row.apartment ?? '',
    houseUnit: row.house_unit ?? '',
    pickupLocation: row.pickup_location ?? '',
    pointName: row.delivery_point_name ?? row.pickup_location ?? '',
    items: expanded,
    productCount: expanded.length,
    notes: row.order_notes ?? '',
    paymentStatus: row.payment_status ?? 'Pending',
    dispatchStartedAt: row.supplier_dispatch_started_at ?? null,
    dispatchCompletedAt: row.supplier_dispatch_completed_at ?? null,
    readyForRiderAt: row.ready_for_rider_at ?? null,
    deliveryStatus: row.delivery_status ?? 'pending',
    deliveredAt: row.delivered_at ?? null,
    lalamoveTrackingUrl: row.lalamove_tracking_url ?? null,
    bookingReference: row.booking_reference ?? null,
  };
};

const RIDER_ORDER_SELECT =
  'id, full_name, phone_number, apartment, house_unit, pickup_location, delivery_point_name, order_notes, order_items, order_summary, payment_status, supplier_dispatch_started_at, supplier_dispatch_completed_at, ready_for_rider_at, delivery_status, delivered_at, lalamove_tracking_url, booking_reference';

/**
 * Incoming Shipments — orders the supplier dispatched to Lalamove that have not
 * yet been received at the FreshGo hub.
 */
export async function fetchIncomingShipments(): Promise<RiderOrder[]> {
  const { data, error } = await supabase
    .from("Orders")
    .select(RIDER_ORDER_SELECT)
    .not("supplier_dispatch_started_at", "is", null)
    .is("supplier_dispatch_completed_at", null)
    .order("supplier_dispatch_started_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => toRiderOrder(row as RiderOrderRow));
}

/**
 * Today's Deliveries — orders received at the hub and ready for the rider, not
 * yet delivered. Includes out-for-delivery orders in progress.
 */
export async function fetchTodaysDeliveries(): Promise<RiderOrder[]> {
  const { data, error } = await supabase
    .from('Orders')
    .select(RIDER_ORDER_SELECT)
    .not('ready_for_rider_at', 'is', null)
    .neq('delivery_status', 'delivered')
    .order('ready_for_rider_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => toRiderOrder(r as RiderOrderRow));
}

/** Typed escape hatch for RPCs not present in the generated client union. */
async function callRpc(fn: string, args: Record<string, unknown>): Promise<void> {
  const res = await (supabase.rpc as unknown as (
    name: string,
    params?: Record<string, unknown>
  ) => Promise<{ error: { message?: string; details?: string; hint?: string } | null }>)(fn, args);
  if (res.error) throw res.error;
}

/** Rider confirms an incoming shipment arrived at the FreshGo hub. */
export async function receiveOrderAtHub(orderId: number): Promise<void> {
  await callRpc('rider_receive_order_at_hub', { p_order_id: orderId });
}

/** Rider starts delivering an order (sets delivery_status = 'out_for_delivery'). */
export async function startOrderDelivery(orderId: number): Promise<void> {
  await callRpc('rider_start_order_delivery', { p_order_id: orderId });
}

/** Rider marks an order delivered. */
export async function markOrderDelivered(orderId: number): Promise<void> {
  await callRpc('rider_update_delivery_status', { p_order_id: orderId, p_status: 'delivered' });
}
