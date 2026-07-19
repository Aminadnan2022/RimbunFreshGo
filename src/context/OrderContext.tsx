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
}

const toRow = (order: Order) => ({
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
  order_notes: order.customer.notes || null,
  item_options: order.items.map((i) => ({
    productId: i.productId,
    name: i.name,
    preparation: i.preparation ?? null,
  })),
  order_items: order.items,
  delivery_slot: order.deliveryDay,
  order_summary: {
    status: order.status,
    deliveryDate: order.deliveryDate,
    deliveryWindow: order.deliveryWindow,
    statusTimeline: order.statusTimeline,
    orderRef: order.id,
  },
  subtotal: order.subtotal,
  delivery_fee: order.deliveryFee,
  total: order.total,
});

const fromRow = (row: OrderRow): Order => ({
  id: row.order_summary?.orderRef ?? String(row.id),
  items: (row.order_items as Order['items']) ?? [],
  customer: {
    name: row.full_name,
    phone: row.phone_number,
    email: row.email_address,
    apartment: row.apartment ?? '',
    houseUnit: row.house_unit ?? '',
    pickupLocation: row.pickup_location ?? '',
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
});

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const addOrder = async (order: Order): Promise<{ id: string }> => {
    const { data, error } = await supabase
      .from('Orders')
      .insert(toRow(order))
      .select('id, order_summary')
      .single();

    if (error) throw error;
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
