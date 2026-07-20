import { Link } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { ShoppingBag, ArrowRight, Trash2, Clock, Package } from 'lucide-react';
import { getPrepLabel } from '../lib/preparationOptions';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import DeliverySlotSelector from '../components/ui/DeliverySlotSelector';
import QuantityStepper from '../components/ui/QuantityStepper';
import type { DeliveryDay } from '../types';

export default function CartPage() {
  const { user } = useAuth();
  const { cart, removeItem, updateQty, setDeliveryDay, subtotal, itemCount } = useCart();
  const deliveryFee = subtotal >= 50 ? 0 : 5;
  const total = subtotal + deliveryFee;

  if (!user) return <Navigate to="/" replace />;

  if (cart.items.length === 0) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex flex-col items-center text-center">
        <div className="w-24 h-24 bg-cream-100 rounded-full flex items-center justify-center mb-6">
          <ShoppingBag size={40} className="text-cream-400" />
        </div>
        <h2 className="text-2xl font-display font-bold text-forest-950 mb-2">Your cart is empty</h2>
        <p className="text-gray-500 mb-8">Add some fresh proteins to get started.</p>
        <Link to="/shop" className="btn-primary flex items-center gap-2">
          Start Shopping <ArrowRight size={16} />
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="section-title mb-8">Your Cart ({itemCount} {itemCount === 1 ? 'item' : 'items'})</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {cart.items.map((item) => (
            <div key={item.comboId ?? item.productId} className="card p-4 sm:p-5">
              {/* Combo header */}
              <div className="flex gap-4">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="font-semibold text-charcoal leading-snug">{item.name}</p>
                      {item.preparation && (
                        <p className="text-xs text-gray-400 mt-0.5">{getPrepLabel(item.preparation)}</p>
                      )}
                      {item.isCombo && (
                        <span className="inline-block bg-forest-100 text-forest-700 text-xs font-semibold px-2 py-0.5 rounded-full mt-1">
                          Combo Bundle
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(item.productId, item.comboId)}
                      className="p-1.5 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <QuantityStepper
                      value={item.quantity}
                      onChange={(v) => updateQty(item.productId, v, item.comboId)}
                      size="sm"
                    />
                    <p className="font-bold text-forest-800">RM{(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">RM{item.price} × {item.quantity} {item.unit}</p>
                </div>
              </div>
              {/* Expanded combo items */}
              {item.comboItems && item.comboItems.length > 0 && (
                <div className="mt-3 pt-3 border-t border-cream-200 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contains</p>
                  {item.comboItems.map((ci) => (
                    <div key={ci.productId} className="flex items-center gap-2 text-sm">
                      <Package size={13} className="text-forest-400 flex-shrink-0" />
                      <span className="text-gray-700">{ci.label}</span>
                      {ci.preparation && (
                        <span className="text-xs text-gray-400">({getPrepLabel(ci.preparation)})</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <Link to="/shop" className="flex items-center gap-2 text-sm text-forest-600 hover:text-forest-800 font-medium transition-colors px-1">
            <ArrowRight size={15} className="rotate-180" /> Continue shopping
          </Link>
        </div>

        {/* Order summary */}
        <div className="space-y-4">
          {/* Delivery slot */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-forest-600" />
              <h3 className="font-semibold text-charcoal">Delivery Slot</h3>
            </div>
            <DeliverySlotSelector
              selected={cart.deliveryDay}
              onChange={(day: DeliveryDay) => setDeliveryDay(day)}
            />
            {!cart.deliveryDay && (
              <p className="text-xs text-amber-600 mt-2 font-medium">Please select a delivery day to continue.</p>
            )}
          </div>

          {/* Summary */}
          <div className="card p-5">
            <h3 className="font-semibold text-charcoal mb-4">Order Summary</h3>
            <div className="space-y-2.5 mb-4">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal ({itemCount} items)</span>
                <span>RM{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Delivery fee</span>
                <span className={deliveryFee === 0 ? 'text-jade-600 font-semibold' : ''}>
                  {deliveryFee === 0 ? 'FREE' : `RM${deliveryFee.toFixed(2)}`}
                </span>
              </div>
              {deliveryFee > 0 && (
                <p className="text-xs text-gray-400">Free delivery on orders RM50 and above</p>
              )}
              <div className="border-t border-cream-200 pt-2.5 flex justify-between font-bold text-base">
                <span>Total</span>
                <span className="text-forest-800">RM{total.toFixed(2)}</span>
              </div>
            </div>
            <Link
              to="/checkout"
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold transition-all ${
                cart.deliveryDay
                  ? 'btn-primary'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
              }`}
              aria-disabled={!cart.deliveryDay}
            >
              Proceed to Checkout <ArrowRight size={16} />
            </Link>
          </div>

          {/* Trust note */}
          <div className="bg-jade-50 border border-jade-200 rounded-2xl p-4 text-xs text-jade-800 leading-relaxed">
            All items are prepared fresh the morning of your delivery. Never frozen.
          </div>
        </div>
      </div>
    </main>
  );
}
