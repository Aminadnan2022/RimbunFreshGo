import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, Plus, Pencil, Save, Trash2, CheckCircle2, AlertCircle, AlertTriangle,
  Boxes, Search, X, Eye, ExternalLink, Truck, Package, PackageCheck,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import ManifestView from './ManifestView';
import CanonicalSupplierDeliveryBatches from './CanonicalSupplierDeliveryBatches';
import {
  fetchDeliveryBatches,
  createDeliveryBatch,
  updateDeliveryBatch,
  deleteDeliveryBatch,
  countOrdersInBatch,
  adminConfirmHubArrival,
  adminMarkReadyForRider,
  DELIVERY_BATCH_STATUSES,
  type DeliveryBatch,
  type DeliveryBatchStatus,
} from '../../data/deliveryBatches';

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

const STATUS_LABEL_KEY = (s: DeliveryBatchStatus) => `adminBatches.status.${s}`;

interface Draft {
  delivery_date: string;
  supplier_name: string;
  supplier_notes: string;
  status: DeliveryBatchStatus;
  lalamove_tracking_url: string;
}

const emptyDraft = (): Draft => ({
  delivery_date: '',
  supplier_name: '',
  supplier_notes: '',
  status: 'pending',
  lalamove_tracking_url: '',
});

const inputCls =
  'w-full bg-cream-50 border border-cream-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-all';
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1.5';

function describeError(err: unknown, fallback: string): string {
  const e = err as { message?: unknown; details?: unknown; hint?: unknown } | null | undefined;
  const parts = [
    typeof e?.message === 'string' ? e.message : undefined,
    typeof e?.details === 'string' ? e.details : undefined,
    typeof e?.hint === 'string' ? e.hint : undefined,
  ].filter((p): p is string => typeof p === 'string' && p.trim() !== '');
  return parts.length ? parts.join(' — ') : fallback;
}

function logError(scope: string, err: unknown): void {
  console.error(`[DeliveryBatches:${scope}]`, err);
  try {
    console.error(`[DeliveryBatches:${scope}] body:`, JSON.stringify(err, null, 2));
  } catch {
    // ignore non-serializable errors
  }
}

