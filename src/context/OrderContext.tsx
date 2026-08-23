import React, { createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import type { CartItem, Order } from '../types';
import type { Json } from '../types/database';

interface OrderContextValue {
  addOrder: (order: Order) => Promise<{ id: string }>;
  getOrder: (id: string) => Promise<Order | null>;
}

const OrderContext = createContext<OrderContextValue | null>(null);

interface OrderRow {
  id: number;
  created_at: string;
  full_name: string;
  phone_number: string;
  email_address: string;
  street_address: string;
  postcode: string;
  city: string;
  state: string;
  apartment: string;
  house_unit: string;
  pickup_location: string;
  delivery_point_name: string | null;
  delivery_method: string | null;
  order_notes: string | null;
  item_options: unknown;
  order_items: unknown;
  delivery_slot: string;
  order_summary: {
    status?: Order['status'];
    deliveryDate?: string;
    deliveryWindow?: string;
    statusTimeline?: { status: string; time: string; done: boolean }[];
    orderRef?: string;
  };
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_status: string;
  paid_at: string | null;
  delivery_batch_id: string | null;
  delivery_status: string | null;
  delivered_at: string | null;
  packing_started_at: string | null;
  packing_completed_at: string | null;
  supplier_dispatch_started_at: string | null;
  supplier_dispatch_completed_at: string | null;
  ready_for_rider_at: string | null;
  lalamove_tracking_url: string | null;
  supplier_weights: Record<string, number> | null;
}

const toRow = (order: Order) => {
  // Snapshotted gross profit at checkout: selling price - supplier cost, per
  // unit, scaled by quantity (or estimated weight where known). The supplier
  // re-computes and overwrites this after weighing per-kg / slice items.
  const grossProfit = Math.round(
    order.items.reduce((sum, item) => {
      const unit = item.price - (item.costPrice ?? 0);
      if (item.pricingType === 'per_kg') return sum + unit * (item.estimatedWeight ?? 0);
      if (item.pricingType === 'slice') return sum; // final value known only after weighing
      return sum + unit * (item.quantity ?? 0);
    }, 0) * 100,
  ) / 100;

  return {
    full_name: order.customer.name,
    phone_number: order.customer.phone,
    email_address: order.customer.email,
    street_address: '',
    postcode: '',
    city: '',
    state: 'Selangor',
    apartment: order.customer.apartment,
    house_unit: order.customer.houseUnit,
    pickup_location: order.customer.pickupLocation,
    delivery_point_name: order.customer.deliveryPointName ?? '',
    delivery_method: order.customer.deliveryMethod ?? '',
    order_notes: order.customer.notes || null,
    item_options: JSON.parse(JSON.stringify(order.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      preparation: i.preparation ?? null,
    })))) as Json,
    order_items: JSON.parse(JSON.stringify(order.items.map((item) => {
      // Fixed-price lines: gross profit known at checkout. Per-kg / slice lines
      // are stamped by the supplier once the actual weight is entered.
      if (item.pricingType === 'per_kg' || item.pricingType === 'slice' || item.sliceQuantity != null) {
        return item;
      }
      return { ...item, grossProfit: Math.round((item.price - (item.costPrice ?? 0)) * (item.quantity ?? 0) * 100) / 100 };
    }))) as Json,
    delivery_slot: order.deliveryDay,
    order_summary: JSON.parse(JSON.stringify({
      status: order.status,
      deliveryDate: order.deliveryDate,
      deliveryWindow: order.deliveryWindow,
      statusTimeline: order.statusTimeline,
      orderRef: order.id,
      preparationSnapshot: order.preparationSnapshot ?? null,
    })) as Json,
    subtotal: order.subtotal,
    delivery_fee: order.deliveryFee,
    total: order.total,
    gross_profit: grossProfit,
  };
};

