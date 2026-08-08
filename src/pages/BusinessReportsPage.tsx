import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { Loader2, Download, Printer, ArrowLeft, AlertCircle, TrendingUp, Banknote, Package } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';
import { orderSelling, orderCost, orderGrossProfit, lineQuantity, isWeightLine, marginPercent } from '../lib/profit';
import { downloadCsv } from '../lib/exportCsv';
import { MultiLineChart, BarChart } from '../components/charts/ReportCharts';
import type { CartItem } from '../types';

type PeriodKey = 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all';
type Category = 'chicken' | 'fish' | 'prawns' | 'squid' | 'combo';

const CATEGORIES: Category[] = ['chicken', 'fish', 'prawns', 'squid', 'combo'];
const PERIOD_KEYS: PeriodKey[] = ['today', 'yesterday', 'week', 'month', 'custom', 'all'];

interface ReportOrder {
  id: string;
  ref: string;
  placedAt: Date;
  deliveryDate: string;
  items: CartItem[];
  weights: Record<string, number> | null;
  deliveryFee: number;
}

interface MoneyRow {
  key: string;
  label: string;
  orders: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  kgTotal: number | null;
  pcsTotal: number | null;
}

const money = (v: number) => `RM${formatCurrency(v)}`;

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function periodRange(period: PeriodKey, fromRaw: string, toRaw: string): { from: Date; to: Date } {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const customFrom = fromRaw ? new Date(`${fromRaw}T00:00:00`) : startOfDay(now);
  const customTo = toRaw ? new Date(`${toRaw}T23:59:59.999`) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const map: Record<PeriodKey, { from: Date; to: Date }> = {
    today: { from: startOfDay(now), to: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999) },
    yesterday: { from: startOfDay(yesterday), to: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999) },
    week: { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), to: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999) },
    month: { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999) },
    all: { from: new Date(2020, 0, 1), to: new Date(2100, 0, 1) },
    custom: { from: customFrom, to: customTo },
  };
  return map[period];
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
const fmtMonth = (d: Date) => d.toLocaleDateString('en-MY', { month: 'short' });

