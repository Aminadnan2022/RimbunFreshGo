import { useState, useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { CheckCircle2, Clock, MapPin, Package, Home, ChevronRight } from 'lucide-react';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import type { Order } from '../types';

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
        <p className="text-gray-500">Loading order...</p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="section-title mb-4">Order Not Found</h2>
        <p className="text-gray-500 mb-6">We couldn't find order #{id}.</p>
        <Link to="/" className="btn-primary">Back to Home</Link>
      </main>
    );
  }

  const currentStatusIndex = order.statusTimeline.filter((s) => s.done).length - 1;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-gray-400 mb-8">
        <Link to="/" className="hover:text-forest-600">Home</Link>
        <ChevronRight size={12} />
        <span className="text-gray-600">Order Tracking</span>
      </nav>

      {/* Confirmation banner */}
      <div className="gradient-forest rounded-3xl p-6 sm:p-8 mb-8 text-center text-white">
        <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={30} className="text-jade-300" />
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">Order Confirmed!</h1>
        <p className="text-forest-200 text-sm">Thank you, {order.customer.name.split(' ')[0]}.</p>
        <div className="mt-3 bg-white/15 rounded-2xl px-4 py-2 inline-block">
          <p className="text-xs text-forest-200">Order ID</p>
          <p className="font-mono font-bold text-white">{order.id}</p>
        </div>
      </div>

      {/* Payment Status */}
      <div className="card p-6 sm:p-8 mb-6">
        <h2 className="font-semibold text-charcoal mb-4">Payment Status</h2>
        {order.paymentStatus === 'Pending' && (
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="font-semibold text-amber-700">Pending</span>
          </div>
        )}
        {order.paymentStatus === 'Ready To Pay' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-orange-400 flex-shrink-0" />
              <span className="font-semibold text-orange-700">Ready To Pay</span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-cream-200 pt-3">
              <span className="text-gray-600 font-medium">Final Amount</span>
              <span className="font-bold text-forest-800 text-base">RM{order.total.toFixed(2)}</span>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-sm text-orange-800 leading-relaxed">
              Your order has been weighed and is ready for payment.
              Please make payment using the QR code sent via WhatsApp.
              After payment, reply with your payment receipt.
            </div>
          </div>
        )}
        {order.paymentStatus === 'Paid' && (
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
            <span className="font-semibold text-green-700">Paid</span>
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
        <h2 className="font-semibold text-charcoal mb-6">Order Status</h2>
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
                    {step.status}
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
            <h3 className="font-semibold text-charcoal">Delivery Window</h3>
          </div>
          <p className="text-sm font-semibold text-forest-800">{order.deliveryDate}</p>
          <p className="text-sm text-gray-500">{order.deliveryWindow}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-forest-600" />
            <h3 className="font-semibold text-charcoal">Pickup Details</h3>
          </div>
          <p className="text-sm font-semibold text-gray-800">Unit {order.customer.houseUnit}</p>
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
        <h3 className="font-semibold text-charcoal mb-4">Order Contents</h3>
        <div className="space-y-3 mb-4">
          {order.items.map((item) => (
            <div key={item.comboId ?? item.productId} className="flex gap-3 items-center">
              <img src={item.image} alt={item.name} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{item.name}</p>
                {item.preparation && <p className="text-xs text-gray-400 capitalize">{item.preparation}</p>}
                <p className="text-xs text-gray-400">Qty {item.quantity}</p>
              </div>
              <p className="text-sm font-semibold text-forest-800">RM{(item.price * item.quantity).toFixed(2)}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-cream-200 pt-3 space-y-1.5">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span><span>RM{order.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Delivery</span>
            <span className={order.deliveryFee === 0 ? 'text-jade-600 font-semibold' : ''}>
              {order.deliveryFee === 0 ? 'FREE' : `RM${order.deliveryFee.toFixed(2)}`}
            </span>
          </div>
          <div className="flex justify-between font-bold text-base border-t border-cream-200 pt-2">
            <span>Total</span>
            <span className="text-forest-800">RM{order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link to="/shop" className="btn-secondary">Continue Shopping</Link>
      </div>
    </main>
  );
}