const fromRow = (row: OrderRow): Order => {
  const items = (row.order_items as Order['items']) ?? [];
  const weights = row.supplier_weights ?? {};
  const withWeights = items.map((item, index) => {
    const w = weights[String(index)];
    if (w != null && (item.pricingType === 'per_kg' || item.pricingType === 'slice' || item.sliceQuantity != null)) {
      return { ...item, actualWeight: w };
    }
    return item;
  });
  return {
  id: row.order_summary?.orderRef ?? String(row.id),
  items: withWeights,
  customer: {
    name: row.full_name,
    phone: row.phone_number,
    email: row.email_address,
    apartment: row.apartment ?? '',
    houseUnit: row.house_unit ?? '',
    pickupLocation: row.pickup_location ?? '',
    deliveryPointName: row.delivery_point_name ?? '',
    deliveryMethod: row.delivery_method ?? '',
    notes: row.order_notes ?? '',
  },
  deliveryDay: row.delivery_slot as Order['deliveryDay'],
  deliveryDate: row.order_summary?.deliveryDate ?? '',
  deliveryWindow: row.order_summary?.deliveryWindow ?? '',
  subtotal: Number(row.subtotal),
  deliveryFee: Number(row.delivery_fee),
  total: Number(row.total),
  status: row.order_summary?.status ?? 'confirmed',
  createdAt: row.created_at,
  statusTimeline: row.order_summary?.statusTimeline ?? [],
  paymentStatus: (row.payment_status as Order['paymentStatus']) ?? 'Pending',
  paidAt: row.paid_at ?? null,
  deliveryBatchId: row.delivery_batch_id ?? null,
  deliveryStatus: row.delivery_status ?? 'pending',
  deliveredAt: row.delivered_at ?? null,
  packingStartedAt: row.packing_started_at ?? null,
  packingCompletedAt: row.packing_completed_at ?? null,
  supplierDispatchStartedAt: row.supplier_dispatch_started_at ?? null,
  supplierDispatchCompletedAt: row.supplier_dispatch_completed_at ?? null,
  readyForRiderAt: row.ready_for_rider_at ?? null,
  lalamoveTrackingUrl: row.lalamove_tracking_url ?? null,
  };
};

type CanonicalOrderRow = {
  id: string;
  order_number: string;
  status: string;
  customer_snapshot: { name?: string; phone?: string; email?: string; notes?: string };
  delivery_snapshot: {
    requested_date?: string;
    requested_time?: string | null;
    pickup_location?: string;
    delivery_point_name?: string;
    method_code?: string;
    apartment?: string;
    house_unit?: string;
  };
  subtotal: number;
  delivery_fee: number;
  total: number;
  final_total: number | null;
  price_status: string;
  payment_status: string;
  paid_at: string | null;
  created_at: string;
};

type CanonicalLineRow = {
  product_id: string | null;
  combo_id: string | null;
  item_kind: 'product' | 'combo';
  product_snapshot: { name?: string; image?: string; category?: Order['items'][number]['category']; selling_unit?: string; ordering_mode?: string };
  quantity: number;
  estimated_weight_kg: number | null;
  actual_weight_kg: number | null;
  selling_unit: string;
  unit_selling_price: number;
  ordering_mode: string;
};

