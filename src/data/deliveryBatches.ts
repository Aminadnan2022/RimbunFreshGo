import { supabase } from '../lib/supabase';

export type DeliveryBatchStatus =
  | 'pending'
  | 'packing'
  | 'awaiting_lalamove'
  | 'in_transit_to_hub'
  | 'arrived_at_hub'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

export const DELIVERY_BATCH_STATUSES: DeliveryBatchStatus[] = [
  'pending',
  'packing',
  'awaiting_lalamove',
  'in_transit_to_hub',
  'arrived_at_hub',
  'completed',
  'cancelled',
];

export interface DeliveryBatch {
  id: string;
  batch_code: string;
  delivery_date: string;
  supplier_name: string | null;
  supplier_notes: string | null;
  hub_name: string;
  lalamove_tracking_url: string | null;
  booking_reference: string | null;
  packing_started_at: string | null;
  packing_completed_at: string | null;
  lalamove_booked_at: string | null;
  hub_arrived_at: string | null;
  ready_for_rider_at: string | null;
  delivery_started_at: string | null;
  completed_at: string | null;
  status: DeliveryBatchStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Number of orders assigned to this batch (computed at fetch time). */
  order_count: number;
}

export interface DeliveryBatchInput {
  delivery_date: string;
  supplier_name: string | null;
  supplier_notes: string | null;
  status: DeliveryBatchStatus;
  lalamove_tracking_url: string | null;
}

export interface DeliveryBatchPatch {
  supplier_name?: string | null;
  supplier_notes?: string | null;
  status?: DeliveryBatchStatus;
  lalamove_tracking_url?: string | null;
}

const toBatch = (row: Record<string, unknown>): DeliveryBatch => ({
  id: String(row.id),
  batch_code: String(row.batch_code),
  delivery_date: String(row.delivery_date),
  supplier_name: (row.supplier_name as string | null) ?? null,
  supplier_notes: (row.supplier_notes as string | null) ?? null,
  hub_name: String(row.hub_name ?? 'Residensi Rimbun'),
  lalamove_tracking_url: (row.lalamove_tracking_url as string | null) ?? null,
  booking_reference: (row.booking_reference as string | null) ?? null,
  packing_started_at: (row.packing_started_at as string | null) ?? null,
  packing_completed_at: (row.packing_completed_at as string | null) ?? null,
  lalamove_booked_at: (row.lalamove_booked_at as string | null) ?? null,
  hub_arrived_at: (row.hub_arrived_at as string | null) ?? null,
  ready_for_rider_at: (row.ready_for_rider_at as string | null) ?? null,
  delivery_started_at: (row.delivery_started_at as string | null) ?? null,
  completed_at: (row.completed_at as string | null) ?? null,
  status: (row.status as DeliveryBatchStatus) ?? 'pending',
  created_by: (row.created_by as string | null) ?? null,
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
  order_count: 0,
});

