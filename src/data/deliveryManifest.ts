import { supabase } from '../lib/supabase';
import type { CartItem, ComboExpandedItem } from '../types';

/**
 * Delivery Manifest data layer.
 *
 * Aggregates every order assigned to a Delivery Batch into the summary shown
 * before the rider departs: order count, customers, delivery points, product
 * totals, plus per-order Packed/Loaded checklists (stored in
 * `delivery_batch_manifest`).
 */

export interface ManifestItemLine {
  name: string;
  detail: string;
}

export interface ManifestOrder {
  id: number;
  ref: string;
  customer: string;
  pointName: string;
  paymentStatus: string;
  phone: string;
  unit: string;
  notes: string;
  items: ManifestItemLine[];
  packed: boolean;
  loaded: boolean;
  packedAt: string | null;
  loadedAt: string | null;
  delivered: boolean;
}

export interface ManifestProduct {
  name: string;
  kg: number;
  count: number;
}

export interface ManifestPoint {
  name: string;
  orderCount: number;
}

export interface DeliveryManifest {
  orders: ManifestOrder[];
  products: ManifestProduct[];
  points: ManifestPoint[];
  totalOrders: number;
  totalCustomers: number;
  totalStops: number;
  packedCount: number;
  loadedCount: number;
}

type ItemLike = CartItem;

/** True when a line item is sold by weight (its value is a kg amount). */
export function sellsByWeight(item: ItemLike): boolean {
  if (item.pricingType === 'fixed') return false;
  if (item.comboId) return false;
  if (item.orderingMode === 'weight_only') return true;
  if (item.orderingMode === 'fixed_quantity') return false;
  // whole_fish_by_weight (or legacy items without orderingMode):
  const qty = item.quantity ?? 1;
  if (qty > 1) return false; // multiple pieces -> whole-mode purchase
  const est = item.estimatedWeight;
  if (est == null) return false;
  const avg = item.averageWeight ?? 0;
  if (avg > 0) {
    const wholeEst = avg / 1000; // estimatedWeight for a single whole piece
    if (Math.abs(est - wholeEst) < 0.05) return false;
  }
  return true;
}

function fmtKg(kg: number): string {
  const rounded = Math.round(kg * 100) / 100;
  return `${String(rounded)} kg`;
}

/** kg/count contribution of a single line item (combos expanded internally). */
function itemContribution(item: ItemLike): { kg: number; count: number } {
  if (item.comboItems && item.comboItems.length > 0) {
    let kg = 0;
    let count = 0;
    const mult = item.quantity ?? 1;
    for (const ci of item.comboItems) {
      if ((ci.sellingUnit ?? '').toLowerCase() === 'kg') {
        kg += (ci.quantityValue ?? ci.quantity ?? 0) * mult;
      } else {
        count += (ci.quantity ?? Math.round(ci.quantityValue ?? 0)) * mult;
      }
    }
    return { kg, count };
  }
  if (item.comboId) {
    return { kg: 0, count: item.quantity ?? 1 };
  }
  if (sellsByWeight(item)) {
    return { kg: item.estimatedWeight ?? item.quantity ?? 0, count: 0 };
  }
  return { kg: 0, count: item.quantity ?? 1 };
}

/** Human-readable item line for the Orders section. */
export function itemDisplay(item: ItemLike): ManifestItemLine {
  if (item.comboItems && item.comboItems.length > 0) {
    const mult = item.quantity ?? 1;
    const parts = item.comboItems.map((ci: ComboExpandedItem) => {
      if ((ci.sellingUnit ?? '').toLowerCase() === 'kg') {
        const kg = (ci.quantityValue ?? ci.quantity ?? 0) * mult;
        return `${ci.name} ${fmtKg(kg)}`;
      }
      const n = (ci.quantity ?? Math.round(ci.quantityValue ?? 0)) * mult;
      return `${ci.name} x${n}`;
    });
    return { name: item.name ?? 'Combo', detail: parts.join(', ') };
  }
  if (sellsByWeight(item)) {
    return { name: item.name ?? '', detail: fmtKg(item.estimatedWeight ?? item.quantity ?? 0) };
  }
  return { name: item.name ?? '', detail: `x${item.quantity ?? 1}` };
}

/** Aggregate products across orders (kg vs count by selling mode). */
export function aggregateProducts(orders: ManifestOrder[], rawItems: ItemLike[][]): ManifestProduct[] {
  const map = new Map<string, ManifestProduct>();
  const put = (key: string, name: string, kg: number, count: number) => {
    const cur = map.get(key) ?? { name, kg: 0, count: 0 };
    cur.kg += kg;
    cur.count += count;
    map.set(key, cur);
  };

  orders.forEach((_, idx) => {
    const lines = rawItems[idx] ?? [];
    for (const item of lines) {
      const key = item.productId || item.name || `item-${idx}`;
      const c = itemContribution(item);
      put(key, item.name ?? key, c.kg, c.count);
    }
  });

  return Array.from(map.values())
    .filter((p) => p.kg > 0 || p.count > 0)
    .sort((a, b) => {
      if (a.kg !== b.kg) return b.kg - a.kg;
      return b.count - a.count;
    });
}

