import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Repeat2, Plus, Trash2, Pause, Play, Edit3, X, CheckCircle2, Calendar
} from 'lucide-react';
import { useBaskets } from '../context/BasketContext';
import { useCart } from '../context/CartContext';
import { useDeliveryConfig } from '../context/DeliveryConfigContext';
import type { RecurringBasket, DeliveryDay } from '../types';

const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

function nextDateForDay(day: DeliveryDay): string {
  const today = new Date();
  const target = DAY_MAP[day.toLowerCase()] ?? 3;
  const current = today.getDay();
  let diff = target - current;
  if (diff <= 0) diff += 7;
  const next = new Date(today);
  next.setDate(today.getDate() + diff);
  return next.toLocaleDateString('en-MY', { weekday: 'short', month: 'short', day: 'numeric' });
}

interface EditModalProps {
  basket: RecurringBasket;
  onClose: () => void;
  onSave: (updates: Partial<RecurringBasket>) => void;
}

function EditModal({ basket, onClose, onSave }: EditModalProps) {
  const [name, setName] = useState(basket.name);
  const [frequency, setFrequency] = useState(basket.frequency);
  const [day, setDay] = useState<DeliveryDay>(basket.deliveryDay);
  const { config } = useDeliveryConfig();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-semibold text-charcoal">Edit Basket</h3>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-cream-100 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Basket Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-cream-50 border border-cream-300 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Frequency</label>
            <div className="grid grid-cols-2 gap-2">
              {(['weekly', 'biweekly'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFrequency(f)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                    frequency === f ? 'border-forest-700 bg-forest-700 text-white' : 'border-cream-300 text-gray-600 hover:border-forest-400'
                  }`}
                >
                  {f === 'weekly' ? 'Weekly' : 'Every 2 weeks'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Delivery Day</label>
            <div className="grid grid-cols-2 gap-2">
              {config.days.map((dayOption) => (
                <button
                  key={dayOption}
                  onClick={() => setDay(dayOption.toLowerCase())}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                    day === dayOption.toLowerCase() ? 'border-forest-700 bg-forest-700 text-white' : 'border-cream-300 text-gray-600 hover:border-forest-400'
                  }`}
                >
                  <Calendar size={14} /> {dayOption}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => { onSave({ name, frequency, deliveryDay: day }); onClose(); }}
            className="btn-primary flex-1"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RecurringBasketPage() {
  const { baskets, addBasket, updateBasket, removeBasket, togglePause } = useBaskets();
  const { cart } = useCart();
  const { config } = useDeliveryConfig();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const editingBasket = baskets.find((b) => b.id === editingId);

  const handleSaveCurrentCart = () => {
    if (cart.items.length === 0) return;
    setSaving(true);
    setTimeout(() => {
      const defaultDay = config.days[0]?.toLowerCase() ?? 'wednesday';
      const basket: RecurringBasket = {
        id: `basket-${Date.now()}`,
        name: 'My Weekly Order',
        items: cart.items,
        frequency: 'weekly',
        deliveryDay: cart.deliveryDay ?? defaultDay,
        active: true,
        nextDelivery: nextDateForDay(cart.deliveryDay ?? defaultDay),
        createdAt: new Date().toISOString(),
      };
      addBasket(basket);
      setSaving(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 800);
  };

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-10">
        <h1 className="section-title mb-2">Recurring Baskets</h1>
        <p className="text-gray-500 leading-relaxed max-w-2xl">
          Save your favourite order and have it delivered automatically every week or fortnight. Skip, pause, or cancel anytime.
        </p>
      </div>

      {/* Save current cart CTA */}
      {cart.items.length > 0 && (
        <div className="bg-jade-50 border-2 border-jade-200 rounded-3xl p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-forest-800 mb-1">Turn your current cart into a recurring order</h3>
            <p className="text-sm text-gray-600">
              You have {cart.items.length} item{cart.items.length !== 1 ? 's' : ''} in your cart. Save them as a recurring basket.
            </p>
          </div>
          <button
            onClick={handleSaveCurrentCart}
            disabled={saving}
            className={`btn-primary flex-shrink-0 flex items-center gap-2 ${saving ? 'opacity-70 cursor-wait' : ''}`}
          >
            {saving ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
            ) : (
              <><Plus size={16} /> Save Cart as Basket</>
            )}
          </button>
        </div>
      )}

      {showSuccess && (
        <div className="flex items-center gap-3 bg-jade-100 border border-jade-300 text-jade-800 rounded-2xl px-5 py-3 mb-6">
          <CheckCircle2 size={18} />
          <p className="text-sm font-medium">Recurring basket saved successfully!</p>
        </div>
      )}

      {/* Empty state */}
      {baskets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-forest-100 rounded-full flex items-center justify-center mb-6">
            <Repeat2 size={36} className="text-forest-500" />
          </div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No recurring baskets yet</h3>
          <p className="text-gray-500 text-sm mb-8 max-w-sm">
            Add items to your cart, then save them here as a recurring order. We'll deliver them every {config.days.join(' or ')} automatically.
          </p>
          <Link to="/shop" className="btn-primary">Start Shopping</Link>
        </div>
      )}

      {/* Basket list */}
      <div className="space-y-5">
        {baskets.map((basket) => (
          <div
            key={basket.id}
            className={`card overflow-hidden border-2 transition-all ${
              basket.active ? 'border-transparent' : 'border-amber-200 bg-amber-50/30'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-cream-100">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${basket.active ? 'bg-jade-100' : 'bg-amber-100'}`}>
                  <Repeat2 size={18} className={basket.active ? 'text-jade-600' : 'text-amber-500'} />
                </div>
                <div>
                  <h3 className="font-semibold text-charcoal">{basket.name}</h3>
                  <p className="text-xs text-gray-400">
                    {basket.frequency === 'weekly' ? 'Every week' : 'Every 2 weeks'} ·{' '}
                    <span className="capitalize">{basket.deliveryDay}</span>, {config.time}
                  </p>
                </div>
              </div>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                basket.active ? 'bg-jade-100 text-jade-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {basket.active ? 'Active' : 'Paused'}
              </span>
            </div>

            {/* Items */}
            <div className="px-6 py-4">
              <div className="flex gap-2 flex-wrap mb-3">
                {basket.items.slice(0, 5).map((item) => (
                  <div key={item.productId} className="flex items-center gap-1.5 bg-cream-50 rounded-xl px-2.5 py-1.5 border border-cream-200">
                    <img src={item.image} alt={item.name} className="w-6 h-6 rounded-lg object-cover" />
                    <span className="text-xs text-gray-700">{item.name}</span>
                    <span className="text-xs text-gray-400">×{item.quantity}</span>
                  </div>
                ))}
                {basket.items.length > 5 && (
                  <div className="flex items-center px-2.5 py-1.5 text-xs text-gray-400">
                    +{basket.items.length - 5} more
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Next delivery</p>
                  <p className="text-sm font-semibold text-forest-700">{basket.nextDelivery}</p>
                </div>
                <p className="font-bold text-forest-800">
                  RM{basket.items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-6 pb-5">
              <button
                onClick={() => togglePause(basket.id)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition-all ${
                  basket.active
                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                    : 'bg-jade-50 text-jade-700 hover:bg-jade-100 border border-jade-200'
                }`}
              >
                {basket.active ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}
              </button>
              <button
                onClick={() => setEditingId(basket.id)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-cream-50 text-gray-600 hover:bg-cream-100 border border-cream-200 transition-all"
              >
                <Edit3 size={13} /> Edit
              </button>
              <button
                onClick={() => removeBasket(basket.id)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 border border-red-100 transition-all ml-auto"
              >
                <Trash2 size={13} /> Cancel
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingBasket && (
        <EditModal
          basket={editingBasket}
          onClose={() => setEditingId(null)}
          onSave={(updates) => updateBasket(editingBasket.id, updates)}
        />
      )}
    </main>
  );
}
