import { supabase } from '../lib/supabase';

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  sales_order_id: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

export async function fetchNotifications(limit = 30): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id,title,message,notification_type,sales_order_id,action_url,read_at,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Keeps legacy rows and every Phase 1 event on its actual action screen. */
export function notificationAction(item: AppNotification): string {
  const order = item.sales_order_id ? `/order/${item.sales_order_id}` : '/notifications';
  switch (item.notification_type) {
    case 'payment_receipt_submitted': return '/admin?tab=orders#payment-verification';
    case 'order_requires_weighing':
    case 'order_paid_ready_to_prepare': return '/supplier';
    case 'order_ready_for_dispatch':
    case 'supplier_batch_dispatched':
    case 'supplier_batch_arrived_hub': return item.action_url?.startsWith('/order/') ? order : '/admin?tab=batches';
    case 'delivery_assigned': return '/delivery';
    case 'order_cancelled': return item.action_url?.startsWith('/order/') ? order : '/admin?tab=orders';
    case 'order_payment_submitted':
    case 'price_finalised':
    case 'payment_confirmed':
    case 'payment_receipt_rejected':
    case 'out_for_delivery':
    case 'order_delivered': return order;
    default: return item.action_url || order;
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications')
    .update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.from('notifications')
    .update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (error) throw error;
}