export interface ManifestOrderRow {
  id: number;
  full_name: string;
  order_summary: unknown;
  order_items: unknown;
  delivery_point_name: string | null;
  pickup_location: string | null;
  payment_status: string;
  phone_number: string | null;
  apartment: string | null;
  unit: string | null;
  delivery_status: string | null;
  order_notes: string | null;
}

/** Build the full manifest for a batch from raw order rows + checklist flags. */
export function buildManifest(
  rows: ManifestOrderRow[],
  flags: Record<number, { packed: boolean; loaded: boolean; packed_at: string | null; loaded_at: string | null }>,
  pointOrder: Map<string, number>
): DeliveryManifest {
  const orders: ManifestOrder[] = rows.map((r) => {
    const summary = (r.order_summary ?? {}) as { orderRef?: string };
    const items = (r.order_items as ItemLike[]) ?? [];
    const f = flags[r.id];
    return {
      id: r.id,
      ref: summary.orderRef ?? String(r.id),
      customer: r.full_name,
      pointName: r.delivery_point_name || r.pickup_location || '—',
      paymentStatus: r.payment_status,
      phone: r.phone_number ?? '',
      unit: r.apartment || r.unit || '',
      notes: r.order_notes ?? '',
      items: items.map(itemDisplay),
      packed: f?.packed ?? false,
      loaded: f?.loaded ?? false,
      packedAt: f?.packed_at ?? null,
      loadedAt: f?.loaded_at ?? null,
      delivered: r.delivery_status === 'delivered',
    };
  });

  const pointMap = new Map<string, number>();
  for (const o of orders) {
    pointMap.set(o.pointName, (pointMap.get(o.pointName) ?? 0) + 1);
  }
  const points: ManifestPoint[] = Array.from(pointMap.entries()).map(([name, orderCount]) => ({
    name,
    orderCount,
  })).sort((a, b) => {
    const oa = pointOrder.get(a.name);
    const ob = pointOrder.get(b.name);
    if (oa != null || ob != null) return (oa ?? Number.MAX_SAFE_INTEGER) - (ob ?? Number.MAX_SAFE_INTEGER);
    return a.name.localeCompare(b.name);
  });

  const rawItems = rows.map((r) => (r.order_items as ItemLike[]) ?? []);
  const products = aggregateProducts(orders, rawItems);
  const customers = new Set(orders.map((o) => o.customer.trim().toLowerCase())).size;

  return {
    orders,
    products,
    points,
    totalOrders: orders.length,
    totalCustomers: customers,
    totalStops: points.length,
    packedCount: orders.filter((o) => o.packed).length,
    loadedCount: orders.filter((o) => o.loaded).length,
  };
}

/** Load the full manifest for a batch. */
export async function fetchDeliveryManifest(batchId: string): Promise<DeliveryManifest> {
  const [ordersRes, flagsRes, pointsRes] = await Promise.all([
    supabase
      .from('Orders')
      .select('id, full_name, order_summary, order_items, delivery_point_name, pickup_location, payment_status, phone_number, apartment, unit, delivery_status, order_notes')
      .eq('delivery_batch_id', batchId)
      .order('id', { ascending: true }),
    supabase
      .from('delivery_batch_manifest')
      .select('order_id, packed, loaded, packed_at, loaded_at')
      .eq('batch_id', batchId),
    supabase.from('delivery_points').select('name, display_order, delivery_method, latitude, longitude').order('display_order', { ascending: true }),
  ]);

  if (ordersRes.error) throw ordersRes.error;
  if (flagsRes.error) throw flagsRes.error;
  if (pointsRes.error) throw pointsRes.error;

  const flags: Record<number, { packed: boolean; loaded: boolean; packed_at: string | null; loaded_at: string | null }> = {};
  (flagsRes.data ?? []).forEach((r) => {
    flags[Number(r.order_id)] = {
      packed: r.packed,
      loaded: r.loaded,
      packed_at: r.packed_at,
      loaded_at: r.loaded_at,
    };
  });

  const pointOrder = new Map<string, number>();
  (pointsRes.data ?? []).forEach((p, i) => pointOrder.set(p.name, i));

  return buildManifest((ordersRes.data ?? []) as unknown as ManifestOrderRow[], flags, pointOrder);
}

/** Typed escape hatch for RPCs not present in the generated client union. */
async function callManifestRpc(
  fn: string,
  args: Record<string, unknown>
): Promise<{ error: { message?: string; details?: string; hint?: string } | null }> {
  const res = await (supabase.rpc as unknown as (
    name: string,
    params?: Record<string, unknown>
  ) => Promise<{ error: { message?: string; details?: string; hint?: string } | null }>)(fn, args);
  return res;
}

/** Toggle Packed for one order in a batch (supplier or admin). */
export async function manifestSetPacked(batchId: string, orderId: number, packed: boolean): Promise<void> {
  const { error } = await callManifestRpc('manifest_set_packed', {
    p_batch_id: batchId,
    p_order_id: orderId,
    p_packed: packed,
  });
  if (error) throw error;
}

/** Toggle Loaded for one order in a batch (admin only). */
export async function manifestSetLoaded(batchId: string, orderId: number, loaded: boolean): Promise<void> {
  const { error } = await callManifestRpc('manifest_set_loaded', {
    p_batch_id: batchId,
    p_order_id: orderId,
    p_loaded: loaded,
  });
  if (error) throw error;
}
