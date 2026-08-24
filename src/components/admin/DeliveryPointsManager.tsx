import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, Plus, Pencil, Save, CheckCircle2, AlertCircle, AlertTriangle,
  MapPin, Search, X,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  fetchDeliveryPoints,
  saveDeliveryPoint,
  updateDeliveryPoint,
  deleteDeliveryPoint,
  reorderDeliveryPoints,
  type DeliveryPoint,
  type DeliveryMethod,
} from '../../data/delivery';
import SortableList from './SortableList';
import SortableRow from './SortableRow';
import RowMenu from './sortable/RowMenu';
import { ToggleSwitch } from './settings/shared';

const DELIVERY_METHODS: DeliveryMethod[] = [
  'Lobby Collection',
  'Security Collection',
  'Customer Come Down',
  'Doorstep Delivery',
];

interface Draft {
  name: string;
  area: string;
  delivery_fee: string;
  delivery_method: string;
  display_order: string;
  active: boolean;
  pickup_notes: string;
  latitude: string;
  longitude: string;
}

const emptyDraft = (): Draft => ({
  name: '',
  area: '',
  delivery_fee: '2',
  delivery_method: 'Customer Come Down',
  display_order: '',
  active: true,
  pickup_notes: '',
  latitude: '',
  longitude: '',
});

const inputCls =
  'w-full bg-cream-50 border border-cream-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-all';
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1.5';
const noTableHandoverNote = 'Please come down to collect your order; the delivery rider will wait in the vehicle until you arrive for handover.';

const defaultHandoverNote = (name: string, area: string): string | null =>
  /emas|parkland/i.test(`${name} ${area}`) ? noTableHandoverNote : null;

const numOrNull = (raw: string): number | null => {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return isNaN(n) ? null : n;
};

/**
 * Supabase (postgrest-js) throws a PostgrestError object that often does NOT
 * satisfy `instanceof Error` in the installed version, so `err instanceof Error
 * ? err.message : fallback` silently hides the real cause (e.g. the 400 body).
 * Extract every available field (message/details/hint/code) and log the full
 * object so the real server response is never lost.
 */
function logSupabaseError(scope: string, err: unknown): void {
  console.error(`[DeliveryPoints:${scope}]`, err);
  try {
    console.error(`[DeliveryPoints:${scope}] body:`, JSON.stringify(err, null, 2));
  } catch {
    // non-serializable error; already logged above
  }
}

function describeError(err: unknown, fallback: string): string {
  const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown; status?: unknown } | null | undefined;
  const parts = [
    typeof e?.message === 'string' ? e.message : undefined,
    typeof e?.details === 'string' ? e.details : undefined,
    typeof e?.hint === 'string' ? e.hint : undefined,
  ].filter((p): p is string => typeof p === 'string' && p.trim() !== '');
  return parts.length ? parts.join(' — ') : fallback;
}

