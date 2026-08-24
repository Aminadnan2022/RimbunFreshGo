import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  CheckCircle2,
  Loader2,
  MapPin,
  MessageCircle,
  PackageX,
  Phone,
  Play,
  RefreshCcw,
  Truck,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { waLink } from '../data/delivery';

import {
  fetchTodaysDeliveries,
  startOrderDelivery,
  type RiderOrder,
} from '../data/deliveryRider';

import DeliveryProofPanel from '../components/delivery/DeliveryProofPanel';

export default function DeliveryDashboardPage() {
  const { t } = useLanguage();
  const {
    user,
    isRider,
    loading: authLoading,
  } = useAuth();

  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    const rows = await fetchTodaysDeliveries();
    setOrders(rows);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : t('riderDelivery.messages.failedLoad'),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [load, t]);

  const run = async (
    fn: () => Promise<void>,
    id: string,
  ) => {
    setBusy(id);
    setError(null);
    setSuccessMessage(null);

    try {
      await fn();
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('riderDelivery.messages.failedUpdate'),
      );
    } finally {
      setBusy(null);
    }
  };

  if (authLoading) {
    return (
      <main className="flex items-center justify-center min-h-[50vh]">
        <Loader2
          className="animate-spin text-forest-500"
          size={32}
        />
      </main>
    );
  }

  if (!user || !isRider) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-[50vh]">
        <Loader2
          className="animate-spin text-forest-500"
          size={32}
        />
      </main>
    );
  }

  const deliveryLocation = (order: RiderOrder) =>
    order.pointName ||
    order.pickupLocation ||
    order.apartment ||
    '—';

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display font-bold text-forest-900 text-2xl">
            {t('riderDelivery.title')}
          </h1>

          <p className="text-sm text-gray-500">
            FreshGo Hub → Customer Deliveries
          </p>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            load().finally(() => setLoading(false));
          }}
          disabled={loading}
          aria-label="Refresh"
          className="p-2.5 rounded-xl border border-cream-200 bg-white text-forest-700 hover:bg-cream-50 transition-all disabled:opacity-50"
        >
          <RefreshCcw
            size={18}
            className={loading ? 'animate-spin' : ''}
          />
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
          <PackageX
            size={18}
            className="flex-shrink-0"
          />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Delivery completed</p>
            <p className="mt-0.5 text-xs text-green-700">{successMessage}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-forest-900">
            My Deliveries
          </h2>

          <p className="text-xs text-gray-500 mt-0.5">
            Orders assigned to you and ready at FreshGo Hub.
          </p>
        </div>

        <span className="inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-full bg-forest-50 text-forest-700 text-sm font-semibold">
          {orders.length}
        </span>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-cream-200 shadow-soft">
          <Truck
            size={48}
            className="mx-auto text-gray-300 mb-4"
          />

          <p className="text-gray-500">
            No deliveries assigned to you.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const outForDelivery =
              order.deliveryStatus === 'out_for_delivery';

            return (
              <section
                key={order.id}
                className={`bg-white rounded-2xl border-2 shadow-soft p-5 ${
                  outForDelivery
                    ? 'border-sky-300'
                    : 'border-cream-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {order.customer}
                    </p>

                    <p className="text-xs text-gray-400 font-mono mt-0.5">
                      {order.ref}
                    </p>

                    <p className="text-xs text-gray-400 mt-1">
                      Delivery date: {order.deliveryDate}
                    </p>
                  </div>

                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      outForDelivery
                        ? 'bg-sky-100 text-sky-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {outForDelivery
                      ? t('riderDelivery.outForDelivery')
                      : t('riderDelivery.readyForDelivery')}
                  </span>
                </div>

                {order.phone && (
                  <p className="text-sm text-gray-600 mb-1 flex items-center gap-1">
                    <Phone
                      size={14}
                      className="text-gray-400"
                    />
                    {order.phone}
                  </p>
                )}

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600 mb-3">
                  <span className="inline-flex items-center gap-1">
                    <MapPin
                      size={14}
                      className="text-gray-400"
                    />
                    {deliveryLocation(order)}
                  </span>

                  {order.houseUnit && (
                    <span>
                      🏠 {t('riderDelivery.unit')} {order.houseUnit}
                    </span>
                  )}

                  <span>
                    📦 {order.productCount}{' '}
                    {t('riderDelivery.products')}
                  </span>
                </div>

                {order.items.length > 0 && (
                  <ul className="text-sm text-gray-700 space-y-0.5 mb-3">
                    {order.items.map((item, index) => (
                      <li key={`${order.id}-${index}`}>
                        · {item.name} {item.detail}
                      </li>
                    ))}
                  </ul>
                )}

                {order.notes && (
                  <div className="mb-3 rounded-xl bg-cream-50 border border-cream-100 px-3 py-2">
                    <p className="text-xs font-semibold text-gray-500">
                      Customer notes
                    </p>

                    <p className="text-sm text-gray-700 mt-0.5">
                      {order.notes}
                    </p>
                  </div>
                )}

                {order.phone && (
                  <div className="flex gap-3">
                    <a
                      href={`tel:${order.phone}`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
                    >
                      <Phone size={16} />
                      {t('deliveryDashboard.buttons.call')}
                    </a>

                    <a
                      href={waLink(
                        order.phone,
                        t('riderDelivery.waMessage', {
                          point: deliveryLocation(order),
                        }),
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-green-700 border border-green-200 hover:bg-green-50 transition-all"
                    >
                      <MessageCircle size={16} />
                      {t('deliveryDashboard.buttons.whatsapp')}
                    </a>
                  </div>
                )}

                {!outForDelivery ? (
                  <button
                    onClick={() =>
                      run(
                        () => startOrderDelivery(order.id),
                        order.id,
                      )
                    }
                    disabled={busy === order.id}
                    className="mt-3 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-forest-700 text-white font-bold hover:bg-forest-800 transition-all disabled:opacity-50"
                  >
                    {busy === order.id ? (
                      <Loader2
                        size={18}
                        className="animate-spin"
                      />
                    ) : (
                      <Play size={18} />
                    )}

                    {t('riderDelivery.startDelivery')}
                  </button>
                ) : (
                  <DeliveryProofPanel
                    salesOrderId={order.id}
                    onCompleted={async () => {
                      setSuccessMessage(
                        `Order ${order.ref} has been marked delivered. Your remaining deliveries are shown below.`,
                      );
                      await load();
                    }}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
