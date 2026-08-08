import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2, AlertCircle, CheckCircle2, Printer, Truck, PackageCheck, Boxes, MapPin,
  Users, ClipboardCheck, Package,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type { DeliveryBatch, DeliveryBatchStatus } from '../../data/deliveryBatches';
import { adminMarkReadyForRider } from '../../data/deliveryBatches';
import {
  fetchDeliveryManifest,
  manifestSetPacked,
  manifestSetLoaded,
  type DeliveryManifest,
  type ManifestOrder,
  type ManifestProduct,
} from '../../data/deliveryManifest';

const STATUS_BADGE: Record<DeliveryBatchStatus, string> = {
  pending: 'bg-cream-100 text-gray-600',
  packing: 'bg-amber-100 text-amber-700',
  awaiting_lalamove: 'bg-sky-100 text-sky-700',
  in_transit_to_hub: 'bg-indigo-100 text-indigo-700',
  arrived_at_hub: 'bg-forest-100 text-forest-700',
  out_for_delivery: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const PAY_BADGE: Record<string, string> = {
  Paid: 'bg-green-50 text-green-700',
  'Ready To Pay': 'bg-orange-50 text-orange-700',
};

function productLabel(p: ManifestProduct): string {
  if (p.kg > 0 && p.count > 0) {
    return `${Math.round(p.count)} pcs / ${p.kg.toFixed(2).replace(/\.?0+$/, '')} kg`;
  }
  if (p.kg > 0) return `${p.kg.toFixed(2).replace(/\.?0+$/, '')} kg`;
  return String(Math.round(p.count));
}

function SectionCard({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 bg-cream-50 border-b border-cream-200">
        <span className="text-forest-700">{icon}</span>
        <h3 className="font-semibold text-forest-900 text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-cream-200 rounded-full h-2.5 overflow-hidden">
        <div className="bg-forest-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">{done} / {total}</span>
    </div>
  );
}

function ChecklistRow({
  order,
  kind,
  busy,
  onToggle,
  t,
}: {
  order: ManifestOrder;
  kind: 'packed' | 'loaded';
  busy: boolean;
  onToggle: (id: number, value: boolean) => void;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const value = kind === 'packed' ? order.packed : order.loaded;
  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border transition-colors ${value ? 'bg-forest-50 border-forest-200' : 'bg-white border-cream-200'}`}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{order.ref}</p>
        <p className="text-xs text-gray-500 truncate">{order.customer}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onToggle(order.id, true)}
          disabled={busy || value}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${value ? 'bg-forest-600 text-white border-forest-600 cursor-default' : 'text-gray-600 border-gray-200 hover:bg-forest-50'}`}
        >
          {value ? t("adminManifest.yes") : t("adminManifest.markYes")}
        </button>
        <button
          onClick={() => onToggle(order.id, false)}
          disabled={busy || !value}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${!value ? 'bg-gray-200 text-gray-500 border-gray-200 cursor-default' : 'text-red-600 border-red-200 hover:bg-red-50'}`}
        >
          {!value ? t("adminManifest.no") : t("adminManifest.markNo")}
        </button>
      </div>
    </div>
  );
}

export default function ManifestView({ batch, onSaved }: {
  batch: DeliveryBatch;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [manifest, setManifest] = useState<DeliveryManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setManifest(await fetchDeliveryManifest(batch.id));
    } catch (err) {
      console.error('[Manifest:load]', err);
      setError(String((err as { message?: unknown })?.message ?? err));
    } finally {
      setLoading(false);
    }
  }, [batch.id]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (orderId: number, kind: 'packed' | 'loaded', value: boolean) => {
    setBusyKey(`${orderId}:${kind}`);
    setSaved(null);
    setError(null);
    try {
      if (kind === 'packed') await manifestSetPacked(batch.id, orderId, value);
      else await manifestSetLoaded(batch.id, orderId, value);
      setManifest((m) =>
        m
          ? {
              ...m,
              orders: m.orders.map((o) =>
                o.id === orderId
                  ? {
                      ...o,
                      [kind]: value,
                      ...(kind === 'packed' ? { packedAt: value ? new Date().toISOString() : null } : { loadedAt: value ? new Date().toISOString() : null }),
                    }
                  : o
              ),
              packedCount: kind === 'packed' ? Math.max(0, m.packedCount + (value ? 1 : -1)) : m.packedCount,
              loadedCount: kind === 'loaded' ? Math.max(0, m.loadedCount + (value ? 1 : -1)) : m.loadedCount,
            }
          : m
      );
    } catch (err) {
      console.error('[Manifest:toggle]', err);
      setError(String((err as { message?: unknown })?.message ?? err));
    } finally {
      setBusyKey(null);
    }
  };

  const markReady = async () => {
    if (!manifest || manifest.loadedCount < manifest.totalOrders) return;
    setBusyKey('ready');
    setSaved(null);
    setError(null);
    try {
      await adminMarkReadyForRider(batch.id);
      setSaved(t("adminManifest.readyDone"));
      onSaved();
    } catch (err) {
      console.error('[Manifest:ready]', err);
      setError(String((err as { message?: unknown })?.message ?? err));
    } finally {
      setBusyKey(null);
    }
  };

  const handlePrint = () => {
    setPrintOpen(true);
    setTimeout(() => {
      window.print();
      setPrintOpen(false);
    }, 150);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-forest-500" size={28} />
      </div>
    );
  }

  if (error && !manifest) {
    return (
      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }

  if (!manifest) return null;

  const allPacked = manifest.totalOrders > 0 && manifest.packedCount >= manifest.totalOrders;
  const allLoaded = manifest.totalOrders > 0 && manifest.loadedCount >= manifest.totalOrders;
  const arrived = batch.status === 'arrived_at_hub';

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {manifest.totalOrders === 0 ? (
        <div className="bg-white rounded-2xl border border-cream-200 p-12 text-center">
          <Boxes size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">{t("adminManifest.empty")}</p>
        </div>
      ) : (
        <>
          {/* Section 1 — Batch Summary */}
          <SectionCard title={t("adminManifest.sectionSummary")} icon={<Boxes size={16} />}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <SummaryCell label={t("adminManifest.batchCode")} value={batch.batch_code} mono />
              <SummaryCell label={t("adminManifest.deliveryDate")} value={new Date(`${batch.delivery_date}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} />
              <SummaryCell label={t("adminManifest.supplier")} value={batch.supplier_name || '—'} />
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">{t("adminManifest.status")}</p>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[batch.status]}`}>
                  {t(`adminBatches.status.${batch.status}`)}
                </span>
              </div>
              <SummaryCell label={t("adminManifest.totalOrders")} value={String(manifest.totalOrders)} />
              <SummaryCell label={t("adminManifest.totalCustomers")} value={String(manifest.totalCustomers)} />
            </div>
          </SectionCard>

          {/* Section 2 — Delivery Points */}
          <SectionCard title={t("adminManifest.sectionPoints")} icon={<MapPin size={16} />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {manifest.points.map((p) => (
                <div key={p.name} className="flex items-center justify-between gap-3 rounded-xl bg-cream-50 border border-cream-200 px-3 py-2.5">
                  <span className="text-sm font-medium text-gray-800 truncate">{p.name}</span>
                  <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-semibold bg-white text-forest-700 border border-forest-200">
                    {p.orderCount}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-cream-200">
              <Users size={16} className="text-forest-700" />
              <span className="text-sm font-semibold text-gray-700">{t("adminManifest.totalStops")}: {manifest.totalStops}</span>
            </div>
          </SectionCard>

          {/* Section 3 — Products Summary */}
          <SectionCard title={t("adminManifest.sectionProducts")} icon={<Package size={16} />}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-200 text-left">
                    <th className="pb-2 font-semibold text-gray-600">{t("adminManifest.product")}</th>
                    <th className="pb-2 text-right font-semibold text-gray-600">{t("adminManifest.qty")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {manifest.products.map((p, i) => (
                    <tr key={`${p.name}-${i}`}>
                      <td className="py-2 text-gray-800">{p.name}</td>
                      <td className="py-2 text-right font-semibold text-forest-800 whitespace-nowrap">{productLabel(p)}</td>
                    </tr>
                  ))}
                  {manifest.products.length === 0 && (
                    <tr><td colSpan={2} className="py-3 text-gray-400">{t("adminManifest.noProducts")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Section 4 — Orders */}
          <SectionCard title={t("adminManifest.sectionOrders")} icon={<ClipboardCheck size={16} />}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-200 text-left">
                    <th className="pb-2 pr-2 font-semibold text-gray-600">{t("adminManifest.orderNumber")}</th>
                    <th className="pb-2 pr-2 font-semibold text-gray-600">{t("adminManifest.customer")}</th>
                    <th className="pb-2 pr-2 font-semibold text-gray-600">{t("adminManifest.deliveryPoint")}</th>
                    <th className="pb-2 pr-2 font-semibold text-gray-600">{t("adminManifest.paymentStatus")}</th>
                    <th className="pb-2 font-semibold text-gray-600">{t("adminManifest.items")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {manifest.orders.map((o) => (
                    <tr key={o.id} className="align-top">
                      <td className="py-2 pr-2 font-mono text-xs font-semibold text-forest-800 whitespace-nowrap">{o.ref}</td>
                      <td className="py-2 pr-2 text-gray-800">{o.customer}</td>
                      <td className="py-2 pr-2 text-gray-600">{o.pointName}</td>
                      <td className="py-2 pr-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PAY_BADGE[o.paymentStatus] ?? 'bg-amber-50 text-amber-700'}`}>
                          {o.paymentStatus}
                        </span>
                      </td>
                      <td className="py-2 text-gray-600 max-w-[260px]">
                        {o.items.map((it, i) => (
                          <div key={i} className="truncate">
                            <span className="font-medium text-gray-700">{it.name}</span> {it.detail}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Section 5 — Packing Checklist */}
          <SectionCard title={t("adminManifest.sectionPacking")} icon={<PackageCheck size={16} />}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <span className="text-sm text-gray-600">{t("adminManifest.packedProgress", { done: manifest.packedCount, total: manifest.totalOrders })}</span>
              <div className="flex-1"><ProgressBar done={manifest.packedCount} total={manifest.totalOrders} /></div>
            </div>
            {allPacked && (
              <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
                <CheckCircle2 size={16} /> {t("adminManifest.packingComplete")}
              </div>
            )}
            <div className="space-y-2">
              {manifest.orders.map((o) => (
                <ChecklistRow key={o.id} order={o} kind="packed" busy={busyKey === `${o.id}:packed`} onToggle={(id, v) => toggle(id, 'packed', v)} t={t} />
              ))}
            </div>
          </SectionCard>

          {/* Section 6 — Loading Checklist */}
          <SectionCard title={t("adminManifest.sectionLoading")} icon={<Truck size={16} />}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <span className="text-sm text-gray-600">{t("adminManifest.loadedProgress", { done: manifest.loadedCount, total: manifest.totalOrders })}</span>
              <div className="flex-1"><ProgressBar done={manifest.loadedCount} total={manifest.totalOrders} /></div>
            </div>
            <div className="space-y-2">
              {manifest.orders.map((o) => (
                <ChecklistRow key={o.id} order={o} kind="loaded" busy={busyKey === `${o.id}:loaded`} onToggle={(id, v) => toggle(id, 'loaded', v)} t={t} />
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-cream-200">
              {batch.ready_for_rider_at ? (
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle2 size={16} /> {t("adminManifest.readyDone")}
                </div>
              ) : (
                <button
                  onClick={markReady}
                  disabled={!allLoaded || busyKey === 'ready'}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${allLoaded ? 'text-white bg-forest-600 hover:bg-forest-700' : 'text-gray-500 bg-gray-100 cursor-not-allowed'}`}
                >
                  {busyKey === 'ready' ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
                  {t("adminManifest.readyForRider")}
                </button>
              )}
              {!allLoaded && arrived && (
                <p className="text-xs text-gray-500 mt-2">{t("adminManifest.loadAllFirst")}</p>
              )}
            </div>
          </SectionCard>
        </>
      )}

      {/* Section 7 — Print */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 bg-cream-50 border border-cream-200 rounded-2xl">
        <div>
          <h3 className="font-semibold text-forest-900 text-sm">{t("adminManifest.printTitle")}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{t("adminManifest.printHint")}</p>
        </div>
        <button
          onClick={handlePrint}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Printer size={16} /> {t("adminManifest.printButton")}
        </button>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
          <CheckCircle2 size={16} /> {saved}
        </div>
      )}

      {printOpen && manifest && createPortal(
        <PrintManifest manifest={manifest} batch={batch} t={t} />,
        document.body
      )}
    </div>
  );
}

function SummaryCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1.5">{label}</p>
      <p className={`text-sm text-gray-800 truncate ${mono ? 'font-mono font-semibold text-forest-800' : 'font-medium'}`}>{value}</p>
    </div>
  );
}

function PrintManifest({ manifest, batch, t }: {
  manifest: DeliveryManifest;
  batch: DeliveryBatch;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const now = new Date().toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="manifest-print-area hidden">
      <div className="px-2 py-1 text-sm text-gray-900">
        <div className="flex items-start justify-between border-b-2 border-gray-800 pb-3 mb-4">
          <div>
            <h1 className="text-xl font-bold uppercase">{t("adminManifest.printHeader")}</h1>
            <p className="text-sm mt-1">{t("adminManifest.batchCode")}: <strong>{batch.batch_code}</strong> &nbsp;·&nbsp; {t("adminManifest.deliveryDate")}: <strong>{batch.delivery_date}</strong></p>
          </div>
          <div className="text-right text-xs text-gray-700">
            <p>{t("adminManifest.printedAt", { time: now })}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-5 text-xs">
          <PrintCell label={t("adminManifest.supplier")} value={batch.supplier_name || '—'} />
          <PrintCell label={t("adminManifest.status")} value={t(`adminBatches.status.${batch.status}`)} />
          <PrintCell label={t("adminManifest.totalOrders")} value={String(manifest.totalOrders)} />
          <PrintCell label={t("adminManifest.totalStops")} value={String(manifest.totalStops)} />
        </div>

        <h2 className="text-sm font-bold uppercase tracking-wide mb-2 border-b border-gray-300 pb-1">{t("adminManifest.printProducts")}</h2>
        <table className="w-full text-xs mb-5">
          <thead>
            <tr className="border-b border-gray-400 text-left">
              <th className="py-1 pr-2 font-semibold">{t("adminManifest.product")}</th>
              <th className="py-1 text-right font-semibold">{t("adminManifest.qty")}</th>
            </tr>
          </thead>
          <tbody>
            {manifest.products.map((p, i) => (
              <tr key={`${p.name}-${i}`} className="border-b border-gray-200">
                <td className="py-1 pr-2">{p.name}</td>
                <td className="py-1 text-right font-semibold">{productLabel(p)}</td>
              </tr>
            ))}
            {manifest.products.length === 0 && (
              <tr><td className="py-1" colSpan={2}>{t("adminManifest.noProducts")}</td></tr>
            )}
          </tbody>
        </table>

        <h2 className="text-sm font-bold uppercase tracking-wide mb-2 border-b border-gray-300 pb-1">{t("adminManifest.printPoints")}</h2>
        <table className="w-full text-xs mb-5">
          <tbody>
            {manifest.points.map((p) => (
              <tr key={p.name} className="border-b border-gray-200">
                <td className="py-1">{p.name}</td>
                <td className="py-1 text-right font-semibold">{p.orderCount} {t("adminManifest.ordersShort")}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="text-sm font-bold uppercase tracking-wide mb-2 border-b border-gray-300 pb-1">{t("adminManifest.printOrders")}</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-400 text-left">
              <th className="py-1 pr-2 font-semibold">{t("adminManifest.orderNumber")}</th>
              <th className="py-1 pr-2 font-semibold">{t("adminManifest.customer")}</th>
              <th className="py-1 pr-2 font-semibold">{t("adminManifest.deliveryPoint")}</th>
              <th className="py-1 font-semibold">{t("adminManifest.items")}</th>
            </tr>
          </thead>
          <tbody>
            {manifest.orders.map((o) => (
              <tr key={o.id} className="border-b border-gray-200 align-top">
                <td className="py-1 pr-2 font-semibold whitespace-nowrap">{o.ref}</td>
                <td className="py-1 pr-2">{o.customer}</td>
                <td className="py-1 pr-2">{o.pointName}</td>
                <td className="py-1">
                  {o.items.map((it, i) => (
                    <div key={i}>{it.name} {it.detail}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between text-xs text-gray-600 mt-6 pt-3 border-t border-gray-300">
          <span>{batch.hub_name}</span>
          <span>{t("adminManifest.printFooter")}</span>
        </div>
      </div>
    </div>
  );
}

function PrintCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="font-semibold mt-0.5">{value}</p>
    </div>
  );
}