/** All batches, sorted by delivery_date DESC then created_at DESC. */
export async function fetchDeliveryBatches(): Promise<DeliveryBatch[]> {
  const [rowsRes, countRes] = await Promise.all([
    supabase
      .from('delivery_batches')
      .select('*')
      .order('delivery_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('Orders').select('delivery_batch_id'),
  ]);

  if (rowsRes.error) throw rowsRes.error;
  if (countRes.error) throw countRes.error;

  const counts = new Map<string, number>();
  (countRes.data ?? []).forEach((r) => {
    if (!r.delivery_batch_id) return;
    counts.set(r.delivery_batch_id, (counts.get(r.delivery_batch_id) ?? 0) + 1);
  });

  return (rowsRes.data ?? []).map((r) => ({ ...toBatch(r), order_count: counts.get(String(r.id)) ?? 0 }));
}

/** Number of orders currently assigned to a batch. */
export async function countOrdersInBatch(batchId: string): Promise<number> {
  const { count, error } = await supabase
    .from('Orders')
    .select('id', { count: 'exact', head: true })
    .eq('delivery_batch_id', batchId);
  if (error) throw error;
  return count ?? 0;
}

/** Next batch code for a date, e.g. BATCH-20260803-001. */
export async function nextBatchCode(deliveryDate: string): Promise<string> {
  const prefix = `BATCH-${deliveryDate.replace(/-/g, '')}`;
  const { data, error } = await supabase
    .from('delivery_batches')
    .select('batch_code')
    .like('batch_code', `${prefix}-%`);
  if (error) throw error;

  let max = 0;
  (data ?? []).forEach((r) => {
    const m = String(r.batch_code).match(/-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/** Create a batch. Batch code is auto-generated (unique); retries on a race. */
export async function createDeliveryBatch(input: DeliveryBatchInput): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const created_by = session?.user?.id ?? null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const batch_code = await nextBatchCode(input.delivery_date);
    const { error } = await supabase.from('delivery_batches').insert({
      batch_code,
      delivery_date: input.delivery_date,
      supplier_name: input.supplier_name,
      supplier_notes: input.supplier_notes,
      status: input.status,
      lalamove_tracking_url: input.lalamove_tracking_url,
      created_by,
    });
    if (!error) return;
    if (error.code === '23505') continue; // unique violation on batch_code race
    throw error;
  }
  throw new Error('Could not generate a unique batch code');
}

/** Update editable fields of a batch. */
export async function updateDeliveryBatch(id: string, patch: DeliveryBatchPatch): Promise<void> {
  const { error } = await supabase
    .from('delivery_batches')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Delete a batch. Fails when orders are still assigned to it. */
export async function deleteDeliveryBatch(id: string): Promise<void> {
  const assigned = await countOrdersInBatch(id);
  if (assigned > 0) throw new Error('BATCH_HAS_ORDERS');
  const { error } = await supabase.from('delivery_batches').delete().eq('id', id);
  if (error) throw error;
}

/** Batches for a specific delivery date, newest first. Used by the supplier dispatch screen. */
export async function fetchDeliveryBatchesForDate(deliveryDate: string): Promise<DeliveryBatch[]> {
  const [rowsRes, countRes] = await Promise.all([
    supabase
      .from('delivery_batches')
      .select('*')
      .eq('delivery_date', deliveryDate)
      .order('created_at', { ascending: false }),
    supabase.from('Orders').select('delivery_batch_id'),
  ]);

  if (rowsRes.error) throw rowsRes.error;
  if (countRes.error) throw countRes.error;

  const counts = new Map<string, number>();
  (countRes.data ?? []).forEach((r) => {
    if (!r.delivery_batch_id) return;
    counts.set(r.delivery_batch_id, (counts.get(r.delivery_batch_id) ?? 0) + 1);
  });

  return (rowsRes.data ?? []).map((r) => ({ ...toBatch(r), order_count: counts.get(String(r.id)) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Supplier dispatch workflow (mirrors the SECURITY DEFINER RPCs in
// 20260812000000_add_supplier_dispatch_workflow.sql)
// ---------------------------------------------------------------------------

/** Typed escape hatch for RPCs not yet present in the generated client union. */
async function callDispatchRpc(
  fn: string,
  args: Record<string, unknown>
): Promise<{ error: { message?: string; details?: string; hint?: string } | null }> {
  const res = await (supabase.rpc as unknown as (
    name: string,
    params?: Record<string, unknown>
  ) => Promise<{ error: { message?: string; details?: string; hint?: string } | null }>)(fn, args);
  return res;
}

/**
 * Step 1 — Supplier: start packing.
 * Independent of Delivery Batch — routes through the idempotent SECURITY
 * DEFINER RPC supplier_start_packing_order which sets packing_started_at on
 * the order (no-op if already started; enforces Paid precondition).
 */
export async function supplierStartPacking(orderId: string): Promise<void> {
  const { error } = await callDispatchRpc('supplier_start_packing_order', { p_order_id: Number(orderId) });
  if (error) throw error;
}

/**
 * Step 2 — Supplier: packing completed.
 * Independent of Delivery Batch — routes through the idempotent SECURITY
 * DEFINER RPC supplier_complete_packing_order which sets packing_completed_at
 * on the order (no-op if already completed; enforces packing-started
 * precondition).
 */
export async function supplierCompletePacking(orderId: string): Promise<void> {
  const { error } = await callDispatchRpc('supplier_complete_packing_order', { p_order_id: Number(orderId) });
  if (error) throw error;
}

/** Step 3 — Supplier: book Lalamove with tracking URL (https://) + optional booking reference. */
export async function supplierBookLalamove(
  batchId: string,
  trackingUrl: string,
  bookingReference?: string
): Promise<void> {
  const { error } = await callDispatchRpc('supplier_book_lalamove', {
    p_batch_id: batchId,
    p_tracking_url: trackingUrl,
    p_booking_reference: bookingReference ?? null,
  });
  if (error) throw error;
}

/**
 * Step 3 (order-level) — Supplier: book Lalamove for a single order.
 * Sets Orders.lalamove_tracking_url / booking_reference / lalamove_booked_at /
 * supplier_dispatch_started_at via SECURITY DEFINER RPC. Idempotent.
 */
export async function supplierBookLalamoveForOrder(
  orderId: string,
  trackingUrl: string,
  bookingReference?: string
): Promise<void> {
  const { error } = await callDispatchRpc('supplier_book_lalamove_order', {
    p_order_id: Number(orderId),
    p_tracking_url: trackingUrl,
    p_booking_reference: bookingReference ?? null,
  });
  if (error) throw error;
}

/** Step 5 (order-level) — Admin: confirm a single order arrived at the hub. */
export async function adminConfirmOrderArrival(orderId: string): Promise<void> {
  const { error } = await callDispatchRpc('admin_confirm_order_arrival', {
    p_order_id: Number(orderId),
  });
  if (error) throw error;
}

/** Step 6 (order-level) — Admin: mark a single order ready for the rider. */
export async function adminMarkOrderReadyForRider(orderId: string): Promise<void> {
  const { error } = await callDispatchRpc('admin_mark_order_ready_for_rider', {
    p_order_id: Number(orderId),
  });
  if (error) throw error;
}

/** Step 4 — Admin: confirm arrival at the hub. Requires a tracking URL. */
export async function adminConfirmHubArrival(batchId: string): Promise<void> {
  const { error } = await callDispatchRpc('admin_confirm_hub_arrival', { p_batch_id: batchId });
  if (error) throw error;
}

/** Step 5 — Admin: mark ready for the rider. Requires arrival confirmed. */
export async function adminMarkReadyForRider(batchId: string): Promise<void> {
  const { error } = await callDispatchRpc('admin_mark_ready_for_rider', { p_batch_id: batchId });
  if (error) throw error;
}
