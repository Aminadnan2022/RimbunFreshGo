import React, { createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import type { Order } from '../types';

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
    item_options: order.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      preparation: i.preparation ?? null,
    })),
    order_items: order.items.map((item) => {
      // Fixed-price lines: gross profit known at checkout. Per-kg / slice lines
      // are stamped by the supplier once the actual weight is entered.
      if (item.pricingType === 'per_kg' || item.pricingType === 'slice' || item.sliceQuantity != null) {
        return item;
      }
      return { ...item, grossProfit: Math.round((item.price - (item.costPrice ?? 0)) * (item.quantity ?? 0) * 100) / 100 };
    }),
    delivery_slot: order.deliveryDay,
    order_summary: {
      status: order.status,
      deliveryDate: order.deliveryDate,
      deliveryWindow: order.deliveryWindow,
      statusTimeline: order.statusTimeline,
      orderRef: order.id,
      preparationSnapshot: order.preparationSnapshot ?? null,
    },
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
      const { error: snapshotError } = await (supabase as any).rpc('record_order_preparation_snapshot', {
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
    return data ? fromRow(data as OrderRow) : null;
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
