import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import {
  CheckCircle2, PackageCheck, Package, Truck, Home, Bike, Check,
  ExternalLink, MapPin, User, ChevronRight, CalendarDays, Wallet, BadgeCheck, PackageX,
} from 'lucide-react';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import ProductImage from '../components/ui/ProductImage';
import { formatCurrency } from '../lib/currency';
import { formatDisplayDate } from '../data/delivery';
import { isSliceItem } from '../lib/sellingOptions';
import {
  TRACKING_STAGES,
  customerStageIndex,
  fetchRiderNameForDate,
} from '../data/customerTracking';
import type { Order, CartItem } from '../types';

const STAGE_ICONS: Record<(typeof TRACKING_STAGES)[number], typeof Package> = {
  orderReceived: PackageCheck,
  awaitingPayment: Wallet,
  paymentConfirmed: BadgeCheck,
  preparing: Package,
  supplierDispatch: Truck,
  arrivedHub: Home,
  readyForRider: Truck,
  outForDelivery: Bike,
  delivered: CheckCircle2,
};

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { getOrder } = useOrders();
  const { t } = useLanguage();

  const isWeightItem = (item: CartItem) => {
    if (isSliceItem(item)) return false;
    if (item.orderingMode) return item.orderingMode === 'weight_only' || item.orderingMode === 'whole_or_weight';
    return item.pricingType === 'per_kg';
  };

  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [riderName, setRiderName] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadLive = useCallback(async (ref: string) => {
    let o: Order | null;
    try {
      o = await getOrder(ref);
    } catch (err) {
      // A SQL/query failure must NOT look like "Order Not Found".
      console.error('[tracking] Failed to fetch order:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load order');
      return;
    }
    if (!o) {
      // Only here does the order truly not exist.
      setOrder(null);
      setRiderName(null);
      setLoadError(null);
      return;
    }
    setOrder(o);
    setLoadError(null);
    try {
      // The delivery date is order-owned (order_summary.deliveryDate).
      const riderDate = o.deliveryDate || '';
      setRiderName(riderDate ? await fetchRiderNameForDate(riderDate) : null);
    } catch (err) {
      // Non-fatal: the order still renders; the timeline just stays at Order Received.
      console.error('[tracking] Failed to fetch tracking details:', err);
    }
  }, [getOrder]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const ref = id ?? '';
    setInitialLoading(true);
    loadLive(ref).finally(() => { if (active) setInitialLoading(false); });
    // Auto-refresh so the timeline updates as the delivery progresses.
    const interval = setInterval(() => { if (active) loadLive(ref); }, 25000);
    return () => { active = false; clearInterval(interval); };
  }, [id, loadLive, user]);

  const retry = () => {
    const ref = id ?? '';
    setLoadError(null);
    setInitialLoading(true);
    loadLive(ref).finally(() => setInitialLoading(false));
  };

  const pointName = order?.customer.deliveryPointName || order?.customer.pickupLocation || '—';

  const currentIndex = useMemo(() => {
    if (!order) return 0;
    return customerStageIndex({
      paymentStatus: order.paymentStatus,
      packingStartedAt: order.packingStartedAt ?? null,
      packingCompletedAt: order.packingCompletedAt ?? null,
      supplierDispatchStartedAt: order.supplierDispatchStartedAt ?? null,
      supplierDispatchCompletedAt: order.supplierDispatchCompletedAt ?? null,
      readyForRiderAt: order.readyForRiderAt ?? null,
      deliveryStatus: (order.deliveryStatus as 'pending' | 'arrived' | 'delivered') ?? 'pending',
      deliveredAt: order.deliveredAt ?? null,
    });
  }, [order]);

  const isTerminalDelivered = currentIndex === TRACKING_STAGES.length - 1;

  const stageState = (i: number): 'done' | 'current' | 'future' => {
    if (i < currentIndex) return 'done';
    if (i === currentIndex) return isTerminalDelivered ? 'done' : 'current';
    return 'future';
  };

  const circleCls = (st: 'done' | 'current' | 'future') =>
    st === 'done'
      ? 'bg-emerald-500 border-emerald-500 text-white'
      : st === 'current'
      ? 'bg-white border-2 border-blue-500 text-blue-600 shadow-[0_0_0_4px_rgba(59,130,246,0.18)]'
      : 'bg-cream-100 border-2 border-cream-300 text-gray-300';

  const lineCls = (st: 'done' | 'current' | 'future') =>
    st === 'done' ? 'bg-emerald-400' : st === 'current' ? 'bg-blue-300' : 'bg-cream-200';

  const isHttp = (u: string) => /^https?:\/\//i.test(u);

  if (!user) return <Navigate to="/" replace />;

  if (order === undefined && loadError) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-4">
          <PackageX size={28} className="text-red-400" />
        </div>
        <h2 className="section-title mb-2">{t("orderSuccess.loadError")}</h2>
        <button onClick={retry} className="btn-primary mt-4">{t("orderSuccess.retry")}</button>
      </main>
    );
  }

  if (initialLoading || order === undefined) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-10 h-10 border-2 border-forest-200 border-t-forest-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">{t("orderSuccess.loading")}</p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="section-title mb-4">{t("orderSuccess.notFound")}</h2>
        <p className="text-gray-500 mb-6">{t("orderSuccess.notFoundMessage", { id: id ?? '' })}</p>
        <Link to="/" className="btn-primary">{t("orderSuccess.backToHome")}</Link>
      </main>
    );
  }

  const from = 'Pasar Tani Putrajaya';
  const to = 'FreshGo Hub (Residensi Rimbun)';

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-gray-400 mb-8">
        <Link to="/" className="hover:text-forest-600">{t("orderSuccess.home")}</Link>
        <ChevronRight size={12} />
        <span className="text-gray-600">{t("orderSuccess.pageTitle")}</span>
      </nav>

      {/* Confirmation banner */}
      <div className="gradient-forest rounded-3xl p-6 sm:p-8 mb-6 text-center text-white">
        <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={30} className="text-jade-300" />
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">{t("orderSuccess.orderConfirmed")}</h1>
        <p className="text-forest-200 text-sm">{t("orderSuccess.thankYou", { name: order.customer.name.split(' ')[0] })}</p>
        <div className="mt-3 bg-forest-300 rounded-2xl px-4 py-2 inline-block">
          <p className="text-xs text-forest-100">{t("orderSuccess.orderNumber")}</p>
          <p className="font-mono font-bold text-white">{order.id}</p>
        </div>
      </div>

      {/* Payment Status */}
      <div className="card p-6 sm:p-8 mb-6">
        <h2 className="font-semibold text-charcoal mb-4">{t("payment.status")}</h2>
        {order.paymentStatus === 'Pending' && (
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="font-semibold text-amber-700">{t("payment.pending")}</span>
          </div>
        )}
        {order.paymentStatus === 'Ready To Pay' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-orange-400 flex-shrink-0" />
              <span className="font-semibold text-orange-700">{t("payment.readyToPay")}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-cream-200 pt-3">
              <span className="text-gray-600 font-medium">{t("payment.amount")}</span>
              <span className="font-bold text-forest-800 text-base">RM{formatCurrency(order.total)}</span>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-sm text-orange-800 leading-relaxed">
              {t("payment.readyToPayInstructions")}
            </div>
          </div>
        )}
        {order.paymentStatus === 'Paid' && (
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
            <span className="font-semibold text-green-700">{t("payment.paid")}</span>
            {order.paidAt && (
              <span className="text-xs text-gray-400 ml-1">
                {new Date(order.paidAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Live timeline */}
      <div className="card p-6 sm:p-8 mb-6">
        <h2 className="font-semibold text-charcoal mb-6">{t("tracking.live.title")}</h2>
        <div className="relative pl-1">
          {TRACKING_STAGES.map((key, i) => {
            const st = stageState(i);
            const Icon = STAGE_ICONS[key];
            const title = t(`tracking.live.stage.${key}.title`);
            return (
              <div key={key} className="relative pl-14 pb-7 last:pb-0">
                {i < TRACKING_STAGES.length - 1 && (
                  <div className={`absolute top-11 bottom-0 left-[19px] w-0.5 rounded-full ${lineCls(st)}`} />
                )}
                <div className={`absolute top-0 left-0 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${circleCls(st)}`}>
                  {st === 'done' ? <Check size={20} /> : <Icon size={18} />}
                </div>

                <div className={`min-w-0 rounded-2xl ${st === 'current' ? 'bg-blue-50 border border-blue-200 p-3' : 'py-1'}`}>
                  <p className={`font-semibold ${
                    st === 'done' ? 'text-emerald-700'
                      : st === 'current' ? 'text-blue-700'
                      : 'text-gray-400'
                  }`}>
                    {title}
                  </p>
                  <p className={`text-sm mt-0.5 ${st === 'future' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {key === 'supplierDispatch'
                      ? t('tracking.live.stage.supplierDispatch.body', { from, to })
                      : t(`tracking.live.stage.${key}.body`)}
                  </p>

                  {key === 'supplierDispatch' && currentIndex >= 4 && currentIndex <= 7 && order.lalamoveTrackingUrl && (
                    <a
                      href={order.lalamoveTrackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-forest-700 text-white text-sm font-semibold hover:bg-forest-800 transition-all"
                    >
                      <ExternalLink size={16} />
                      {t("tracking.live.trackLalamove")}
                    </a>
                  )}

                  {key === 'outForDelivery' && currentIndex === 7 && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-forest-700">
                      <MapPin size={14} />
                      {t("tracking.live.currentDeliveryPoint")}: <span className="font-semibold">{pointName}</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Tracking link */}
        {order.lalamoveTrackingUrl && isHttp(order.lalamoveTrackingUrl) && (
          <div className="mt-6 pt-4 border-t border-cream-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-gray-500">{t("tracking.live.trackSupplierDelivery")}</p>
            <a
              href={order.lalamoveTrackingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-forest-300 text-forest-700 text-sm font-semibold hover:bg-forest-50 transition-all"
            >
              <ExternalLink size={16} />
              {t("tracking.live.trackSupplierDelivery")}
            </a>
          </div>
        )}
      </div>

      {/* Delivery details */}
      <div className="card p-6 sm:p-8 mb-6">
        <h2 className="font-semibold text-charcoal mb-4">{t("tracking.deliveryDetails")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <CalendarDays size={18} className="text-forest-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400">{t("tracking.live.deliveryDate")}</p>
              <p className="text-sm font-semibold text-forest-800">
                {order.deliveryDate ? formatDisplayDate(order.deliveryDate) : t("tracking.live.deliveryDate")}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin size={18} className="text-forest-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-400">{t("tracking.deliveryPoint")}</p>
              <p className="text-sm font-semibold text-gray-800">{pointName}</p>
              <p className="text-sm text-gray-500">{t("tracking.unit")} {order.customer.houseUnit}{order.customer.apartment ? `, ${order.customer.apartment}` : ''}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Package size={18} className="text-forest-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400">{t("tracking.live.deliveryMethod")}</p>
              <p className="text-sm font-medium text-gray-800">{order.customer.deliveryMethod || '—'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className="text-forest-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400">{t("payment.status")}</p>
              <p className={`text-sm font-semibold ${
                order.paymentStatus === 'Paid' ? 'text-green-700' : order.paymentStatus === 'Ready To Pay' ? 'text-orange-700' : 'text-amber-700'
              }`}>
                {order.paymentStatus}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Rider info */}
      {riderName && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold text-charcoal mb-4">{t("tracking.live.rider")}</h2>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0">
              <User size={20} />
            </div>
            <p className="font-semibold text-forest-800">{riderName}</p>
          </div>
        </div>
      )}

      {/* Order summary */}
      <div className="card p-6 sm:p-8">
        <h3 className="font-semibold text-charcoal mb-4">{t("tracking.orderContents")}</h3>
        <div className="space-y-3 mb-4">
          {order.items.map((item) => (
            <div key={item.comboId ?? item.productId} className="flex gap-3 items-center">
              <ProductImage src={item.image} alt={item.name} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{item.name}</p>
                {item.preparation && <p className="text-xs text-gray-400">{t("cartItem.preparation." + item.preparation)}</p>}
                {isSliceItem(item) ? (
                  <p className="text-xs text-gray-500">{t("tracking.slices", { count: item.sliceQuantity ?? item.quantity })}</p>
                ) : isWeightItem(item) ? (
                  <p className="text-xs text-amber-600">~{(item.estimatedWeight ?? 0).toFixed(2)} kg</p>
                ) : (
                  <p className="text-xs text-gray-400">{t("checkout.qty", { count: item.quantity })}</p>
                )}
                {isSliceItem(item) && item.actualWeight != null && (
                  <p className="text-xs text-forest-700 font-medium mt-0.5">
                    {t("tracking.actualWeight", { weight: item.actualWeight.toFixed(2) })} · {t("tracking.pricePerKg", { price: formatCurrency(item.price) })} · <strong>{t("tracking.finalPrice", { price: formatCurrency(item.price * item.actualWeight) })}</strong>
                  </p>
                )}
                {item.comboItems && item.comboItems.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-cream-200 space-y-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("checkout.contains")}</p>
                    {item.comboItems.map((ci) => (
                      <div key={ci.productId} className="flex items-center gap-1.5 text-xs">
                        <span className="text-gray-700">{ci.label}</span>
                        {ci.preparation && (
                          <span className="text-gray-400">({t("cartItem.preparation." + ci.preparation)})</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {isWeightItem(item) ? (
                <p className="text-sm font-semibold text-amber-700">≈ RM{formatCurrency(item.price * (item.estimatedWeight ?? 0))}</p>
              ) : isSliceItem(item) ? (
                item.actualWeight != null ? (
                  <p className="text-sm font-semibold text-forest-800">RM{formatCurrency(item.price * item.actualWeight)}</p>
                ) : (
                  <p className="text-xs text-gray-400">{t("checkout.afterWeighing")}</p>
                )
              ) : (
                <p className="text-sm font-semibold text-forest-800">RM{formatCurrency(item.price * item.quantity)}</p>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-cream-200 pt-3 space-y-1.5">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t("checkout.subtotal")}</span><span>RM{formatCurrency(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t("checkout.delivery")}</span>
            <span>RM{formatCurrency(order.deliveryFee)}</span>
          </div>
          <div className="flex justify-between font-bold text-base border-t border-cream-200 pt-2">
            <span>{t("checkout.total")}</span>
            <span className="text-forest-800">RM{formatCurrency(order.total)}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link to="/shop" className="btn-secondary">{t("orderSuccess.continueShopping")}</Link>
      </div>
    </main>
  );
}