export default function BusinessReportsPage() {
  const { t } = useLanguage();
  const { isAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<ReportOrder[]>([]);

  const [period, setPeriod] = useState<PeriodKey>('month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [supplier, setSupplier] = useState<'all' | string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('Orders')
        .select('id, created_at, order_summary, order_items, supplier_weights, delivery_fee')
        .order('created_at', { ascending: true });
      if (fetchErr) throw fetchErr;
      const mapped: ReportOrder[] = (data ?? []).map((r) => ({
        id: String(r.id),
        ref: (r.order_summary as { orderRef?: string } | null)?.orderRef ?? String(r.id),
        placedAt: new Date(r.created_at),
        deliveryDate: (r.order_summary as { deliveryDate?: string } | null)?.deliveryDate ?? '',
        items: (r.order_items as CartItem[] | null) ?? [],
        weights: (r.supplier_weights as Record<string, number> | null) ?? null,
        deliveryFee: Number(r.delivery_fee ?? 0),
      }));
      setOrders(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('businessReports.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const suppliers = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => o.items.forEach((i) => { if (i.supplierName) set.add(i.supplierName); }));
    return Array.from(set).sort();
  }, [orders]);

  const { from, to, list } = useMemo(() => {
    const range = periodRange(period, fromDate, toDate);
    const matchesCategory = (o: ReportOrder) =>
      category === 'all' || o.items.some((i) => (i.category ?? 'combo') === category);
    const matchesSupplier = (o: ReportOrder) =>
      supplier === 'all' || o.items.some((i) => i.supplierName === supplier);
    return {
      from: range.from,
      to: range.to,
      list: orders.filter((o) => o.placedAt >= range.from && o.placedAt <= range.to && matchesCategory(o) && matchesSupplier(o)),
    };
  }, [orders, period, fromDate, toDate, category, supplier]);

  const totals = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let profit = 0;
    list.forEach((o) => {
      revenue += orderSelling(o.items, o.weights);
      cost += orderCost(o.items, o.weights);
      profit += orderGrossProfit(o.items, o.weights);
    });
    return { revenue, cost, profit, orders: list.length, margin: marginPercent(revenue, cost) };
  }, [list]);

  const daily = useMemo(() => {
    const map = new Map<string, MoneyRow & { revenue: number; cost: number; profit: number }>();
    list.forEach((o) => {
      const k = toDateKey(o.placedAt);
      const row = map.get(k) ?? { key: k, label: fmtDate(o.placedAt), orders: 0, revenue: 0, cost: 0, profit: 0, margin: 0, kgTotal: 0, pcsTotal: 0 };
      row.orders += 1;
      row.revenue += orderSelling(o.items, o.weights);
      row.cost += orderCost(o.items, o.weights);
      row.profit += orderGrossProfit(o.items, o.weights);
      map.set(k, row);
    });
    const rows = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
    rows.forEach((r) => { r.margin = marginPercent(r.revenue, r.cost); });
    return rows;
  }, [list]);

  const monthly = useMemo(() => {
    const map = new Map<string, MoneyRow>();
    list.forEach((o) => {
      const k = `${o.placedAt.getFullYear()}-${String(o.placedAt.getMonth() + 1).padStart(2, '0')}`;
      const row = map.get(k) ?? { key: k, label: fmtMonth(o.placedAt), orders: 0, revenue: 0, cost: 0, profit: 0, margin: 0, kgTotal: null, pcsTotal: null };
      row.orders += 1;
      row.revenue += orderSelling(o.items, o.weights);
      row.cost += orderCost(o.items, o.weights);
      row.profit += orderGrossProfit(o.items, o.weights);
      map.set(k, row);
    });
    const rows = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
    rows.forEach((r) => { r.margin = marginPercent(r.revenue, r.cost); });
    return rows;
  }, [list]);

  const products = useMemo(() => {
    const map = new Map<string, MoneyRow>();
    list.forEach((o) => {
      o.items.forEach((item, i) => {
        const key = item.productId ?? item.name;
        const row = map.get(key) ?? {
          key,
          label: item.name,
          orders: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          margin: 0,
          kgTotal: 0,
          pcsTotal: 0,
        };
        row.orders += 1;
        row.revenue += (item.price ?? 0) * lineQuantity(item, o.weights?.[String(i)]);
        row.cost += (item.costPrice ?? 0) * lineQuantity(item, o.weights?.[String(i)]);
        row.profit += ((item.price ?? 0) - (item.costPrice ?? 0)) * lineQuantity(item, o.weights?.[String(i)]);
        const q = lineQuantity(item, o.weights?.[String(i)]);
        if (isWeightLine(item)) row.kgTotal = (row.kgTotal ?? 0) + q;
        else row.pcsTotal = (row.pcsTotal ?? 0) + q;
        map.set(key, row);
      });
    });
    const rows = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    rows.forEach((r) => { r.margin = marginPercent(r.revenue, r.cost); });
    return rows;
  }, [list]);

  const suppliersReport = useMemo(() => {
    const map = new Map<string, MoneyRow>();
    list.forEach((o) => {
      const bySupplier = new Map<string, { revenue: number; cost: number; profit: number; products: number }>();
      o.items.forEach((item, i) => {
        const s = item.supplierName || '—';
        const row = bySupplier.get(s) ?? { revenue: 0, cost: 0, profit: 0, products: 0 };
        const q = lineQuantity(item, o.weights?.[String(i)]);
        row.revenue += (item.price ?? 0) * q;
        row.cost += (item.costPrice ?? 0) * q;
        row.profit += ((item.price ?? 0) - (item.costPrice ?? 0)) * q;
        row.products += 1;
        bySupplier.set(s, row);
      });
      bySupplier.forEach((v, s) => {
        const row = map.get(s) ?? { key: s, label: s, orders: 0, revenue: 0, cost: 0, profit: 0, margin: 0, kgTotal: null, pcsTotal: null };
        row.orders += 1;
        row.revenue += v.revenue;
        row.cost += v.cost;
        row.profit += v.profit;
        map.set(s, row);
      });
    });
    const rows = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    rows.forEach((r) => { r.margin = marginPercent(r.revenue, r.cost); });
    return rows;
  }, [list]);

  const exportDaily = () => {
    downloadCsv(`business-report-${toDateKey(new Date())}.csv`, [
      [t('businessReports.table.date'), t('businessReports.table.orders'), t('businessReports.table.revenue'), t('businessReports.table.cost'), t('businessReports.table.profit'), t('businessReports.table.margin')],
      ...daily.map((r) => [r.label, r.orders, r.revenue.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2), `${r.margin.toFixed(1)}%`]),
    ]);
  };

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-forest-500" size={32} /></div>;
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link to="/admin/products" className="p-2 rounded-xl text-gray-500 hover:text-forest-700 hover:bg-forest-50 transition-all" aria-label="Back">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-display font-bold text-forest-900 text-2xl">{t('businessReports.title')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('businessReports.subtitle')}</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={exportDaily} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-forest-700 hover:bg-forest-800 transition-all">
            <Download size={15} /> {t('businessReports.export.csv')}
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all">
            <Printer size={15} /> {t('businessReports.export.pdf')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-4 mb-6 flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1">{t('businessReports.filters.period')}</label>
          <div className="flex flex-wrap gap-1 bg-cream-50 rounded-xl p-1">
            {PERIOD_KEYS.map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${period === p ? 'bg-forest-700 text-white' : 'text-gray-500 hover:text-forest-700'}`}>
                {t(`businessReports.periods.${p}`)}
              </button>
            ))}
          </div>
        </div>
        {period === 'custom' && (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">{t('businessReports.filters.from')}</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-field !py-2" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">{t('businessReports.filters.to')}</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input-field !py-2" />
            </div>
          </>
        )}
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1">{t('businessReports.filters.category')}</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as 'all' | Category)} className="input-field !py-2">
            <option value="all">{t('businessReports.filters.all')}</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`adminProducts.labels.${c}`)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1">{t('businessReports.filters.supplier')}</label>
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="input-field !py-2">
            <option value="all">{t('businessReports.filters.all')}</option>
            {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm print:hidden">
          <AlertCircle size={18} /> {error}
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <SummaryCards totals={totals} t={t} />

          {/* Revenue vs Profit line chart */}
          <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-forest-600" />
              <h2 className="font-semibold text-charcoal">{t('businessReports.charts.revenueVsProfit')}</h2>
            </div>
            <MultiLineChart
              labels={daily.map((r) => r.label)}
              series={[
                { name: t('businessReports.table.revenue'), color: '#1f5c4d', values: daily.map((r) => Math.round(r.revenue)) },
                { name: t('businessReports.table.profit'), color: '#65a30d', values: daily.map((r) => Math.round(r.profit)) },
              ]}
            />
          </div>

          {/* Daily report */}
          <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-charcoal">{t('businessReports.sections.daily')}</h2>
              <span className="text-xs text-gray-400">{t('businessReports.period', { from: fmtDate(from), to: fmtDate(to) })}</span>
            </div>
            <MoneyTable header={t('businessReports.table.date')} rows={daily} t={t} />
          </section>

          {/* Daily profit bar + monthly */}
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5">
              <div className="flex items-center gap-2 mb-3">
                <Banknote size={16} className="text-forest-600" />
                <h2 className="font-semibold text-charcoal">{t('businessReports.charts.dailyProfit')}</h2>
              </div>
              <BarChart items={daily.map((r) => ({ label: r.label, value: Math.round(r.profit) }))} color="#65a30d" format={(v) => `RM${v}`} />
            </div>
            <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5">
              <div className="flex items-center gap-2 mb-3">
                <Banknote size={16} className="text-forest-600" />
                <h2 className="font-semibold text-charcoal">{t('businessReports.charts.monthlyProfit')}</h2>
              </div>
              <MultiLineChart
                labels={monthly.map((r) => r.label)}
                series={[{ name: t('businessReports.table.profit'), color: '#1f5c4d', values: monthly.map((r) => Math.round(r.profit)) }]}
              />
            </div>
          </div>

          {/* Monthly report */}
          <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5 mb-6">
            <h2 className="font-semibold text-charcoal mb-4">{t('businessReports.sections.monthly')}</h2>
            <MoneyTable header={t('businessReports.table.month')} rows={monthly} t={t} />
          </section>

          {/* Product report + top selling */}
          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-cream-200 shadow-soft p-5">
              <h2 className="font-semibold text-charcoal mb-4">{t('businessReports.sections.product')}</h2>
              <MoneyTable header={t('businessReports.table.product')} rows={products} t={t} showUnit />
            </div>
            <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5">
              <div className="flex items-center gap-2 mb-3">
                <Package size={16} className="text-forest-600" />
                <h2 className="font-semibold text-charcoal">{t('businessReports.charts.topProducts')}</h2>
              </div>
              <BarChart
                items={products.slice(0, 6).map((r) => ({ label: r.label.length > 12 ? `${r.label.slice(0, 12)}…` : r.label, value: Math.round(r.revenue) }))}
                color="#1f5c4d"
                format={(v) => `RM${v}`}
              />
            </div>
          </div>

          {/* Supplier report */}
          <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5 mb-6">
            <h2 className="font-semibold text-charcoal mb-4">{t('businessReports.sections.supplier')}</h2>
            <MoneyTable header={t('businessReports.table.supplier')} rows={suppliersReport} t={t} />
          </section>
        </>
      )}
    </main>
  );
}

function SummaryCards({ totals, t }: { totals: { orders: number; revenue: number; cost: number; profit: number; margin: number }; t: (k: string, p?: Record<string, string | number>) => string }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5">
        <p className="text-xs text-gray-400 font-medium">{t('businessReports.summary.orders')}</p>
        <p className="text-2xl font-bold text-forest-800 mt-1">{totals.orders}</p>
      </div>
      <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5">
        <p className="text-xs text-gray-400 font-medium">{t('businessReports.summary.revenue')}</p>
        <p className="text-2xl font-bold text-forest-800 mt-1">{money(totals.revenue)}</p>
      </div>
      <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5">
        <p className="text-xs text-gray-400 font-medium">{t('businessReports.summary.cost')}</p>
        <p className="text-2xl font-bold text-amber-700 mt-1">{money(totals.cost)}</p>
      </div>
      <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5">
        <p className="text-xs text-gray-400 font-medium">{t('businessReports.summary.profit')}</p>
        <p className="text-2xl font-bold text-green-700 mt-1">{money(totals.profit)}</p>
        <p className="text-xs text-gray-400 mt-0.5">{t('businessReports.summary.margin')}: {totals.margin.toFixed(1)}%</p>
      </div>
    </div>
  );
}

function MoneyTable({ header, rows, t, showUnit }: { header: string; rows: MoneyRow[]; t: (k: string, p?: Record<string, string | number>) => string; showUnit?: boolean }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 py-6 text-center">{t('businessReports.messages.noData')}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-cream-50 border-b border-cream-200">
            <th className="text-left px-4 py-3 font-semibold text-gray-700">{header}</th>
            {showUnit && <th className="text-left px-4 py-3 font-semibold text-gray-700">{t('businessReports.table.qtySold')}</th>}
            <th className="text-right px-4 py-3 font-semibold text-gray-700">{t('businessReports.table.orders')}</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-700">{t('businessReports.table.revenue')}</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-700">{t('businessReports.table.cost')}</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-700">{t('businessReports.table.profit')}</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-700">{t('businessReports.table.margin')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cream-100">
          {rows.map((r) => (
            <tr key={r.key} className="hover:bg-cream-50/50">
              <td className="px-4 py-3 font-medium text-gray-900">{r.label}</td>
              {showUnit && (
                <td className="px-4 py-3 text-gray-600">
                  {(r.kgTotal ?? 0) > 0 && <span>{r.kgTotal!.toFixed(2)} kg</span>}
                  {(r.kgTotal ?? 0) > 0 && (r.pcsTotal ?? 0) > 0 && <span> · </span>}
                  {(r.pcsTotal ?? 0) > 0 && <span>{r.pcsTotal} pcs</span>}
                  {(r.kgTotal ?? 0) <= 0 && (r.pcsTotal ?? 0) <= 0 && <span>—</span>}
                </td>
              )}
              <td className="px-4 py-3 text-right text-gray-600">{r.orders}</td>
              <td className="px-4 py-3 text-right text-gray-900 font-medium">{money(r.revenue)}</td>
              <td className="px-4 py-3 text-right text-amber-700">{money(r.cost)}</td>
              <td className="px-4 py-3 text-right font-semibold text-green-700">{money(r.profit)}</td>
              <td className="px-4 py-3 text-right text-gray-500">{r.margin.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