const fromCanonicalRows = (order: CanonicalOrderRow, lines: CanonicalLineRow[]): Order => ({
  id: order.order_number,
  items: lines.map((line) => ({
    productId: line.product_id ?? line.combo_id ?? '',
    name: line.product_snapshot?.name ?? line.product_id ?? line.combo_id ?? 'Order item',
    image: line.product_snapshot?.image ?? '',
    price: Number(line.unit_selling_price),
    unit: line.selling_unit || line.product_snapshot?.selling_unit || '',
    category: line.product_snapshot?.category,
    quantity: Number(line.quantity),
    estimatedWeight: line.estimated_weight_kg ?? undefined,
    orderingMode: line.ordering_mode as CartItem['orderingMode'],
    pricingType: line.ordering_mode === 'slice' ? 'slice' : line.ordering_mode === 'fixed_quantity' ? 'fixed' : 'per_kg',
    isCombo: line.item_kind === 'combo',
    comboId: line.combo_id ?? undefined,
  })),
  customer: {
    name: order.customer_snapshot?.name ?? '',
    phone: order.customer_snapshot?.phone ?? '',
    email: order.customer_snapshot?.email ?? '',
    apartment: order.delivery_snapshot?.apartment ?? '',
    houseUnit: order.delivery_snapshot?.house_unit ?? '',
    pickupLocation: order.delivery_snapshot?.pickup_location ?? '',
    deliveryPointName: order.delivery_snapshot?.delivery_point_name ?? '',
    deliveryMethod: order.delivery_snapshot?.method_code ?? '',
    notes: order.customer_snapshot?.notes ?? '',
  },
  deliveryDay: order.delivery_snapshot?.requested_date ?? '',
  deliveryDate: order.delivery_snapshot?.requested_date ?? '',
  deliveryWindow: order.delivery_snapshot?.requested_time ?? '',
  subtotal: Number(order.subtotal),
  deliveryFee: Number(order.delivery_fee),
  total: Number(order.final_total ?? order.total),
  status: order.status as Order['status'],
  createdAt: order.created_at,
  statusTimeline: [],
  paymentStatus:
    order.payment_status === 'paid'
      ? 'Paid'
      : order.price_status === 'final'
        ? 'Ready To Pay'
        : 'Pending',
  paidAt: order.paid_at ?? null,
  deliveryStatus: 'pending',
  deliveredAt: null,
});

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const addOrder = async (order: Order): Promise<{ id: string }> => {
    const { data, error } = await supabase
      .from('Orders')
      .insert(toRow(order))
      .select('id, order_summary')
      .single();

    if (error) throw error;
    // Additive compatibility write: Orders stays authoritative in Phase 3.
    // A failed optional structured write must never invalidate a valid legacy order.
    if (order.preparationSnapshot && data?.id) {
      const { error: snapshotError } = await (supabase as unknown).rpc('record_order_preparation_snapshot', {
        p_legacy_order_id: data.id,
        p_questionnaire_snapshot: order.preparationSnapshot,
      });
      if (snapshotError) console.warn('Preparation snapshot was not recorded:', snapshotError.message);
    }
    const orderRef = (data.order_summary as { orderRef?: string })?.orderRef ?? String(data.id);
    return { id: orderRef };
  };

  const getOrder = async (ref: string): Promise<Order | null> => {
    const { data, error } = await supabase
      .from('Orders')
      .select('*')
      .filter('order_summary->>orderRef', 'eq', ref)
      .maybeSingle();

    if (error) throw error;
    if (data) return fromRow(data as OrderRow);

    const { data: canonicalByNumber, error: canonicalNumberError } = await supabase
      .from('sales_orders')
      .select('id, order_number, status, customer_snapshot, delivery_snapshot, subtotal, delivery_fee, total, final_total, price_status, payment_status, paid_at, created_at')
      .eq('order_number', ref)
      .maybeSingle();
    if (canonicalNumberError) throw canonicalNumberError;
    let canonicalOrder = canonicalByNumber;
    if (!canonicalOrder && /^[0-9a-f-]{36}$/i.test(ref)) {
      const { data: canonicalById, error: canonicalIdError } = await supabase
        .from('sales_orders')
        .select('id, order_number, status, customer_snapshot, delivery_snapshot, subtotal, delivery_fee, total, final_total, price_status, payment_status, paid_at, created_at')
        .eq('id', ref)
        .maybeSingle();
      if (canonicalIdError) throw canonicalIdError;
      canonicalOrder = canonicalById;
    }
    if (!canonicalOrder) return null;

    const { data: canonicalLines, error: linesError } = await supabase
      .from('sales_order_lines')
      .select('product_id, combo_id, item_kind, product_snapshot, quantity, estimated_weight_kg, actual_weight_kg, selling_unit, unit_selling_price, ordering_mode')
      .eq('sales_order_id', canonicalOrder.id)
      .order('line_number', { ascending: true });
    if (linesError) throw linesError;

    return fromCanonicalRows(canonicalOrder as CanonicalOrderRow, (canonicalLines ?? []) as CanonicalLineRow[]);
  };

  return (
    <OrderContext.Provider value={{ addOrder, getOrder }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error('useOrders must be used within OrderProvider');
  return ctx;
}
