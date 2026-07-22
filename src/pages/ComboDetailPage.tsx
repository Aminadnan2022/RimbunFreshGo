import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, Star, Clock, ShoppingCart, ChevronRight, Users, TrendingDown,
} from 'lucide-react';
import { familyCombo, buildComboCartItem } from '../data/combos';
import { fetchProductById } from '../data/products';
import type { Product } from '../types';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useAuthModal } from '../context/AuthModalContext';
import { useDeliveryConfig } from '../context/DeliveryConfigContext';

export default function ComboDetailPage() {
  const { addItem } = useCart();
  const { user } = useAuth();
  const { openSignIn } = useAuthModal();
  const { config } = useDeliveryConfig();
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const [added, setAdded] = useState(false);
  const [comboProducts, setComboProducts] = useState<Record<string, Product | null>>({});

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        familyCombo.items.map(async (item) => [item.productId, await fetchProductById(item.productId)] as const)
      );
      setComboProducts(Object.fromEntries(entries));
    })();
  }, []);

  const handleAdd = () => {
    if (!user) {
      openSignIn('/shop');
      return;
    }
    addItem(buildComboCartItem(
      Object.values(comboProducts).filter(Boolean) as Product[],
      qty
    ));
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const savings = familyCombo.originalValue - familyCombo.price;
  const savingsPct = Math.round((savings / familyCombo.originalValue) * 100);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-gray-400 mb-8">
        <Link to="/" className="hover:text-forest-600">Home</Link>
        <ChevronRight size={12} />
        <span className="text-gray-600">Family Combo</span>
      </nav>

      {/* Hero section */}
      <div className="grid lg:grid-cols-2 gap-10 mb-14">
        {/* Gallery */}
        <div>
          <div className="rounded-3xl overflow-hidden shadow-card mb-3 aspect-[4/3] relative">
            <img
              src={familyCombo.images[activeImg]}
              alt={familyCombo.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 left-4">
              <span className="inline-flex items-center gap-1.5 bg-forest-700 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow">
                <Star size={13} className="fill-yellow-400 text-yellow-400" /> Best Value
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {familyCombo.images.map((img, i) => (
              <button
                key={i}
                onClick={() => setActiveImg(i)}
                className={`rounded-2xl overflow-hidden border-2 transition-all w-20 h-16 flex-shrink-0 ${
                  activeImg === i ? 'border-forest-600 shadow-green' : 'border-cream-300 hover:border-forest-400'
                }`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Details */}
        <div>
          <span className="inline-block bg-jade-100 text-jade-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
            Signature Bundle
          </span>
          <h1 className="font-display text-4xl font-bold text-forest-950 mb-1">{familyCombo.name}</h1>
          <p className="text-lg text-gray-500 mb-4">{familyCombo.tagline}</p>

          {/* Price */}
          <div className="flex items-center gap-3 mb-6">
            <span className="text-5xl font-bold text-forest-800">RM{familyCombo.price}</span>
            <div>
              <p className="text-gray-400 line-through text-xl">RM{familyCombo.originalValue}</p>
              <p className="text-jade-600 font-semibold text-sm">Save RM{savings} ({savingsPct}% off)</p>
            </div>
          </div>

          <p className="text-gray-600 leading-relaxed mb-6">{familyCombo.description}</p>

          {/* What's included */}
          <div className="bg-forest-50 rounded-3xl p-5 mb-6">
            <h3 className="font-semibold text-forest-800 mb-3">What's Included</h3>
            <ul className="space-y-2.5">
              {familyCombo.items.map((item, i) => {
                const product = comboProducts[item.productId];
                return (
                  <li key={i} className="flex items-center gap-2.5">
                    <CheckCircle2 size={16} className="text-jade-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700">{item.label}</span>
                    {product && (
                      <span className="ml-auto text-xs text-gray-400">RM{product.price}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-forest-200 mt-3 pt-3 flex justify-between text-sm font-semibold">
              <span className="text-gray-500">If bought separately</span>
              <span className="text-gray-500 line-through">RM{familyCombo.originalValue}</span>
            </div>
          </div>

          {/* Highlights */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            {familyCombo.highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                <CheckCircle2 size={13} className="text-jade-500 mt-0.5 flex-shrink-0" />
                {h}
              </div>
            ))}
          </div>

          {/* Delivery */}
          <div className="flex items-center gap-2.5 bg-jade-50 border border-jade-200 rounded-2xl px-4 py-3 mb-6">
            <Clock size={16} className="text-jade-600 flex-shrink-0" />
            <p className="text-jade-800 text-sm font-medium">
              Delivered fresh every <strong>{config.days.join(' & ')}</strong>, {config.time}
            </p>
          </div>

          {/* Add to cart */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-cream-100 rounded-2xl px-3 py-2">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white hover:bg-forest-50 text-forest-700 font-bold transition-colors"
                aria-label="Decrease"
              >
                −
              </button>
              <span className="w-8 text-center font-semibold">{qty}</span>
              <button
                onClick={() => setQty(Math.min(10, qty + 1))}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white hover:bg-forest-50 text-forest-700 font-bold transition-colors"
                aria-label="Increase"
              >
                +
              </button>
            </div>
            <button
              onClick={handleAdd}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-base transition-all duration-200 ${
                added
                  ? 'bg-jade-500 text-white'
                  : 'bg-forest-700 hover:bg-forest-800 text-white shadow-green hover:shadow-lg active:scale-95'
              }`}
            >
              <ShoppingCart size={18} />
              {added ? 'Added to Cart!' : `Add ${qty > 1 ? `${qty}x ` : ''}Combo — RM${familyCombo.price * qty}`}
            </button>
          </div>
        </div>
      </div>

      {/* Why the combo */}
      <section className="bg-forest-950 rounded-4xl p-8 sm:p-12 mb-14">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl font-bold text-white mb-2">Why the Family Combo?</h2>
          <p className="text-forest-300">Everything you need for a week of home-cooked meals.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { icon: TrendingDown, title: 'Maximum Savings', desc: `Save RM${savings} versus buying each item separately. That's ${savingsPct}% off the individual prices.` },
            { icon: Users, title: 'Feeds the Family', desc: `Generously portioned for a family of ${familyCombo.servings}. Enough variety for 2–3 different meals.` },
            { icon: CheckCircle2, title: 'Zero Effort', desc: 'All items are prepared fresh the morning of your delivery. Cleaned, descaled, and ready to cook.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-forest-900/60 rounded-3xl p-6 border border-forest-800 text-center">
              <div className="w-12 h-12 bg-jade-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Icon size={24} className="text-jade-400" />
              </div>
              <h3 className="font-semibold text-white mb-2">{title}</h3>
              <p className="text-sm text-forest-300 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
