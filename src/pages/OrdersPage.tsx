import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Package, ChevronRight, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
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

const statusConfig = (t: (key: string) => string): Record<Order['status'], { label: string; className: string }> => ({
  confirmed: { label: t("ordersPage.confirmed"), className: 'bg-jade-100 text-jade-700' },
  preparing: { label: t("ordersPage.preparing"), className: 'bg-blue-100 text-blue-700' },
  'out-for-delivery': { label: t("ordersPage.outForDelivery"), className: 'bg-amber-100 text-amber-700' },
  delivered: { label: t("ordersPage.delivered"), className: 'bg-forest-100 text-forest-700' },
});

type DisplayOrder = {
  ref: string;
  deliveryDate: string;
  status: Order['status'];
  total: number;
  createdAt: string;
};

type CanonicalOrderRow = {
  id: string;
  order_number: string;
  status: string;
  delivery_snapshot: {
    requested_date?: string;
  } | null;
  total: number | null;
  estimated_total: number | null;
  final_total: number | null;
  created_at: string;
};

function mapRow(row: OrderRow): DisplayOrder {
  return {
    ref: row.order_summary?.orderRef ?? String(row.id),
    deliveryDate: row.order_summary?.deliveryDate ?? '',
    status: row.order_summary?.status ?? 'confirmed',
    total: Number(row.total),
    createdAt: row.created_at,
  };
}

function canonicalStatus(status: string): Order['status'] {
  switch (status) {
    case 'confirmed':
      return 'confirmed';

    case 'preparing':
    case 'packing':
    case 'ready':
    case 'ready_for_dispatch':
      return 'preparing';

    case 'out-for-delivery':
    case 'out_for_delivery':
    case 'dispatched':
    case 'dispatch':
      return 'out-for-delivery';

    case 'delivered':
    case 'completed':
      return 'delivered';

    default:
      return 'confirmed';
  }
}

function mapCanonicalRow(row: CanonicalOrderRow): DisplayOrder {
  return {
    ref: row.order_number,
    deliveryDate: row.delivery_snapshot?.requested_date ?? '',
    status: canonicalStatus(row.status),
    total: Number(
      row.final_total ??
      row.total ??
      row.estimated_total ??
      0
    ),
    createdAt: row.created_at,
  };
}

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [orders, setOrders] = useState<DisplayOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const [legacyResult, canonicalResult] = await Promise.all([
          supabase
            .from('Orders')
            .select('id, created_at, order_summary, total')
            .order('created_at', { ascending: false }),

          supabase
            .from('sales_orders')
            .select('id, order_number, status, delivery_snapshot, total, estimated_total, final_total, created_at')
            .order('created_at', { ascending: false }),
        ]);

        if (legacyResult.error) throw legacyResult.error;
        if (canonicalResult.error) throw canonicalResult.error;

        const legacyOrders = ((legacyResult.data ?? []) as OrderRow[]).map(mapRow);
        const canonicalOrders = ((canonicalResult.data ?? []) as CanonicalOrderRow[]).map(mapCanonicalRow);

        // Prefer the canonical order if the same customer-facing reference
        // somehow exists in both stores during the migration period.
        const merged = new Map<string, DisplayOrder>();

        for (const order of canonicalOrders) {
          merged.set(order.ref, order);
        }

        for (const order of legacyOrders) {
          if (!merged.has(order.ref)) {
            merged.set(order.ref, order);
          }
        }

        const sortedOrders = Array.from(merged.values()).sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime(),
        );

        if (active) setOrders(sortedOrders);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : t("myOrders.failedToLoad"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user, t]);

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
        <Link to="/profile" className="hover:text-forest-600">{t("myOrders.profile")}</Link>
        <ChevronRight size={12} />
        <span className="text-gray-600">{t("myOrders.pageTitle")}</span>
      </nav>

      <h1 className="section-title mb-8">{t("myOrders.title")}</h1>

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
          <h3 className="text-xl font-semibold text-gray-700 mb-2">{t("myOrders.emptyTitle")}</h3>
          <p className="text-gray-500 text-sm mb-8">{t("myOrders.emptyMessage")}</p>
          <Link to="/shop" className="btn-primary flex items-center gap-2">
            {t("myOrders.startShopping")} <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const status = statusConfig(t)[order.status] ?? statusConfig(t).confirmed;
            return (
              <div key={order.ref} className="card p-5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-mono text-sm font-semibold text-forest-800">{order.ref}</p>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${status.className}`}>
                      {t("myOrders.status." + order.status)}
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
                  <p className="font-bold text-forest-800">RM{formatCurrency(order.total)}</p>
                  <Link
                    to={`/order/${order.ref}`}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-forest-700 border border-forest-200 hover:bg-forest-50 transition-all"
                  >
                    {t("myOrders.viewDetails")} <ChevronRight size={14} />
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
