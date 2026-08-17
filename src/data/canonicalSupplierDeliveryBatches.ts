import { supabase } from '../lib/supabase';

export type CanonicalSupplierBatchStatus =
  | 'draft'
  | 'dispatched'
  | 'arrived_hub'
  | 'cancelled';

export interface CanonicalSupplierBatch {
  id: string;
  batch_code: string;
  supplier_id: number;
  supplier_name: string;
  delivery_date: string;
  status: CanonicalSupplierBatchStatus;
  hub_name: string;
  transport_provider: string | null;
  tracking_url: string | null;
  booking_reference: string | null;
  notes: string | null;
  dispatched_at: string | null;
  arrived_hub_at: string | null;
  created_at: string;
  order_count: number;
}

export interface PackedCanonicalOrder {
  sales_order_id: string;
  order_number: string;
  supplier_id: number;
  supplier_name: string;
  packing_completed_at: string;
  customer_name: string;
  delivery_date: string | null;
}

async function rpc(
  name: string,
  params?: Record<string, unknown>,
): Promise<{ data: unknown; error: { message?: string } | null }> {
  return (supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(name, params);
}

export async function fetchCanonicalSupplierBatches(): Promise<CanonicalSupplierBatch[]> {
  const { data: batches, error } = await supabase
    .from('canonical_supplier_delivery_batches')
    .select('*')
    .order('delivery_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;

  const { data: members, error: memberError } = await supabase
    .from('canonical_supplier_delivery_batch_orders')
    .select('batch_id');

  if (memberError) throw memberError;

  const counts = new Map<string, number>();
  (members ?? []).forEach((row) => {
    const id = String(row.batch_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });

  const { data: supplierDirectoryData, error: supplierDirectoryError } =
    await rpc('get_canonical_supplier_directory');

  if (supplierDirectoryError) throw supplierDirectoryError;

  const supplierDirectory = Array.isArray(supplierDirectoryData)
    ? supplierDirectoryData
    : [];

  const supplierNames = new Map<number, string>(
    supplierDirectory.map((row) => {
      const item = row as Record<string, unknown>;
      return [
        Number(item.supplier_id),
        String(item.supplier_name),
      ];
    }),
  );

  return (batches ?? []).map((b) => ({
    id: String(b.id),
    batch_code: String(b.batch_code),
    supplier_id: Number(b.supplier_id),
    supplier_name: supplierNames.get(Number(b.supplier_id)) ?? `Supplier #${b.supplier_id}`,
    delivery_date: String(b.delivery_date),
    status: b.status as CanonicalSupplierBatchStatus,
    hub_name: String(b.hub_name),
    transport_provider: b.transport_provider ?? null,
    tracking_url: b.tracking_url ?? null,
    booking_reference: b.booking_reference ?? null,
    notes: b.notes ?? null,
    dispatched_at: b.dispatched_at ?? null,
    arrived_hub_at: b.arrived_hub_at ?? null,
    created_at: String(b.created_at),
    order_count: counts.get(String(b.id)) ?? 0,
  }));
}

export async function fetchPackedCanonicalOrders(): Promise<PackedCanonicalOrder[]> {
  const { data: fulfilments, error } = await supabase
    .from('sales_order_supplier_fulfilments')
    .select('sales_order_id, supplier_id, packing_completed_at')
    .eq('status', 'packed')
    .not('packing_completed_at', 'is', null);

  if (error) throw error;
  if (!fulfilments?.length) return [];

  const { data: assigned, error: assignedError } = await supabase
    .from('canonical_supplier_delivery_batch_orders')
    .select('sales_order_id, supplier_id');

  if (assignedError) throw assignedError;

  const assignedKeys = new Set(
    (assigned ?? []).map(
      (row) => `${row.sales_order_id}:${row.supplier_id}`,
    ),
  );

  const eligible = fulfilments.filter(
    (f) => !assignedKeys.has(`${f.sales_order_id}:${f.supplier_id}`),
  );

  if (!eligible.length) return [];

  const orderIds = [...new Set(eligible.map((f) => String(f.sales_order_id)))];
  const [ordersRes, supplierDirectoryRes] = await Promise.all([
    supabase
      .from('sales_orders')
      .select('id, order_number, customer_snapshot, delivery_snapshot, payment_status, status')
      .in('id', orderIds),
    rpc('get_canonical_supplier_directory'),
  ]);

  if (ordersRes.error) throw ordersRes.error;
  if (supplierDirectoryRes.error) throw supplierDirectoryRes.error;

  const orders = new Map(
    (ordersRes.data ?? []).map((o) => [String(o.id), o]),
  );

  const supplierDirectory = Array.isArray(supplierDirectoryRes.data)
    ? supplierDirectoryRes.data
    : [];

  const suppliers = new Map<number, string>(
    supplierDirectory.map((row) => {
      const item = row as Record<string, unknown>;
      return [
        Number(item.supplier_id),
        String(item.supplier_name),
      ];
    }),
  );

  return eligible.flatMap((f) => {
    const order = orders.get(String(f.sales_order_id));

    if (
      !order ||
      order.payment_status !== 'paid' ||
      order.status === 'cancelled'
    ) {
      return [];
    }

    const customerSnapshot =
      order.customer_snapshot &&
      typeof order.customer_snapshot === 'object'
        ? (order.customer_snapshot as Record<string, unknown>)
        : {};

    const deliverySnapshot =
      order.delivery_snapshot &&
      typeof order.delivery_snapshot === 'object'
        ? (order.delivery_snapshot as Record<string, unknown>)
        : {};

    return [{
      sales_order_id: String(f.sales_order_id),
      order_number: String(order.order_number),
      supplier_id: Number(f.supplier_id),
      supplier_name:
        suppliers.get(Number(f.supplier_id)) ?? `Supplier #${f.supplier_id}`,
      packing_completed_at: String(f.packing_completed_at),
      customer_name: String(
        customerSnapshot.name ??
        customerSnapshot.customer_name ??
        'Customer',
      ),
      delivery_date:
        typeof deliverySnapshot.delivery_date === 'string'
          ? deliverySnapshot.delivery_date
          : typeof deliverySnapshot.requested_date === 'string'
          ? deliverySnapshot.requested_date
          : null,
    }];
  });
}

export async function createCanonicalSupplierBatch(
  supplierId: number,
  deliveryDate: string,
): Promise<string> {
  const { data, error } = await rpc(
    'admin_create_canonical_supplier_delivery_batch',
    {
      p_supplier_id: supplierId,
      p_delivery_date: deliveryDate,
      p_transport_provider: 'Lalamove',
      p_notes: null,
    },
  );

  if (error) throw error;
  return String(data);
}

export async function addCanonicalOrderToBatch(
  batchId: string,
  salesOrderId: string,
): Promise<void> {
  const { error } = await rpc(
    'admin_add_sales_order_to_supplier_delivery_batch',
    {
      p_batch_id: batchId,
      p_sales_order_id: salesOrderId,
    },
  );

  if (error) throw error;
}

export async function dispatchCanonicalSupplierBatch(
  batchId: string,
  trackingUrl?: string,
  bookingReference?: string,
): Promise<void> {
  const { error } = await rpc(
    'admin_dispatch_canonical_supplier_delivery_batch',
    {
      p_batch_id: batchId,
      p_transport_provider: 'Lalamove',
      p_tracking_url: trackingUrl?.trim() || null,
      p_booking_reference: bookingReference?.trim() || null,
    },
  );

  if (error) throw error;
}

export async function confirmCanonicalSupplierBatchHubArrival(
  batchId: string,
): Promise<void> {
  const { error } = await rpc(
    'admin_confirm_canonical_supplier_batch_hub_arrival',
    {
      p_batch_id: batchId,
    },
  );

  if (error) throw error;
}
