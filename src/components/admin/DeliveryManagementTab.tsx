import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, RefreshCcw, MapPin, CheckCircle2, Clock3, UserPlus, X,
  Truck, AlertCircle, Calendar,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import DeliveryPointsManager from './DeliveryPointsManager';
import {
  fetchOrdersForDate,
  fetchDeliveryPoints,
  fetchAssignments,
  fetchRiders,
  assignRider,
  unassignRider,
  updateDeliveryStatus,
  formatLocalDate,
  formatDisplayDate,
  type DeliveryOrder,
  type DeliveryPoint,
  type DeliveryStatus,
  type RiderInfo,
  type DeliveryAssignment,
} from '../../data/delivery';

interface PointGroup {
  point: string;
  method: string;
  orders: DeliveryOrder[];
}

const STATUS_BADGE: Record<DeliveryStatus, string> = {
  pending: 'bg-cream-100 text-gray-600',
  arrived: 'bg-amber-100 text-amber-700',
  delivered: 'bg-green-100 text-green-700',
};

const STATUS_LABEL_KEY: Record<DeliveryStatus, string> = {
  pending: 'deliveryDashboard.status.pending',
  arrived: 'deliveryDashboard.status.arrived',
  delivered: 'deliveryDashboard.status.delivered',
};

function AdminDeliveryStatusBadge({ status, t }: { status: DeliveryStatus; t: (key: string) => string }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[status]}`}>
      {t(STATUS_LABEL_KEY[status])}
    </span>
  );
}

export default function DeliveryManagementTab() {
  const { t } = useLanguage();
  const [view, setView] = useState<'runs' | 'points'>('runs');
  const [date, setDate] = useState<string>(formatLocalDate(new Date()));
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [points, setPoints] = useState<DeliveryPoint[]>([]);
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [riders, setRiders] = useState<RiderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [selectedRider, setSelectedRider] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, p, a, r] = await Promise.all([
        fetchOrdersForDate(date),
        fetchDeliveryPoints(),
        fetchAssignments(date),
        fetchRiders(),
      ]);
      setOrders(o);
      setPoints(p);
      setAssignments(a);
      setRiders(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminDelivery.messages.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, [date, t]);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo<PointGroup[]>(() => {
    const map = new Map<string, DeliveryOrder[]>();
    orders.forEach((o) => {
      const key = o.pointName || '—';
      const arr = map.get(key) ?? [];
      arr.push(o);
      map.set(key, arr);
    });
    return Array.from(map.entries()).map(([point, list]) => {
      const meta = points.find((p) => p.name === point);
      return {
        point,
        method: list.find((o) => o.method)?.method || meta?.delivery_method || t("deliveryDashboard.method.default"),
        orders: list,
      };
    });
  }, [orders, points, t]);

  const totals = useMemo(() => {
    const delivered = orders.filter((o) => o.deliveryStatus === 'delivered').length;
    return { total: orders.length, delivered, remaining: orders.length - delivered };
  }, [orders]);

  const riderName = (id: string) => riders.find((r) => r.id === id)?.email ?? id;

  const handleStatus = async (order: DeliveryOrder, status: DeliveryStatus) => {
    setUpdating(order.dbId);
    setError(null);
    try {
      await updateDeliveryStatus(order.dbId, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminDelivery.messages.failedUpdate"));
    } finally {
      setUpdating(null);
    }
  };

  const handleAssign = async () => {
    if (!selectedRider) return;
    setAssigning(true);
    setError(null);
    try {
      await assignRider(date, selectedRider);
      setSelectedRider('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminDelivery.messages.failedAssign"));
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (riderId: string) => {
    setAssigning(true);
    setError(null);
    try {
      await unassignRider(date, riderId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminDelivery.messages.failedAssign"));
    } finally {
      setAssigning(false);
    }
  };

  const pct = totals.total === 0 ? 0 : Math.round((totals.delivered / totals.total) * 100);

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex items-center gap-2 border-b border-cream-200 pb-2">
        <button
          onClick={() => setView('runs')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${view === 'runs' ? 'bg-forest-700 text-white' : 'bg-cream-100 text-gray-600 hover:bg-cream-200'}`}
        >
          {t("adminDelivery.subTabs.runs")}
        </button>
        <button
          onClick={() => setView('points')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${view === 'points' ? 'bg-forest-700 text-white' : 'bg-cream-100 text-gray-600 hover:bg-cream-200'}`}
        >
          {t("adminDelivery.subTabs.points")}
        </button>
      </div>

      {view === 'points' ? (
        <DeliveryPointsManager />
      ) : (
        <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="input-field pl-9"
            />
          </div>
          <span className="text-sm text-gray-500">{formatDisplayDate(date)}</span>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-forest-700 border border-forest-200 hover:bg-forest-50 transition-all disabled:opacity-50"
        >
          <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
          {t("deliveryDashboard.buttons.refresh")}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-forest-500" size={32} />
        </div>
      ) : (
        <>
          {/* Rider assignment */}
          <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-forest-50 flex items-center justify-center flex-shrink-0">
                <Truck size={20} className="text-forest-700" />
              </div>
              <div>
                <h2 className="font-semibold text-forest-900 text-base">{t("adminDelivery.assignment.title")}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{t("adminDelivery.assignment.description")}</p>
              </div>
            </div>

            {assignments.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                {t("adminDelivery.assignment.noRider")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-4">
                {assignments.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-forest-50 border border-forest-200 text-sm font-medium text-forest-800">
                    {riderName(a.rider_id)}
                    <button
                      onClick={() => handleUnassign(a.rider_id)}
                      disabled={assigning}
                      className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      aria-label={t("adminDelivery.assignment.remove")}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <select
                value={selectedRider}
                onChange={(e) => setSelectedRider(e.target.value)}
                className="input-field max-w-xs"
              >
                <option value="">{t("adminDelivery.assignment.selectRider")}</option>
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>{r.email}</option>
                ))}
              </select>
              <button
                onClick={handleAssign}
                disabled={!selectedRider || assigning}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-forest-700 text-white hover:bg-forest-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {assigning ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                {t("adminDelivery.assignment.assign")}
              </button>
            </div>
            {riders.length === 0 && (
              <p className="text-xs text-gray-400 mt-3">{t("adminDelivery.assignment.noRidersHint")}</p>
            )}
          </section>

          {/* Progress summary */}
          <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-500">{t("adminDelivery.summary.title")}</p>
                <p className="text-2xl font-bold text-forest-900 mt-0.5">
                  {totals.delivered} <span className="text-gray-400 font-medium">/ {totals.total}</span>
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 ${totals.remaining > 0 ? 'text-amber-700 bg-amber-50 border border-amber-200' : 'text-green-700 bg-green-50 border border-green-200'}`}>
                <Clock3 size={13} />
                {totals.remaining > 0
                  ? t("deliveryDashboard.progress.remaining", { count: totals.remaining })
                  : t("deliveryDashboard.progress.complete")}
              </span>
            </div>
            <div className="h-2.5 bg-cream-100 rounded-full overflow-hidden">
              <div className="h-full bg-forest-600 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Groups by delivery point */}
          {groups.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-cream-200 shadow-soft">
              <CheckCircle2 size={44} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">{t("adminDelivery.empty")}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((g) => {
                const deliveredInGroup = g.orders.filter((o) => o.deliveryStatus === 'delivered').length;
                return (
                  <section key={g.point} className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-cream-50/70 border-b border-cream-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-forest-700 text-white flex items-center justify-center flex-shrink-0">
                          <MapPin size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-forest-900 truncate">{g.point}</p>
                          <p className="text-xs text-gray-500">{g.method}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 ${deliveredInGroup === g.orders.length ? 'bg-green-100 text-green-700' : 'bg-cream-100 text-gray-600'}`}>
                          <CheckCircle2 size={13} />
                          {deliveredInGroup}/{g.orders.length}
                        </span>
                      </div>
                    </div>

                    <ul className="divide-y divide-cream-100">
                      {g.orders.map((o) => (
                        <li key={o.dbId} className="px-5 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-gray-900">{o.customerName}</p>
                                <span className="text-xs text-gray-400">{o.orderRef}</span>
                                <AdminDeliveryStatusBadge status={o.deliveryStatus} t={t} />
                                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                                  {o.paymentStatus === 'Paid' ? t("deliveryDashboard.payment.paid") : t("adminDelivery.payment.status")}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 mt-1">
                                {o.customerPhone} &middot; Unit {o.houseUnit}{o.apartment ? `, ${o.apartment}` : ''}
                              </p>
                              {o.notes && <p className="text-sm text-gray-500 mt-1 italic">“{o.notes}”</p>}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {o.deliveryStatus !== 'delivered' && (
                                <>
                                  {o.deliveryStatus === 'pending' && (
                                    <button
                                      onClick={() => handleStatus(o, 'arrived')}
                                      disabled={updating === o.dbId}
                                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-amber-700 border border-amber-200 hover:bg-amber-50 transition-all disabled:opacity-50"
                                    >
                                      {updating === o.dbId ? <Loader2 size={14} className="animate-spin" /> : <Clock3 size={14} />}
                                      {t("deliveryDashboard.buttons.arrived")}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleStatus(o, 'delivered')}
                                    disabled={updating === o.dbId}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-green-700 border border-green-200 hover:bg-green-50 transition-all disabled:opacity-50"
                                  >
                                    {updating === o.dbId ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                    {t("deliveryDashboard.buttons.delivered")}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
      )}
    </div>
  );
}
