import { supabase } from '../lib/supabase';

export type DeliveryStatus = 'pending' | 'arrived' | 'delivered';

export type DeliveryMethod =
  | 'Lobby Collection'
  | 'Security Collection'
  | 'Customer Come Down'
  | 'Doorstep Delivery';

export interface DeliveryPoint {
  id: number;
  name: string;
  area: string | null;
  delivery_fee: number;
  delivery_method: DeliveryMethod;
  display_order: number;
  active: boolean;
  pickup_notes: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface DeliveryOrder {
  dbId: number;
  orderRef: string;
  customerName: string;
  customerPhone: string;
  apartment: string;
  houseUnit: string;
  /** Snapshot of the chosen delivery point (falls back to pickup_location). */
  pointName: string;
  /** Snapshot of the handover instruction at order time. */
  method: string;
  notes: string;
  paymentStatus: string;
  deliveryStatus: DeliveryStatus;
  deliveryFee: number;
  total: number;
}

export interface DeliveryAssignment {
  id: number;
  delivery_date: string;
  rider_id: string;
  created_at: string;
}

export interface RiderInfo {
  id: string;
  email: string;
}

export interface DeliveryRun {
  date: string;
  assigned: boolean;
  orders: DeliveryOrder[];
}

/** Local YYYY-MM-DD without timezone shifts. */
export function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Display "Wed, 5 Aug 2026" from a YYYY-MM-DD date. */
export function formatDisplayDate(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return '60' + digits.slice(1);
  return '60' + digits;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}

const toDeliveryOrder = (row: {
  id: number;
  full_name: string;
  phone_number: string | null;
  apartment: string | null;
  house_unit: string | null;
  pickup_location: string | null;
  delivery_point_name: string | null | undefined;
  delivery_method: string | null | undefined;
  delivery_fee: number | null | undefined;
  order_notes: string | null;
  order_summary: unknown;
  payment_status: string;
  delivery_status: string | null | undefined;
  total: number;
}): DeliveryOrder => {
  const summary = (row.order_summary ?? {}) as { orderRef?: string };
  const pickup = row.pickup_location ?? '';
  const pointName = row.delivery_point_name ?? pickup;
  return {
    dbId: row.id,
    orderRef: summary.orderRef ?? String(row.id),
    customerName: row.full_name,
    customerPhone: row.phone_number ?? '',
    apartment: row.apartment ?? '',
    houseUnit: row.house_unit ?? '',
    pointName,
    method: row.delivery_method ?? 'Customer Come Down',
    notes: row.order_notes ?? '',
    paymentStatus: row.payment_status,
    deliveryStatus: (row.delivery_status as DeliveryStatus) || 'pending',
    deliveryFee: Number(row.delivery_fee ?? 0),
    total: Number(row.total),
  };
};

/** Fetch all orders for a given delivery date (via their delivery_batches.delivery_date). */
export async function fetchOrdersForDate(date: string): Promise<DeliveryOrder[]> {
  const { data, error } = await supabase
    .from('Orders')
    .select('id, full_name, phone_number, apartment, house_unit, pickup_location, delivery_point_name, delivery_method, delivery_fee, order_notes, order_summary, payment_status, delivery_status, total, delivery_batches!inner(delivery_date)')
    .eq('delivery_batches.delivery_date', date)
    .order('delivery_point_name', { ascending: true })
    .order('pickup_location', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => toDeliveryOrder(r));
}

const toDeliveryPoint = (p: {
  id: number;
  name: string;
  area: string | null;
  delivery_fee: number | string;
  delivery_method: DeliveryMethod;
  display_order: number;
  active: boolean;
  pickup_notes: string | null;
  latitude: number | null;
  longitude: number | null;
}): DeliveryPoint => ({
  id: p.id,
  name: p.name,
  area: p.area,
  delivery_fee: Number(p.delivery_fee),
  delivery_method: p.delivery_method as DeliveryMethod,
  display_order: p.display_order,
  active: p.active,
  pickup_notes: p.pickup_notes,
  latitude: p.latitude,
  longitude: p.longitude,
});

/** Fetch all delivery points (admin / rider) ordered by display_order. */
export async function fetchDeliveryPoints(): Promise<DeliveryPoint[]> {
  const { data, error } = await supabase
    .from('delivery_points')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => toDeliveryPoint(r));
}

