import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Loader2, RefreshCcw, MapPin, Phone, CheckCircle2, MessageCircle,
  Truck, PackageX, Play, ExternalLink, PackageCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { waLink } from '../data/delivery';
import {
  fetchIncomingShipments,
  fetchTodaysDeliveries,
  receiveOrderAtHub,
  startOrderDelivery,
  markOrderDelivered,
  type RiderOrder,
} from '../data/deliveryRider';

type Tab = 'incoming' | 'today';

const toggleBtn = (active: boolean) =>
  `px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
    active ? 'bg-forest-700 text-white shadow-md' : 'bg-cream-100 text-gray-600 hover:bg-cream-200'
  }`;

export default function DeliveryDashboardPage() {
  const { t } = useLanguage();
  const { user, isRider, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<Tab>('incoming');
  const [incoming, setIncoming] = useState<RiderOrder[]>([]);
  const [today, setToday] = useState<RiderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [inc, tdy] = await Promise.all([fetchIncomingShipments(), fetchTodaysDeliveries()]);
    setIncoming(inc);
    setToday(tdy);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("riderDelivery.messages.failedLoad"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [load, t]);

  const run = async (fn: () => Promise<void>, id: number) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("riderDelivery.messages.failedUpdate"));
    } finally {
      setBusy(null);
    }
  };

  if (authLoading) {
    return (
      <main className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </main>
    );
  }

  if (!user || !isRider) return <Navigate to="/" replace />;

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </main>
    );
  }

  const hasTracking = (o: RiderOrder) => o.lalamoveTrackingUrl && /^https?:\/\//i.test(o.lalamoveTrackingUrl);

  const deliveryLocation = (o: RiderOrder) => o.pointName || o.pickupLocation || '—';

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display font-bold text-forest-900 text-2xl">{t("riderDelivery.title")}</h1>
          <p className="text-sm text-gray-500">{t("riderDelivery.subtitle")}</p>
        </div>
        <button
          onClick={() => { setLoading(true); load().finally(() => setLoading(false)); }}
          disabled={loading}
          aria-label="Refresh"
          className="p-2.5 rounded-xl border border-cream-200 bg-white text-forest-700 hover:bg-cream-50 transition-all disabled:opacity-50"
        >
          <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
          <PackageX size={18} className="flex-shrink-0" /> {error}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('incoming')} className={toggleBtn(tab === 'incoming')}>
          {t("riderDelivery.incomingTitle")} ({incoming.length})
        </button>
        <button onClick={() => setTab('today')} className={toggleBtn(tab === 'today')}>
          {t("riderDelivery.todayTitle")} ({today.length})
        </button>
      </div>

      {tab === 'incoming' ? (
        <>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">{t("riderDelivery.incomingSubtitle")}</p>
          {incoming.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-cream-200 shadow-soft">
              <Truck size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">{t("riderDelivery.noIncoming")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {incoming.map((o) => (
                <section key={o.id} className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{o.customer}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{o.ref}</p>
                    </div>
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                      {t("riderDelivery.shipmentBadge")}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600 mb-3">
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={14} className="text-gray-400" /> {deliveryLocation(o)}
                    </span>
                    {o.houseUnit && (
                      <span>🏠 {t("riderDelivery.unit")} {o.houseUnit}</span>
                    )}
                    <span>📦 {o.productCount} {t("riderDelivery.products")}</span>
                  </div>

                  {o.bookingReference && (
                    <p className="text-xs text-gray-500 mb-3">
                      {t("riderDelivery.bookingRef")}: <span className="font-mono font-semibold">{o.bookingReference}</span>
                    </p>
                  )}

                  <div className="flex gap-3">
                    {hasTracking(o) ? (
                      <a
                        href={o.lalamoveTrackingUrl!}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-sm font-semibold text-forest-700 border border-forest-300 hover:bg-forest-50 transition-all"
                      >
                        <ExternalLink size={16} />
                        {t("riderDelivery.trackLalamove")}
                      </a>
                    ) : (
                      <span className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl text-sm text-gray-400 border border-cream-200">
                        {t("riderDelivery.noTrackingUrl")}
                      </span>
                    )}
                    <button
                      onClick={() => run(() => receiveOrderAtHub(o.id), o.id)}
                      disabled={busy === o.id}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl bg-forest-700 text-white text-sm font-bold hover:bg-forest-800 transition-all disabled:opacity-50"
                    >
                      {busy === o.id ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
                      {t("riderDelivery.receivedAtHub")}
                    </button>
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">{t("riderDelivery.todaySubtitle")}</p>
          {today.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-cream-200 shadow-soft">
              <CheckCircle2 size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">{t("riderDelivery.noToday")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {today.map((o) => {
                const outForDelivery = o.deliveryStatus === 'out_for_delivery';
                return (
                  <section key={o.id} className={`bg-white rounded-2xl border-2 shadow-soft p-5 ${outForDelivery ? 'border-sky-300' : 'border-cream-200'}`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{o.customer}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{o.ref}</p>
                      </div>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        outForDelivery ? 'bg-sky-100 text-sky-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {outForDelivery ? t("riderDelivery.outForDelivery") : t("riderDelivery.readyForDelivery")}
                      </span>
                    </div>

                    <p className="text-sm text-gray-600 mb-1 flex items-center gap-1">
                      <Phone size={14} className="text-gray-400" /> {o.phone}
                    </p>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600 mb-3">
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={14} className="text-gray-400" /> {deliveryLocation(o)}
                      </span>
                      {o.houseUnit && (
                        <span>🏠 {t("riderDelivery.unit")} {o.houseUnit}</span>
                      )}
                      <span>📦 {o.productCount} {t("riderDelivery.products")}</span>
                    </div>

                    {o.items.length > 0 && (
                      <ul className="text-sm text-gray-700 space-y-0.5 mb-3">
                        {o.items.map((it, idx) => (
                          <li key={idx}>· {it.name} {it.detail}</li>
                        ))}
                      </ul>
                    )}

                    <div className="flex gap-3">
                      <a
                        href={`tel:${o.phone}`}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
                      >
                        <Phone size={16} />
                        {t("deliveryDashboard.buttons.call")}
                      </a>
                      <a
                        href={waLink(o.phone, t("riderDelivery.waMessage", { point: deliveryLocation(o) }))}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-green-700 border border-green-200 hover:bg-green-50 transition-all"
                      >
                        <MessageCircle size={16} />
                        {t("deliveryDashboard.buttons.whatsapp")}
                      </a>
                    </div>

                    {!outForDelivery ? (
                      <button
                        onClick={() => run(() => startOrderDelivery(o.id), o.id)}
                        disabled={busy === o.id}
                        className="mt-3 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-forest-700 text-white font-bold hover:bg-forest-800 transition-all disabled:opacity-50"
                      >
                        {busy === o.id ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                        {t("riderDelivery.startDelivery")}
                      </button>
                    ) : (
                      <button
                        onClick={() => run(() => markOrderDelivered(o.id), o.id)}
                        disabled={busy === o.id}
                        className="mt-3 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition-all disabled:opacity-50"
                      >
                        {busy === o.id ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                        {t("riderDelivery.markDelivered")}
                      </button>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