export default function DeliveryPointsManager() {
  const { t } = useLanguage();
  const [points, setPoints] = useState<DeliveryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryPoint | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPoints(await fetchDeliveryPoints());
    } catch (err) {
      logSupabaseError('load', err);
      setError(describeError(err, t("adminDelivery.points.failedLoad")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return points;
    return points.filter((p) => {
      const fee = String(p.delivery_fee).toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.area ?? '').toLowerCase().includes(q) ||
        fee.includes(q)
      );
    });
  }, [points, search]);

  const canReorder = search.trim().length === 0;

  const notify = (msg: string, ok = true) => {
    setStatus(ok ? 'success' : 'error');
    setErrorMsg(msg);
    setTimeout(() => setStatus('idle'), 4000);
  };

  const openAdd = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setFormError(null);
    setErrorMsg('');
    setStatus('idle');
    setFormOpen(true);
  };

  const openEdit = (p: DeliveryPoint) => {
    setEditing(p);
    setDraft({
      name: p.name,
      area: p.area ?? '',
      delivery_fee: String(p.delivery_fee),
      delivery_method: p.delivery_method,
      display_order: String(p.display_order),
      active: p.active,
      pickup_notes: p.pickup_notes ?? '',
      latitude: p.latitude != null ? String(p.latitude) : '',
      longitude: p.longitude != null ? String(p.longitude) : '',
    });
    setFormError(null);
    setErrorMsg('');
    setStatus('idle');
    setFormOpen(true);
  };

  const set = (patch: Partial<Draft>) => setDraft((d) => {
    const next = { ...d, ...patch };
    const changingLocation = patch.name !== undefined || patch.area !== undefined;
    if (changingLocation && !next.pickup_notes.trim()) {
      next.pickup_notes = defaultHandoverNote(next.name, next.area) ?? '';
    }
    return next;
  });

  const validate = (): string | null => {
    if (!draft.name.trim()) return t("adminDelivery.points.nameRequired");
    if (!draft.area.trim()) return t("adminDelivery.points.areaRequired");
    const fee = Number(draft.delivery_fee);
    if (!isFinite(fee) || fee < 0) return t("adminDelivery.points.feeInvalid");
    if (draft.display_order.trim() !== '') {
      const ord = Number(draft.display_order);
      if (!Number.isInteger(ord) || ord < 1) return t("adminDelivery.points.displayOrderInvalid");
    }
    return null;
  };

  const persist = async () => {
    const validationError = validate();
    if (validationError) {
      setStatus('error');
      setErrorMsg(validationError);
      setFormError(validationError);
      return;
    }
    setSaving(true);
    setStatus('idle');
    setFormError(null);
    try {
      const fee = Number(draft.delivery_fee);
      const display_order = draft.display_order.trim() !== ''
        ? Number(draft.display_order)
        : points.length ? Math.max(...points.map((p) => p.display_order)) + 1 : 1;
      const payload = {
        name: draft.name.trim(),
        area: draft.area.trim(),
        delivery_fee: fee,
        delivery_method: draft.delivery_method as DeliveryMethod,
        display_order,
        active: draft.active,
        pickup_notes: draft.pickup_notes.trim() || null,
        latitude: numOrNull(draft.latitude),
        longitude: numOrNull(draft.longitude),
      };
      if (editing) {
        await updateDeliveryPoint(editing.id, payload);
      } else {
        if (points.some((p) => p.name.toLowerCase() === payload.name.toLowerCase())) {
          setStatus('error');
          setErrorMsg(t("adminDelivery.points.nameExists"));
          setFormError(t("adminDelivery.points.nameExists"));
          setSaving(false);
          return;
        }
        await saveDeliveryPoint({ id: 0, ...payload });
      }
      setFormOpen(false);
      setEditing(null);
      notify(t("adminSettings.messages.saved"));
      await load();
    } catch (err) {
      logSupabaseError('save', err);
      setStatus('error');
      const message = describeError(err, t("adminDelivery.points.failedSave"));
      setErrorMsg(message);
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: DeliveryPoint) => {
    try {
      await updateDeliveryPoint(p.id, { active: !p.active });
      await load();
    } catch (err) {
      logSupabaseError('toggle', err);
      setError(describeError(err, t("adminDelivery.points.failedSave")));
    }
  };

  const handleDragEnd = async (oldIndex: number, newIndex: number) => {
    if (oldIndex === newIndex) return;
    const next = [...filtered];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    setSavingOrder(true);
    try {
      await reorderDeliveryPoints(next.map((p) => p.id));
      setPoints(next);
      notify(t("adminDelivery.points.reordered"));
    } catch (err) {
      logSupabaseError('reorder', err);
      setError(describeError(err, t("adminDelivery.points.failedSave")));
      await load();
    } finally {
      setSavingOrder(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await deleteDeliveryPoint(deleteTarget.id);
      setDeleteTarget(null);
      notify(t("adminDelivery.points.deleted"));
      await load();
    } catch (err) {
      logSupabaseError('delete', err);
      setError(describeError(err, t("adminDelivery.points.failedDelete")));
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-forest-900 text-base">{t("adminDelivery.points.title")}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t("adminDelivery.points.description")}</p>
        </div>
        <button
          onClick={openAdd}
          className="btn-primary inline-flex items-center gap-2 self-start"
        >
          <Plus size={18} />
          {t("adminDelivery.points.add")}
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
          placeholder={t("adminDelivery.points.searchPlaceholder")}
          className="input-field pl-11"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-forest-500" size={28} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-12 text-center">
          <MapPin size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">{search ? t("adminDelivery.points.noResults") : t("adminDelivery.points.empty")}</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden">
            <div className="flex items-center gap-3 pl-[30px] pr-3 py-2 bg-cream-50/70 border-b border-cream-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span className="w-8 shrink-0 text-center">{t("adminDelivery.points.tableOrder")}</span>
              <span className="flex-1 min-w-0">{t("adminDelivery.points.tableName")}</span>
              <span className="hidden md:block w-40 shrink-0">{t("adminDelivery.points.tableArea")}</span>
              <span className="w-24 shrink-0 text-right">{t("adminDelivery.points.tableFee")}</span>
              <span className="w-24 shrink-0 text-center">{t("adminDelivery.points.tableStatus")}</span>
              <span className="w-12 shrink-0 text-center">{t("adminDelivery.points.tableActions")}</span>
            </div>
            <SortableList ids={filtered.map((p) => String(p.id))} onDragEnd={handleDragEnd} disabled={!canReorder}>
              <div className="divide-y divide-cream-100">
                {filtered.map((p) => (
                  <SortableRow key={p.id} id={String(p.id)} disabled={!canReorder} className="bg-white">
                    <div className="flex items-center gap-3 pr-3">
                      <span className="w-8 text-center text-xs font-semibold text-gray-400 tabular-nums">{p.display_order}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 truncate">{p.name}</p>
                          <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-forest-700 bg-forest-50 uppercase tracking-wide">
                            {p.delivery_method}
                          </span>
                        </div>
                      </div>
                      <span className="hidden md:block w-40 text-sm text-gray-600 truncate">{p.area || '—'}</span>
                      <span className="w-24 text-right font-medium text-gray-900 whitespace-nowrap">RM{p.delivery_fee.toFixed(2)}</span>
                      <span className="w-24 flex justify-center">
                        <ToggleSwitch checked={p.active} onChange={() => toggleActive(p)} disabled={saving} />
                      </span>
                      <div className="w-12 flex items-center justify-center gap-0.5 shrink-0">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-2 rounded-lg text-gray-500 hover:text-forest-700 hover:bg-forest-50 transition-all"
                          title={t("adminDelivery.points.edit")}
                        >
                          <Pencil size={16} />
                        </button>
                        <RowMenu
                          title={t("adminDelivery.points.actions")}
                          actions={[
                            {
                              key: 'toggle',
                              label: p.active ? t("adminDelivery.points.disable") : t("adminDelivery.points.enable"),
                              onClick: () => toggleActive(p),
                            },
                            {
                              key: 'delete',
                              label: t("adminDelivery.points.delete"),
                              danger: true,
                              onClick: () => setDeleteTarget({ id: p.id, name: p.name }),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </SortableRow>
                ))}
              </div>
            </SortableList>
          </div>
          <div className="text-right text-xs text-gray-400 mt-2">
            {search.trim()
              ? t("adminDelivery.points.showing", { count: filtered.length, total: points.length })
              : t("adminDelivery.points.count", { count: filtered.length })}
            {savingOrder && <span className="ml-2 inline-flex items-center gap-1 text-forest-600"><Loader2 size={12} className="animate-spin" /></span>}
          </div>
        </>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && setFormOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 animate-[fadeSlideUp_0.2s_ease-out] max-h-[90vh] overflow-y-auto">
            <button onClick={() => setFormOpen(false)} disabled={saving} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-forest-50 flex items-center justify-center flex-shrink-0">
                <MapPin size={20} className="text-forest-700" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{editing ? t("adminDelivery.points.editTitle") : t("adminDelivery.points.newTitle")}</h3>
            </div>

            {formError && (
              <div className="flex items-start gap-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm" role="alert">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>{t("adminDelivery.points.name")} *</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder={t("adminDelivery.points.namePlaceholder")}
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div>
                <label className={labelCls}>{t("adminDelivery.points.area")} *</label>
                <input
                  type="text"
                  value={draft.area}
                  onChange={(e) => set({ area: e.target.value })}
                  placeholder={t("adminDelivery.points.areaPlaceholder")}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t("adminDelivery.points.fee")} *</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft.delivery_fee}
                  onChange={(e) => set({ delivery_fee: e.target.value })}
                  className={inputCls}
                  placeholder="2.00"
                />
              </div>
              <div>
                <label className={labelCls}>{t("adminDelivery.points.displayOrder")}</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={draft.display_order}
                  onChange={(e) => set({ display_order: e.target.value })}
                  className={inputCls}
                  placeholder={String(points.length ? Math.max(...points.map((p) => p.display_order)) + 1 : 1)}
                />
              </div>
              <div>
                <label className={labelCls}>{t("adminDelivery.points.method")}</label>
                <select value={draft.delivery_method} onChange={(e) => set({ delivery_method: e.target.value })} className={inputCls}>
                  {DELIVERY_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 pb-2">
                  <ToggleSwitch checked={draft.active} onChange={(v: boolean) => set({ active: v })} />
                  <span className="text-sm font-medium text-gray-700">{t("adminDelivery.points.active")}</span>
                </label>
              </div>
            </div>

            <div className="mb-4">
              <label className={labelCls}>{t("adminDelivery.points.pickupNotes")}</label>
              <textarea
                value={draft.pickup_notes}
                onChange={(e) => set({ pickup_notes: e.target.value })}
                rows={2}
                className={inputCls}
                placeholder={t("adminDelivery.points.pickupNotesPlaceholder")}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls}>{t("adminDelivery.points.latitude")}</label>
                <input
                  type="number"
                  step="any"
                  value={draft.latitude}
                  onChange={(e) => set({ latitude: e.target.value })}
                  className={inputCls}
                  placeholder="3.1390"
                />
              </div>
              <div>
                <label className={labelCls}>{t("adminDelivery.points.longitude")}</label>
                <input
                  type="number"
                  step="any"
                  value={draft.longitude}
                  onChange={(e) => set({ longitude: e.target.value })}
                  className={inputCls}
                  placeholder="101.6869"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setFormOpen(false)} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-50">
                {t("adminDelivery.points.cancel")}
              </button>
              <button onClick={persist} disabled={saving} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? t("adminDelivery.points.saving") : t("adminDelivery.points.save")}
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
              <h3 className="font-semibold text-gray-900 text-lg">{t("adminDelivery.points.deleteDialogTitle")}</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {t("adminDelivery.points.deleteConfirm", { name: deleteTarget.name })}{' '}
              {t("adminDelivery.points.deleteDialogBody")}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all">
                {t("adminDelivery.points.cancel")}
              </button>
              <button onClick={confirmDelete} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50">
                {saving ? t("adminDelivery.points.deleting") : t("adminDelivery.points.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