export default function DeliveryBatchesManager() {
  const { t } = useLanguage();
  const [batches, setBatches] = useState<DeliveryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryBatch | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; code: string } | null>(null);
  const [detail, setDetail] = useState<DeliveryBatch | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'manifest'>('overview');
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailMsg, setDetailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBatches(await fetchDeliveryBatches());
    } catch (err) {
      logError('load', err);
      setError(describeError(err, t("adminBatches.failedLoad")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter((b) => {
      const supplier = b.supplier_name ?? '';
      return (
        b.batch_code.toLowerCase().includes(q) ||
        supplier.toLowerCase().includes(q) ||
        b.delivery_date.includes(q)
      );
    });
  }, [batches, search]);

  const notify = (msg: string, ok = true) => {
    setStatus(ok ? 'success' : 'error');
    setErrorMsg(msg);
    setTimeout(() => setStatus('idle'), 4000);
  };

  const openAdd = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setErrorMsg('');
    setStatus('idle');
    setFormOpen(true);
  };

  const openEdit = (b: DeliveryBatch) => {
    setEditing(b);
    setDraft({
      delivery_date: b.delivery_date,
      supplier_name: b.supplier_name ?? '',
      supplier_notes: b.supplier_notes ?? '',
      status: b.status,
      lalamove_tracking_url: b.lalamove_tracking_url ?? '',
    });
    setErrorMsg('');
    setStatus('idle');
    setFormOpen(true);
  };

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const persist = async () => {
    if (!draft.delivery_date) {
      setStatus('error');
      setErrorMsg(t("adminBatches.fieldDateRequired"));
      return;
    }
    setSaving(true);
    setStatus('idle');
    try {
      const payload = {
        supplier_name: draft.supplier_name.trim() || null,
        supplier_notes: draft.supplier_notes.trim() || null,
        status: draft.status,
        lalamove_tracking_url: draft.lalamove_tracking_url.trim() || null,
      };
      if (editing) {
        await updateDeliveryBatch(editing.id, payload);
      } else {
        await createDeliveryBatch({
          delivery_date: draft.delivery_date,
          ...payload,
        });
      }
      setFormOpen(false);
      setEditing(null);
      notify(t("adminBatches.saved"));
      await load();
    } catch (err) {
      logError('save', err);
      setStatus('error');
      setErrorMsg(describeError(err, t("adminBatches.failedSave")));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      const assigned = await countOrdersInBatch(deleteTarget.id);
      if (assigned > 0) {
        setStatus('error');
        setErrorMsg(t("adminBatches.deleteNotEmpty"));
        setDeleteTarget(null);
        return;
      }
      await deleteDeliveryBatch(deleteTarget.id);
      setDeleteTarget(null);
      notify(t("adminBatches.deleted"));
      await load();
    } catch (err) {
      logError('delete', err);
      if (err instanceof Error && err.message === 'BATCH_HAS_ORDERS') {
        setStatus('error');
        setErrorMsg(t("adminBatches.deleteNotEmpty"));
      } else {
        setError(describeError(err, t("adminBatches.failedDelete")));
      }
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  };

  const runDetailAction = async (fn: () => Promise<void>, failMsg?: string) => {
    if (!detail) return;
    setDetailBusy(true);
    setDetailMsg(null);
    try {
      await fn();
      setDetailMsg({ ok: true, text: t("adminBatches.saved") });
      setDetail(await fetchDeliveryBatches().then((list) => list.find((b) => b.id === detail.id) ?? null));
      await load();
    } catch (err) {
      logError('detail-action', err);
      setDetailMsg({ ok: false, text: describeError(err, failMsg ?? t("adminBatches.failedSave")) });
    } finally {
      setDetailBusy(false);
    }
  };

  const timeline = detail
    ? [
        {
          label: t("adminBatches.tlStartPacking"),
          when: detail.packing_started_at,
        },
        {
          label: t("adminBatches.tlPackingCompleted"),
          when: detail.packing_completed_at,
        },
        {
          label: t("adminBatches.tlLalamoveBooked"),
          when: detail.lalamove_booked_at,
        },
        {
          label: t("adminBatches.tlHubArrived"),
          when: detail.hub_arrived_at,
        },
        {
          label: t("adminBatches.tlReadyForRider"),
          when: detail.ready_for_rider_at,
        },
      ]
    : [];

  const formatWhen = (iso: string | null): string => {
    if (!iso) return t("adminBatches.notStarted");
    return new Date(iso).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-8">
      <CanonicalSupplierDeliveryBatches />

      <div className="border-t border-cream-200 pt-8">
        <div className="mb-4">
          <h2 className="font-semibold text-gray-800 text-sm">Legacy Delivery Batches</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Historical / legacy Orders workflow. Canonical orders do not use this section.
          </p>
        </div>

      <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-forest-900 text-base">{t("adminBatches.title")}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t("adminBatches.description")}</p>
        </div>
        <button onClick={openAdd} className="btn-primary inline-flex items-center gap-2 self-start">
          <Plus size={18} />
          {t("adminBatches.add")}
        </button>
      </div>

      {(status === 'success' || status === 'error') && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${status === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-100 text-red-600'}`}>
          {status === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {errorMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("adminBatches.searchPlaceholder")}
          className="input-field pl-11"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-forest-500" size={28} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-12 text-center">
          <Boxes size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">{search ? t("adminBatches.noResults") : t("adminBatches.empty")}</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cream-50 border-b border-cream-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">{t("adminBatches.tableCode")}</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">{t("adminBatches.tableDate")}</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">{t("adminBatches.tableSupplier")}</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">{t("adminBatches.tableStatus")}</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">{t("adminBatches.tableOrders")}</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">{t("adminBatches.tableCreated")}</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">{t("adminBatches.tableActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {filtered.map((b) => (
                    <tr key={b.id} className="hover:bg-cream-50/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-forest-800">{b.batch_code}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {new Date(`${b.delivery_date}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{b.supplier_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[b.status]}`}>
                          {t(STATUS_LABEL_KEY(b.status))}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-semibold bg-cream-100 text-gray-700">
                          {b.order_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell whitespace-nowrap">
                        {new Date(b.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setDetailMsg(null); setDetailTab('overview'); setDetail(b); }}
                            className="p-2 rounded-lg text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all"
                            title={t("adminBatches.view")}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => openEdit(b)}
                            className="p-2 rounded-lg text-forest-700 border border-forest-200 hover:bg-forest-50 transition-all"
                            title={t("adminBatches.edit")}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ id: b.id, code: b.batch_code })}
                            className="p-2 rounded-lg text-red-600 border border-red-200 hover:bg-red-50 transition-all"
                            title={t("adminBatches.delete")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="text-right text-xs text-gray-400 mt-2">
            {search.trim()
              ? t("adminBatches.showing", { count: filtered.length, total: batches.length })
              : t("adminBatches.count", { count: filtered.length })}
          </div>
        </>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && setFormOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 animate-[fadeSlideUp_0.2s_ease-out] max-h-[90vh] overflow-y-auto">
            <button onClick={() => setFormOpen(false)} disabled={saving} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-forest-50 flex items-center justify-center flex-shrink-0">
                <Boxes size={20} className="text-forest-700" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{editing ? t("adminBatches.editTitle") : t("adminBatches.newTitle")}</h3>
            </div>

            {!editing && (
              <div className="mb-4 p-3 bg-cream-50 border border-cream-200 rounded-xl">
                <p className="text-xs font-semibold text-gray-500 mb-0.5">{t("adminBatches.batchCodeLabel")}</p>
                <p className="text-sm font-mono text-forest-800">{t("adminBatches.batchCodeAuto")}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>{t("adminBatches.fieldDate")} *</label>
                <input
                  type="date"
                  value={draft.delivery_date}
                  onChange={(e) => set({ delivery_date: e.target.value })}
                  disabled={!!editing}
                  className={`${inputCls} ${editing ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
              <div>
                <label className={labelCls}>{t("adminBatches.fieldStatus")} *</label>
                <select value={draft.status} onChange={(e) => set({ status: e.target.value as DeliveryBatchStatus })} className={inputCls}>
                  {DELIVERY_BATCH_STATUSES.map((s) => (
                    <option key={s} value={s}>{t(STATUS_LABEL_KEY(s))}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t("adminBatches.fieldSupplier")}</label>
                <input
                  type="text"
                  value={draft.supplier_name}
                  onChange={(e) => set({ supplier_name: e.target.value })}
                  placeholder={t("adminBatches.fieldSupplierPlaceholder")}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t("adminBatches.fieldTracking")}</label>
                <input
                  type="url"
                  value={draft.lalamove_tracking_url}
                  onChange={(e) => set({ lalamove_tracking_url: e.target.value })}
                  placeholder={t("adminBatches.fieldTrackingPlaceholder")}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="mb-4">
              <label className={labelCls}>{t("adminBatches.fieldNotes")}</label>
              <textarea
                value={draft.supplier_notes}
                onChange={(e) => set({ supplier_notes: e.target.value })}
                rows={2}
                className={inputCls}
                placeholder={t("adminBatches.fieldNotesPlaceholder")}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setFormOpen(false)} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-50">
                {t("adminBatches.cancel")}
              </button>
              <button onClick={persist} disabled={saving} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? t("adminBatches.saving") : t("adminBatches.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-[fadeSlideUp_0.2s_ease-out]">
            <button onClick={() => setDeleteTarget(null)} disabled={saving} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{t("adminBatches.deleteTitle")}</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {t("adminBatches.deleteConfirm", { code: deleteTarget.code })}{' '}
              {t("adminBatches.deleteBody")}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all">
                {t("adminBatches.cancel")}
              </button>
              <button onClick={confirmDelete} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50">
                {saving ? t("adminBatches.deleting") : t("adminBatches.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !detailBusy && setDetail(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl p-6 animate-[fadeSlideUp_0.2s_ease-out] max-h-[90vh] overflow-y-auto">
            <button onClick={() => setDetail(null)} disabled={detailBusy} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-forest-50 flex items-center justify-center flex-shrink-0">
                <Boxes size={20} className="text-forest-700" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">{t("adminBatches.detailTitle")}</h3>
                <p className="text-xs text-gray-500">{t("adminBatches.detailSubtitle")}</p>
              </div>
            </div>

            <div className="flex gap-2 mb-5 border-b border-cream-200">
              <TabButton active={detailTab === 'overview'} onClick={() => setDetailTab('overview')} label={t("adminBatches.overviewTab")} />
              <TabButton active={detailTab === 'manifest'} onClick={() => setDetailTab('manifest')} label={t("adminBatches.manifestTab")} />
            </div>

            {detailTab === 'overview' ? (
            <div>
            <div className="rounded-xl bg-cream-50 border border-cream-200 p-4 mb-5">
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                <div>
                  <p className="text-xs font-semibold text-gray-500">{t("adminBatches.batchCodeLabel")}</p>
                  <p className="font-mono text-sm font-semibold text-forest-800">{detail.batch_code}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500">{t("adminBatches.detailDate")}</p>
                  <p className="text-sm text-gray-800">{new Date(`${detail.delivery_date}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500">{t("adminBatches.detailSupplier")}</p>
                  <p className="text-sm text-gray-800">{detail.supplier_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500">{t("adminBatches.detailOrders")}</p>
                  <p className="text-sm text-gray-800">{detail.order_count}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500">{t("adminBatches.tableStatus")}</p>
                  <span className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[detail.status]}`}>
                    {t(STATUS_LABEL_KEY(detail.status))}
                  </span>
                </div>
              </div>
              {(detail.lalamove_tracking_url || detail.booking_reference) && (
                <div className="mt-3 pt-3 border-t border-cream-200 flex flex-col gap-1">
                  <p className="text-xs font-semibold text-gray-500">{t("adminBatches.detailTracking")}</p>
                  <a href={detail.lalamove_tracking_url ?? '#'} target="_blank" rel="noopener noreferrer"
                     className={`inline-flex items-center gap-1.5 text-sm ${detail.lalamove_tracking_url ? 'text-forest-700 hover:underline' : 'text-gray-400 pointer-events-none'}`}>
                    <ExternalLink size={14} /> {detail.lalamove_tracking_url || '—'}
                  </a>
                  {detail.booking_reference && (
                    <p className="text-sm text-gray-700">{t("adminBatches.detailBookingRef")}: {detail.booking_reference}</p>
                  )}
                </div>
              )}
            </div>

            <p className="text-sm font-semibold text-gray-800 mb-3">{t("adminBatches.supplierProgress")}</p>
            <div className="mb-6">
              {timeline.map((s, i) => {
                const reached = s.when != null;
                const icon = i === 0 ? <Package size={14} /> : i === 1 ? <PackageCheck size={14} /> : i === 2 ? <Truck size={14} /> : <CheckCircle2 size={14} />;
                return (
                  <div key={s.label} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${reached ? 'bg-forest-600 text-white' : 'bg-cream-100 text-gray-400'}`}>
                        {icon}
                      </div>
                      {i < timeline.length - 1 && <div className={`w-0.5 h-6 ${reached ? 'bg-forest-500' : 'bg-cream-200'}`} />}
                    </div>
                    <div className="pb-4">
                      <p className={`text-sm font-semibold ${reached ? 'text-gray-800' : 'text-gray-500'}`}>{s.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatWhen(s.when)}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {detailMsg && (
              <p className={`flex items-center gap-1.5 text-sm mb-4 ${detailMsg.ok ? 'text-green-700' : 'text-red-600'}`}>
                {detailMsg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {detailMsg.text}
              </p>
            )}

            <div className="flex flex-wrap gap-3 justify-end">
              {detail.status === 'in_transit_to_hub' && (
                <button
                  onClick={() => runDetailAction(() => adminConfirmHubArrival(detail.id), t("adminBatches.failedSave"))}
                  disabled={detailBusy}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-forest-600 hover:bg-forest-700 transition-all disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {detailBusy ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
                  {t("adminBatches.confirmArrived")}
                </button>
              )}
              {detail.status === 'arrived_at_hub' && (
                <button
                  onClick={() => runDetailAction(() => adminMarkReadyForRider(detail.id))}
                  disabled={detailBusy}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-forest-600 hover:bg-forest-700 transition-all disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {detailBusy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {t("adminBatches.markReady")}
                </button>
              )}
              <button onClick={() => setDetail(null)} disabled={detailBusy} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all">
                {t("adminBatches.cancel")}
              </button>
            </div>
            </div>
            ) : (
              <ManifestView batch={detail} onSaved={load} />
            )}
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 rounded-t-xl text-sm font-semibold border-b-2 transition-all -mb-px ${
        active ? 'border-forest-600 text-forest-800 bg-forest-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-cream-50'
      }`}
    >
      {label}
    </button>
  );
}
