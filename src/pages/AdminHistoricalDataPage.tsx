import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import {
  Loader2, Plus, Pencil, Save, Trash2, AlertCircle, ArrowLeft, History, X, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { formatCurrency } from '../lib/currency';
import {
  fetchHistoricalBusinessDaily,
  createHistoricalBusinessDaily,
  updateHistoricalBusinessDaily,
  deleteHistoricalBusinessDaily,
  type HistoricalBusinessDaily,
  type HistoricalBusinessDailyInput,
} from '../data/historicalBusinessDaily';

const inputCls =
  'w-full bg-cream-50 border border-cream-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-all';
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1.5';

interface Draft {
  business_date: string;
  order_count: string;
  revenue_amount: string;
  supplier_cost_amount: string;
  delivery_income_amount: string;
  gross_profit_amount: string;
  notes: string;
}

const emptyDraft = (): Draft => ({
  business_date: '',
  order_count: '',
  revenue_amount: '',
  supplier_cost_amount: '',
  delivery_income_amount: '',
  gross_profit_amount: '',
  notes: '',
});

function draftToInput(d: Draft): HistoricalBusinessDailyInput | null {
  const order_count = Number(d.order_count);
  const revenue_amount = Number(d.revenue_amount);
  const supplier_cost_amount = Number(d.supplier_cost_amount);
  const delivery_income_amount = Number(d.delivery_income_amount || '0');
  const gross_profit_amount = Number(d.gross_profit_amount);
  if (!d.business_date) return null;
  return {
    business_date: d.business_date,
    order_count,
    revenue_amount,
    supplier_cost_amount,
    delivery_income_amount,
    gross_profit_amount,
    notes: d.notes.trim() || null,
  };
}

function draftFromRow(r: HistoricalBusinessDaily): Draft {
  return {
    business_date: r.business_date,
    order_count: String(r.order_count),
    revenue_amount: String(r.revenue_amount),
    supplier_cost_amount: String(r.supplier_cost_amount),
    delivery_income_amount: String(r.delivery_income_amount),
    gross_profit_amount: String(r.gross_profit_amount),
    notes: r.notes ?? '',
  };
}

const money = (v: number) => `RM${formatCurrency(v)}`;

export default function AdminHistoricalDataPage() {
  const { t } = useLanguage();
  const { isAdmin, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<HistoricalBusinessDaily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HistoricalBusinessDaily | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [deleteTarget, setDeleteTarget] = useState<HistoricalBusinessDaily | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchHistoricalBusinessDaily());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('historicalData.errors.load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    let orders = 0, revenue = 0, cost = 0, delivery = 0, profit = 0;
    rows.forEach((r) => {
      orders += r.order_count;
      revenue += r.revenue_amount;
      cost += r.supplier_cost_amount;
      delivery += r.delivery_income_amount;
      profit += r.gross_profit_amount;
    });
    return { orders, revenue, cost, delivery, profit };
  }, [rows]);

  const notify = (msg: string, ok = true) => {
    setStatus(ok ? 'success' : 'error');
    setStatusMsg(msg);
    setTimeout(() => setStatus('idle'), 3000);
  };

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setFormOpen(true);
  };

  const openEdit = (row: HistoricalBusinessDaily) => {
    setEditing(row);
    setDraft(draftFromRow(row));
    setFormOpen(true);
  };

  const save = async () => {
    const input = draftToInput(draft);
    if (!input) {
      setStatus('error');
      setStatusMsg(t('historicalData.errors.dateRequired'));
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateHistoricalBusinessDaily(editing.id, input);
        notify(t('historicalData.messages.saved'));
      } else {
        await createHistoricalBusinessDaily(input);
        notify(t('historicalData.messages.saved'));
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setStatus('error');
      setStatusMsg(err instanceof Error ? err.message : t('historicalData.errors.save'));
      setTimeout(() => setStatus('idle'), 4000);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteHistoricalBusinessDaily(deleteTarget.id);
      notify(t('historicalData.messages.deleted'));
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setStatus('error');
      setStatusMsg(err instanceof Error ? err.message : t('historicalData.errors.delete'));
      setTimeout(() => setStatus('idle'), 4000);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-forest-500" size={32} /></div>;
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin/products" className="p-2 rounded-xl text-gray-500 hover:text-forest-700 hover:bg-forest-50 transition-all" aria-label="Back">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-display font-bold text-forest-900 text-2xl">{t('historicalData.title')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('historicalData.subtitle')}</p>
          </div>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-forest-700 hover:bg-forest-800 transition-all">
          <Plus size={15} /> {t('historicalData.buttons.add')}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm mb-6">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-4">
          <p className="text-xs text-gray-400 font-medium">{t('historicalData.summary.orders')}</p>
          <p className="text-xl font-bold text-forest-800 mt-1">{totals.orders}</p>
        </div>
        <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-4">
          <p className="text-xs text-gray-400 font-medium">{t('historicalData.summary.revenue')}</p>
          <p className="text-xl font-bold text-forest-800 mt-1">{money(totals.revenue)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-4">
          <p className="text-xs text-gray-400 font-medium">{t('historicalData.summary.cost')}</p>
          <p className="text-xl font-bold text-amber-700 mt-1">{money(totals.cost)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-4">
          <p className="text-xs text-gray-400 font-medium">{t('historicalData.summary.delivery')}</p>
          <p className="text-xl font-bold text-sky-700 mt-1">{money(totals.delivery)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-4">
          <p className="text-xs text-gray-400 font-medium">{t('historicalData.summary.profit')}</p>
          <p className="text-xl font-bold text-green-700 mt-1">{money(totals.profit)}</p>
        </div>
      </div>

      {status !== 'idle' && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm mb-6 ${status === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
          {status === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {statusMsg}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream-50 border-b border-cream-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">{t('historicalData.table.date')}</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">{t('historicalData.table.orders')}</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">{t('historicalData.table.revenue')}</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">{t('historicalData.table.cost')}</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">{t('historicalData.table.delivery')}</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">{t('historicalData.table.profit')}</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">{t('historicalData.table.notes')}</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">{t('historicalData.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">{t('historicalData.messages.empty')}</td>
                </tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-cream-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.business_date}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.order_count}</td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium">{money(r.revenue_amount)}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{money(r.supplier_cost_amount)}</td>
                  <td className="px-4 py-3 text-right text-sky-700">{money(r.delivery_income_amount)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">{money(r.gross_profit_amount)}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{r.notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(r)} className="p-2 rounded-lg text-gray-500 hover:text-forest-700 hover:bg-forest-50 transition-all" title={t('historicalData.buttons.edit')}>
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => setDeleteTarget(r)} className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all" title={t('historicalData.buttons.delete')}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setFormOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-forest-900 text-lg">
                {editing ? t('historicalData.buttons.edit') : t('historicalData.buttons.add')}
              </h2>
              <button onClick={() => setFormOpen(false)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-cream-50 transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>{t('historicalData.form.date')}</label>
                <input type="date" value={draft.business_date} onChange={(e) => setDraft({ ...draft, business_date: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('historicalData.form.orders')}</label>
                <input type="number" min="0" step="1" value={draft.order_count} onChange={(e) => setDraft({ ...draft, order_count: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('historicalData.form.revenue')}</label>
                <input type="number" min="0" step="0.01" value={draft.revenue_amount} onChange={(e) => setDraft({ ...draft, revenue_amount: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('historicalData.form.cost')}</label>
                <input type="number" min="0" step="0.01" value={draft.supplier_cost_amount} onChange={(e) => setDraft({ ...draft, supplier_cost_amount: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('historicalData.form.delivery')}</label>
                <input type="number" min="0" step="0.01" value={draft.delivery_income_amount} onChange={(e) => setDraft({ ...draft, delivery_income_amount: e.target.value })} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>{t('historicalData.form.profit')}</label>
                <input type="number" step="0.01" value={draft.gross_profit_amount} onChange={(e) => setDraft({ ...draft, gross_profit_amount: e.target.value })} className={inputCls} />
                <p className="text-xs text-gray-400 mt-1">{t('historicalData.form.profitHint')}</p>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>{t('historicalData.form.notes')}</label>
                <input type="text" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all">
                {t('historicalData.buttons.cancel')}
              </button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-forest-700 hover:bg-forest-800 disabled:opacity-50 transition-all">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {t('historicalData.buttons.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <History size={18} className="text-red-600" />
              <h2 className="font-display font-bold text-forest-900 text-lg">{t('historicalData.confirmDelete.title')}</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {t('historicalData.confirmDelete.body', { date: deleteTarget.business_date })}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all">
                {t('historicalData.buttons.cancel')}
              </button>
              <button onClick={remove} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-all">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} {t('historicalData.buttons.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}