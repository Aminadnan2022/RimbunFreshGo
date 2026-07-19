import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Package, ChevronRight, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Order } from '../types';

type OrderRow = {
  id: number;
  created_at: string;
  full_name: string;
  phone_number: string;
  email_address: string;
  street_address: string;
  postcode: string;
  city: string;
  state: string;
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
};

const statusConfig: Record<Order['status'], { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-jade-100 text-jade-700' },
  preparing: { label: 'Being Prepared', className: 'bg-blue-100 text-blue-700' },
  'out-for-delivery': { label: 'Out for Delivery', className: 'bg-amber-100 text-amber-700' },
  delivered: { label: 'Delivered', className: 'bg-forest-100 text-forest-700' },
};

function mapRow(row: OrderRow): { ref: string; deliveryDate: string; status: Order['status']; total: number; createdAt: string } {
  return {
    ref: row.order_summary?.orderRef ?? String(row.id),
    deliveryDate: row.order_summary?.deliveryDate ?? '',
    status: row.order_summary?.status ?? 'confirmed',
    total: Number(row.total),
    createdAt: row.created_at,
  };
}

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<ReturnType<typeof mapRow>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('Orders')
          .select('id, created_at, order_summary, total')
          .order('created_at', { ascending: false });
        if (fetchError) throw fetchError;
        if (active) setOrders((data as OrderRow[]).map(mapRow));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load orders');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user]);

  if (authLoading) {
    return (
      <main className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </main>
    );
  }

  if (!user) return <Navigate to="/" replace />;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <nav className="flex items-center gap-2 text-xs text-gray-400 mb-6">
        <Link to="/profile" className="hover:text-forest-600">Profile</Link>
        <ChevronRight size={12} />
        <span className="text-gray-600">My Orders</span>
      </nav>

      <h1 className="section-title mb-8">My Orders</h1>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-forest-500" size={32} />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-red-500 text-sm">{error}</div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 bg-cream-100 rounded-full flex items-center justify-center mb-6">
            <Package size={36} className="text-cream-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No orders yet</h3>
          <p className="text-gray-500 text-sm mb-8">Your order history will appear here once you place your first order.</p>
          <Link to="/shop" className="btn-primary flex items-center gap-2">
            Start Shopping <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const status = statusConfig[order.status] ?? statusConfig.confirmed;
            return (
              <div key={order.ref} className="card p-5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-mono text-sm font-semibold text-forest-800">{order.ref}</p>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                  {order.deliveryDate && (
                    <p className="text-sm text-gray-500">{order.deliveryDate}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(order.createdAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <p className="font-bold text-forest-800">RM{order.total.toFixed(2)}</p>
                  <Link
                    to={`/order/${order.ref}`}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-forest-700 border border-forest-200 hover:bg-forest-50 transition-all"
                  >
                    View <ChevronRight size={14} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
