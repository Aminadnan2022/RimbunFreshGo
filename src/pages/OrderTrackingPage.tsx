import { useState, useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { CheckCircle2, Clock, MapPin, Package, Home, ChevronRight } from 'lucide-react';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import ProductImage from '../components/ui/ProductImage';
import type { Order, CartItem } from '../types';

const statusIcons = {
  'Order Confirmed': CheckCircle2,
  'Being Prepared': Package,
  'Out for Delivery': Clock,
  'Delivered': Home,
};

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { getOrder } = useOrders();
  const { t } = useLanguage();

  const isWeightItem = (item: CartItem) => {
    if (item.orderingMode) return item.orderingMode === 'weight_only' || item.orderingMode === 'whole_or_weight';
    return item.pricingType === 'per_kg';
  };
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getOrder(id ?? '')
      .then((o) => { if (active) setOrder(o); })
      .catch(() => { if (active) setOrder(null); });
    return () => { active = false; };
  }, [id, getOrder, user]);

  if (!user) return <Navigate to="/" replace />;

  if (order === undefined) {
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
        <p className="text-gray-500 mb-6">{t("orderSuccess.notFoundMessage", { id: id })}</p>
        <Link to="/" className="btn-primary">{t("orderSuccess.backToHome")}</Link>
      </main>
    );
  }

  const currentStatusIndex = order.statusTimeline.filter((s) => s.done).length - 1;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-gray-400 mb-8">
        <Link to="/" className="hover:text-forest-600">{t("orderSuccess.home")}</Link>
        <ChevronRight size={12} />
        <span className="text-gray-600">{t("orderSuccess.pageTitle")}</span>
      </nav>

      {/* Confirmation banner */}
      <div className="gradient-forest rounded-3xl p-6 sm:p-8 mb-8 text-center text-white">
        <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={30} className="text-jade-300" />
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">{t("orderSuccess.orderConfirmed")}</h1>
        <p className="text-forest-200 text-sm">{t("orderSuccess.thankYou", { name: order.customer.name.split(' ')[0] })}</p>
        <div className="mt-3 bg-white/15 rounded-2xl px-4 py-2 inline-block">
          <p className="text-xs text-forest-200">{t("orderSuccess.orderNumber")}</p>
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
              <span className="font-bold text-forest-800 text-base">RM{order.total.toFixed(2)}</span>
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

      {/* Status timeline */}
      <div className="card p-6 sm:p-8 mb-6">
        <h2 className="font-semibold text-charcoal mb-6">{t("tracking.orderStatus")}</h2>
        <div className="space-y-0">
          {order.statusTimeline.map((step, i) => {
            const Icon = statusIcons[step.status as keyof typeof statusIcons] ?? CheckCircle2;
            const isCurrent = i === currentStatusIndex + 1;
            const isDone = step.done;
            const isLast = i === order.statusTimeline.length - 1;
            return (
              <div key={step.status} className="flex gap-4">
                {/* Icon + line */}
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                    isDone
                      ? 'bg-forest-700 border-forest-700 text-white'
                      : isCurrent
                      ? 'bg-white border-forest-400 text-forest-500'
                      : 'bg-cream-100 border-cream-300 text-gray-300'
                  }`}>
                    <Icon size={18} />
                  </div>
                  {!isLast && (
                    <div className={`w-0.5 flex-1 min-h-[2rem] mt-1 mb-1 rounded-full ${isDone ? 'bg-forest-400' : 'bg-cream-300'}`} />
                  )}
                </div>
                {/* Content */}
                <div className="pb-6 min-w-0">
                  <p className={`font-semibold ${isDone ? 'text-forest-800' : isCurrent ? 'text-gray-700' : 'text-gray-400'}`}>
                    {t("tracking.timeline." + step.status)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{step.time}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delivery info */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-forest-600" />
            <h3 className="font-semibold text-charcoal">{t("tracking.estimatedDelivery")}</h3>
          </div>
          <p className="text-sm font-semibold text-forest-800">{order.deliveryDate}</p>
          <p className="text-sm text-gray-500">{order.deliveryWindow}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-forest-600" />
            <h3 className="font-semibold text-charcoal">{t("tracking.pickupDetails")}</h3>
          </div>
          <p className="text-sm font-semibold text-gray-800">{t("tracking.unit")} {order.customer.houseUnit}</p>
          {order.customer.apartment && (
            <p className="text-sm text-gray-500">{order.customer.apartment}</p>
          )}
          {order.customer.pickupLocation && (
            <p className="text-sm text-gray-500">{order.customer.pickupLocation}</p>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="card p-6">
        <h3 className="font-semibold text-charcoal mb-4">{t("tracking.orderContents")}</h3>
        <div className="space-y-3 mb-4">
          {order.items.map((item) => (
            <div key={item.comboId ?? item.productId} className="flex gap-3 items-center">
              <ProductImage src={item.image} alt={item.name} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{item.name}</p>
                {item.preparation && <p className="text-xs text-gray-400">{t("cartItem.preparation." + item.preparation)}</p>}
                {isWeightItem(item) ? (
                  <p className="text-xs text-amber-600">~{(item.estimatedWeight ?? 0).toFixed(2)} kg</p>
                ) : (
                  <p className="text-xs text-gray-400">{t("checkout.qty", { count: item.quantity })}</p>
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
                <p className="text-sm font-semibold text-amber-700">≈ RM{(item.price * (item.estimatedWeight ?? 0)).toFixed(2)}</p>
              ) : (
                <p className="text-sm font-semibold text-forest-800">RM{(item.price * item.quantity).toFixed(2)}</p>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-cream-200 pt-3 space-y-1.5">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t("checkout.subtotal")}</span><span>RM{order.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t("checkout.delivery")}</span>
            <span className={order.deliveryFee === 0 ? 'text-jade-600 font-semibold' : ''}>
              {order.deliveryFee === 0 ? t("checkout.free") : `RM${order.deliveryFee.toFixed(2)}`}
            </span>
          </div>
          <div className="flex justify-between font-bold text-base border-t border-cream-200 pt-2">
            <span>{t("checkout.total")}</span>
            <span className="text-forest-800">RM{order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link to="/shop" className="btn-secondary">{t("orderSuccess.continueShopping")}</Link>
      </div>
    </main>
  );
}