/** Fetch only ACTIVE delivery points (customer checkout), order by display_order. */
export async function fetchActiveDeliveryPoints(): Promise<DeliveryPoint[]> {
  const { data, error } = await supabase
    .from('delivery_points')
    .select('*')
    .eq('active', true)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r) => toDeliveryPoint(r));
}

export async function updateDeliveryStatus(orderId: number, status: DeliveryStatus): Promise<void> {
  const { error } = await supabase.rpc('rider_update_delivery_status', {
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw error;
}

/** Fetch the rider's assigned delivery dates from today onwards. */
export async function fetchRiderAssignments(riderId: string): Promise<DeliveryAssignment[]> {
  const today = formatLocalDate(new Date());
  const { data, error } = await supabase
    .from('delivery_assignments')
    .select('id, delivery_date, rider_id, created_at')
    .eq('rider_id', riderId)
    .gte('delivery_date', today)
    .order('delivery_date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as DeliveryAssignment[];
}

/** Load a full run (orders + points) for a date, and whether the rider is assigned. */
export async function fetchRunForDate(date: string): Promise<{ orders: DeliveryOrder[]; points: DeliveryPoint[] }> {
  const [orders, points] = await Promise.all([fetchOrdersForDate(date), fetchDeliveryPoints()]);
  return { orders, points };
}

export async function fetchMaxOrdersPerDay(): Promise<number> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'max_orders_per_day')
    .maybeSingle();

  if (error) throw error;
  const raw = data?.value;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (!isNaN(n)) return n;
  }
  return 20;
}

export async function saveMaxOrdersPerDay(value: number): Promise<void> {
  const { error } = await supabase
    .from('site_settings')
    .upsert({ key: 'max_orders_per_day', value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export async function saveDeliveryPoint(point: DeliveryPoint): Promise<void> {
  const { error } = await supabase
    .from('delivery_points')
    .upsert(
      {
        name: point.name,
        area: point.area,
        delivery_fee: point.delivery_fee,
        delivery_method: point.delivery_method,
        display_order: point.display_order,
        active: point.active,
        pickup_notes: point.pickup_notes,
        latitude: point.latitude,
        longitude: point.longitude,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'name' }
    );
  if (error) throw error;
}

export async function updateDeliveryPoint(
  id: number,
  patch: Partial<Pick<DeliveryPoint, 'name' | 'area' | 'delivery_fee' | 'delivery_method' | 'display_order' | 'active' | 'pickup_notes' | 'latitude' | 'longitude'>>
): Promise<void> {
  const { error } = await supabase
    .from('delivery_points')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteDeliveryPoint(id: number): Promise<void> {
  const { error } = await supabase
    .from('delivery_points')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/** Assign sequential display_order (1..n) to the given delivery point ids. */
export async function reorderDeliveryPoints(ids: number[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from('delivery_points')
      .update({ display_order: i + 1, updated_at: new Date().toISOString() })
      .eq('id', ids[i]);
    if (error) throw error;
  }
}

export async function fetchAssignments(date: string): Promise<DeliveryAssignment[]> {
  const { data, error } = await supabase
    .from('delivery_assignments')
    .select('id, delivery_date, rider_id, created_at')
    .eq('delivery_date', date)
    .order('id', { ascending: true });

  if (error) throw error;
  return (data ?? []) as DeliveryAssignment[];
}

export async function assignRider(date: string, riderId: string): Promise<void> {
  const { error } = await supabase
    .from('delivery_assignments')
    .upsert({ delivery_date: date, rider_id: riderId }, { onConflict: 'delivery_date,rider_id' });
  if (error) throw error;
}

export async function unassignRider(date: string, riderId: string): Promise<void> {
  const { error } = await supabase
    .from('delivery_assignments')
    .delete()
    .eq('delivery_date', date)
    .eq('rider_id', riderId);
  if (error) throw error;
}

/** Fetch users that hold the delivery_rider role (used for assignment UI). */
export async function fetchRiders(): Promise<RiderInfo[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`,
    { headers: { Authorization: `Bearer ${session.access_token}` } }
  );
  if (!res.ok) return [];

  const authUsers: { id: string; email: string }[] = await res.json();

  const { data: roleRows, error } = await supabase
    .from('user_roles')
    .select('id, role')
    .eq('role', 'delivery_rider');

  if (error) return [];

  const riderIds = new Set((roleRows ?? []).map((r) => r.id));
  return authUsers
    .filter((u) => riderIds.has(u.id))
    .map((u) => ({ id: u.id, email: u.email }));
}
