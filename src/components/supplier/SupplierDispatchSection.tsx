import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Truck, PackageCheck, Package, ExternalLink, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  fetchDeliveryBatchesForDate,
  supplierStartPacking,
  supplierCompletePacking,
  supplierBookLalamove,
  type DeliveryBatch,
} from '../../data/deliveryBatches';
import { formatLocalDate } from '../../data/delivery';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
}

const inputCls =
  'w-full bg-cream-50 border border-cream-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-all';
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1.5';

function BatchCard({ batch, t, onChanged }: {
  batch: DeliveryBatch;
  t: (k: string, v?: Record<string, string | number>) => string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [trackingUrl, setTrackingUrl] = useState(batch.lalamove_tracking_url ?? '');
  const [bookingRef, setBookingRef] = useState(batch.booking_reference ?? '');

  const started = batch.packing_started_at != null;
  const packed = batch.packing_completed_at != null;
  const booked = batch.lalamove_booked_at != null;
  const done = batch.status === 'completed' || batch.status === 'cancelled';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: t("supplierDispatch.saved") });
      onChanged();
    } catch (err) {
      console.error('[SupplierDispatch]', err);
      setMsg({ ok: false, text: t("supplierDispatch.failed") });
    } finally {
      setBusy(false);
    }
  };

  const book = () => {
    const url = trackingUrl.trim();
    if (!url) {
      setMsg({ ok: false, text: t("supplierDispatch.errorTrackingRequired") });
      return;
    }
    if (!/^https:\/\//i.test(url)) {
      setMsg({ ok: false, text: t("supplierDispatch.errorTrackingInvalid") });
      return;
    }
    run(() => supplierBookLalamove(batch.id, url, bookingRef.trim() || undefined));
  };

  const steps = [
    {
      label: t("supplierDispatch.stepStartPacking"),
      doneLabel: t("supplierDispatch.stepStartPackingDone"),
      reached: started,
      note: started ? t("supplierDispatch.startedAt", { time: formatTime(batch.packing_started_at!) }) : t("adminBatches.notStarted"),
    },
    {
      label: t("supplierDispatch.stepPackingCompleted"),
      doneLabel: t("supplierDispatch.stepPackingCompleted"),
      reached: packed,
      note: packed ? t("supplierDispatch.completedAt", { time: formatTime(batch.packing_completed_at!) }) : t("adminBatches.notStarted"),
    },
    {
      label: t("supplierDispatch.stepBookLalamove"),
      doneLabel: t("supplierDispatch.stepBookLalamoveDone"),
      reached: booked,
      note: booked ? t("supplierDispatch.bookedAt", { time: formatTime(batch.lalamove_booked_at!) }) : t("adminBatches.notStarted"),
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="font-mono text-xs font-semibold text-forest-800">{batch.batch_code}</p>
          <p className="text-sm text-gray-600 mt-0.5">{batch.supplier_name || '—'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-semibold bg-cream-100 text-gray-700">
            {t("supplierDispatch.batchOrders", { count: batch.order_count })}
          </span>
        </div>
      </div>

      {batch.hub_arrived_at && (
        <div className="flex items-center gap-1.5 text-xs text-forest-700 bg-forest-50 border border-forest-200 rounded-xl px-3 py-2 mb-4">
          <CheckCircle2 size={14} /> {t("supplierDispatch.arrivedAt", { time: formatTime(batch.hub_arrived_at) })}
        </div>
      )}
      {batch.ready_for_rider_at && (
        <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-4">
          <Truck size={14} /> {t("supplierDispatch.readyForRiderAt", { time: formatTime(batch.ready_for_rider_at) })}
        </div>
      )}

      <div className="mb-5">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                s.reached ? 'bg-forest-600 text-white' : 'bg-cream-100 text-gray-400'
              }`}>
                {s.reached ? <CheckCircle2 size={16} /> : i === 0 ? <Package size={16} /> : i === 1 ? <PackageCheck size={16} /> : <Truck size={16} />}
              </div>
              {i < steps.length - 1 && <div className={`w-0.5 h-6 flex-1 min-h-[16px] ${s.reached ? 'bg-forest-500' : 'bg-cream-200'}`} />}
            </div>
            <div className="pb-4">
              <p className={`text-sm font-semibold ${s.reached ? 'text-gray-800' : 'text-gray-500'}`}>
                {s.reached ? s.doneLabel : s.label}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{s.note}</p>
            </div>
          </div>
        ))}
      </div>

      {!done && !started && (
        <button
          onClick={() => run(() => supplierStartPacking(batch.id))}
          disabled={busy}
          className="btn-primary inline-flex items-center gap-2 w-full justify-center disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
          {t("supplierDispatch.btnStartPacking")}
        </button>
      )}

      {!done && started && !packed && (
        <button
          onClick={() => run(() => supplierCompletePacking(batch.id))}
          disabled={busy}
          className="btn-primary inline-flex items-center gap-2 w-full justify-center disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
          {t("supplierDispatch.btnPackingCompleted")}
        </button>
      )}

      {!done && packed && !booked && (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>{t("supplierDispatch.trackingUrlLabel")} *</label>
            <input
              type="url"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder={t("supplierDispatch.trackingUrlPlaceholder")}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{t("supplierDispatch.bookingRefLabel")}</label>
            <input
              type="text"
              value={bookingRef}
              onChange={(e) => setBookingRef(e.target.value)}
              placeholder={t("supplierDispatch.bookingRefPlaceholder")}
              className={inputCls}
            />
          </div>
          <button
            onClick={book}
            disabled={busy}
            className="btn-primary inline-flex items-center gap-2 w-full justify-center disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
            {t("supplierDispatch.btnBookLalamove")}
          </button>
        </div>
      )}

      {booked && batch.lalamove_tracking_url && (
        <a
          href={batch.lalamove_tracking_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold text-forest-700 hover:text-forest-900 transition-colors"
        >
          <ExternalLink size={16} /> {t("supplierDispatch.trackingLink")}
        </a>
      )}

      {msg && (
        <p className={`flex items-center gap-1.5 text-sm mt-3 ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>
          {msg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {msg.text}
        </p>
      )}
    </div>
  );
}

export default function SupplierDispatchSection({ date, showHeader = true }: { date?: string; showHeader?: boolean }) {
  const { t } = useLanguage();
  const [batches, setBatches] = useState<DeliveryBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBatches(await fetchDeliveryBatchesForDate(date ?? formatLocalDate(new Date())));
    } catch (err) {
      console.error('[SupplierDispatch:load]', err);
      setError(String((err as { message?: unknown })?.message ?? err));
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const visible = batches?.filter((b) => b.status !== 'cancelled');

  if (batches === null) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="animate-spin text-forest-500" size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm mb-6">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }

  if (!visible || visible.length === 0) {
    if (showHeader) return null;
    return (
      <div className="rounded-xl border border-dashed border-cream-300 bg-cream-50/50 p-5 text-center">
        <p className="text-sm text-gray-500">{t("supplierDispatch.noBatchForDate")}</p>
      </div>
    );
  }

  return (
    <div className={showHeader ? 'mb-8' : ''}>
      {showHeader && (
        <div className="mb-4">
          <h2 className="font-display font-bold text-forest-900 text-xl">{t("supplierDispatch.title")}</h2>
          <p className="text-gray-500 text-sm mt-0.5">{t("supplierDispatch.subtitle")}</p>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visible.map((b) => (
          <BatchCard key={b.id} batch={b} t={t} onChanged={load} />
        ))}
      </div>
    </div>
  );
}
