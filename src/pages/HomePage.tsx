import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Shield, Snowflake, Clock, Star, ChevronRight, Repeat2, CheckCircle2, Loader2
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useDeliveryConfig } from '../context/DeliveryConfigContext';
import DeliverySlotSelector from '../components/ui/DeliverySlotSelector';
import type { DeliveryDay } from '../types';
import { familyCombo, buildExpandedComboItems } from '../data/combos';
import { fetchProducts } from '../data/products';
import { useProducts } from '../hooks/useProducts';
import ProductCard from '../components/ui/ProductCard';

const categories = [
  {
    id: 'chicken',
    label: 'Chicken',
    labelMs: 'Ayam',
    image: 'https://images.pexels.com/photos/2338407/pexels-photo-2338407.jpeg?auto=compress&cs=tinysrgb&w=600',
    color: 'from-amber-700 to-amber-500',
  },
  {
    id: 'fish',
    label: 'Fish',
    labelMs: 'Ikan',
    image: 'https://images.pexels.com/photos/1430673/pexels-photo-1430673.jpeg?auto=compress&cs=tinysrgb&w=600',
    color: 'from-teal-700 to-teal-500',
  },
  {
    id: 'prawns',
    label: 'Prawns',
    labelMs: 'Udang',
    image: 'https://images.pexels.com/photos/566344/pexels-photo-566344.jpeg?auto=compress&cs=tinysrgb&w=600',
    color: 'from-orange-600 to-red-500',
  },
  {
    id: 'squid',
    label: 'Squid',
    labelMs: 'Sotong',
    image: 'https://images.pexels.com/photos/7176317/pexels-photo-7176317.jpeg?auto=compress&cs=tinysrgb&w=600',
    color: 'from-slate-600 to-slate-400',
  },
];

export default function HomePage() {
  const [selectedDay, setSelectedDay] = useState<DeliveryDay | null>(null);
  const { setDeliveryDay, addItem } = useCart();
  const { user } = useAuth();
  const { config } = useDeliveryConfig();
  const [comboAdded, setComboAdded] = useState(false);
  const { products, loading, error } = useProducts();
  const popularProducts = products.filter((p) => p.isPopular).slice(0, 4);

  const daysShort = config.days.map((d) => d.slice(0, 3)).join(' & ');

  const trustIndicators = [
    {
      icon: CheckCircle2,
      title: 'Prepared Fresh Daily',
      desc: 'Every item is slaughtered, cleaned, or caught the same morning as your delivery.',
    },
    {
      icon: Snowflake,
      title: 'Never Frozen',
      desc: 'We never freeze our products. What you receive is genuinely fresh \u2014 not defrosted.',
    },
    {
      icon: Clock,
      title: 'Scheduled Delivery',
      desc: `${daysShort}, ${config.time} only. Fixed slots mean we plan every delivery to stay fresh.`,
    },
    {
      icon: Shield,
      title: 'Clean & Safe Handling',
      desc: 'HACCP-aligned handling, halal-certified suppliers, and temperature-controlled delivery bags.',
    },
  ];

  const handleDaySelect = (day: DeliveryDay) => {
    setSelectedDay(day);
    setDeliveryDay(day);
  };

  const handleAddCombo = useCallback(async () => {
    try {
      const allProducts = await fetchProducts();
      const expanded = buildExpandedComboItems(
        familyCombo.items.map((ci) => allProducts.find((p) => p.id === ci.productId)).filter(Boolean) as import('../types').Product[]
      );
      addItem({
        productId: familyCombo.id,
        comboId: familyCombo.id,
        name: familyCombo.name,
        image: familyCombo.image,
        price: familyCombo.price,
        unit: 'combo',
        quantity: 1,
        isCombo: true,
        comboItems: expanded,
      });
      setComboAdded(true);
      setTimeout(() => setComboAdded(false), 2000);
    } catch {
      // silently fail — products may not load
    }
  }, [addItem]);

  return (
    <main>
      {/* Hero — only shown when signed out */}
      {!user && (
      <section className="gradient-hero relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.3),_transparent_60%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 lg:py-32">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 text-jade-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 bg-jade-400 rounded-full animate-pulse" />
              Fresh deliveries this {config.days.join(' & ')}
            </span>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Freshly prepared.{' '}
              <span className="text-jade-400">Straight to your door.</span>
            </h1>
            <p className="text-forest-200 text-lg sm:text-xl leading-relaxed mb-8 max-w-2xl">
              Premium fresh proteins — whole chicken, local fish, prawns, and squid — prepared every morning and delivered same day. No freezing. No compromise.
            </p>

            {/* Delivery slot selector */}
            <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-5 border border-white/15 mb-8 max-w-md">
              <p className="text-white font-semibold mb-3 text-sm">Choose your delivery slot</p>
              <DeliverySlotSelector selected={selectedDay} onChange={handleDaySelect} />
              {selectedDay && (
                <p className="text-jade-300 text-xs mt-3 font-medium">
                  Great! You've selected {selectedDay.charAt(0).toUpperCase() + selectedDay.slice(1)} {config.time} delivery.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link to="/shop" className="btn-primary bg-jade-500 hover:bg-jade-600 shadow-none flex items-center gap-2">
                Shop Now <ArrowRight size={16} />
              </Link>
              <Link to="/combo" className="bg-white/15 hover:bg-white/25 text-white font-semibold px-6 py-3 rounded-2xl transition-all border border-white/20 flex items-center gap-2">
                View Family Combo <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="section-title">Shop by Category</h2>
            <p className="text-gray-500 mt-1">Everything fresh, prepared the same morning.</p>
          </div>
          <Link to="/shop" className="hidden sm:flex items-center gap-1 text-forest-700 font-semibold text-sm hover:text-forest-900 transition-colors">
            View all <ChevronRight size={16} />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              to={`/shop?category=${cat.id}`}
              className="relative rounded-3xl overflow-hidden aspect-square group shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1"
            >
              <img
                src={cat.image}
                alt={cat.label}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              <div className={`absolute inset-0 bg-gradient-to-t ${cat.color} opacity-60 group-hover:opacity-70 transition-opacity`} />
              <div className="absolute inset-0 flex flex-col items-center justify-end p-4 pb-5">
                <p className="text-white font-display font-bold text-xl sm:text-2xl drop-shadow">{cat.label}</p>
                <p className="text-white/80 text-xs font-medium mt-0.5">{cat.labelMs}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Family Combo — Prominent Feature */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="relative gradient-hero rounded-4xl overflow-hidden shadow-green">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(78,222,128,0.4),_transparent_60%)]" />
          <div className="grid md:grid-cols-2 gap-0">
            {/* Text side */}
            <div className="p-8 sm:p-10 lg:p-14 flex flex-col justify-center">
              <span className="inline-flex w-fit items-center gap-1.5 bg-white/10 border border-white/20 text-jade-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
                <Star size={11} className="fill-jade-300" /> Best Value
              </span>
              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-3">
                Family Combo
              </h2>
              <div className="flex items-baseline gap-2 mb-5">
                <span className="text-5xl font-bold text-jade-400">RM50</span>
                <span className="text-forest-300 line-through text-xl">RM83</span>
                <span className="bg-jade-500/20 text-jade-300 text-sm font-semibold px-2 py-0.5 rounded-lg">Save RM33</span>
              </div>
              <ul className="space-y-2.5 mb-8">
                {familyCombo.items.map((item, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-forest-200 text-sm">
                    <CheckCircle2 size={16} className="text-jade-400 flex-shrink-0" />
                    {item.label}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleAddCombo}
                  className={`flex items-center gap-2 font-semibold px-6 py-3 rounded-2xl transition-all duration-200 active:scale-95 ${
                    comboAdded
                      ? 'bg-jade-500 text-white'
                      : 'bg-white text-forest-900 hover:bg-jade-50 shadow-lg'
                  }`}
                >
                  {comboAdded ? 'Added to Cart!' : 'Add Combo to Cart'}
                </button>
                <Link
                  to="/combo"
                  className="flex items-center gap-1.5 text-white/80 hover:text-white font-medium text-sm py-3 transition-colors"
                >
                  Learn more <ChevronRight size={15} />
                </Link>
              </div>
            </div>
            {/* Image side */}
            <div className="relative hidden md:block">
              <img
                src={familyCombo.image}
                alt="Family Combo fresh seafood spread"
                className="w-full h-full object-cover opacity-80 mix-blend-luminosity"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-forest-950/50 to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* Popular Products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="section-title">Popular Items</h2>
            <p className="text-gray-500 mt-1">Customer favourites, fresh every delivery day.</p>
          </div>
          <Link to="/shop" className="hidden sm:flex items-center gap-1 text-forest-700 font-semibold text-sm hover:text-forest-900 transition-colors">
            View all <ChevronRight size={16} />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {loading ? (
            <div className="col-span-full flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-forest-500" size={32} />
            </div>
          ) : error ? (
            <div className="col-span-full text-center py-16 text-red-500 text-sm">{error}</div>
          ) : popularProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Recurring Basket CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="bg-jade-50 border-2 border-jade-200 rounded-4xl p-8 sm:p-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="w-14 h-14 bg-jade-100 rounded-3xl flex items-center justify-center flex-shrink-0">
              <Repeat2 size={28} className="text-jade-700" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold text-forest-950 mb-1">Set Up a Recurring Basket</h2>
              <p className="text-gray-600 leading-relaxed max-w-lg">
                Order the same items every week or fortnight. Skip the reordering — we remember your favourites, you just pick them up at the door.
              </p>
            </div>
          </div>
          <Link to="/recurring" className="btn-primary flex-shrink-0 flex items-center gap-2 whitespace-nowrap">
            Get Started <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Trust indicators */}
      <section className="bg-forest-950 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="font-display text-3xl font-bold text-white mb-2">Why Rimbun FreshGo?</h2>
            <p className="text-forest-300">We built this service around one principle: real freshness, no shortcuts.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {trustIndicators.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-forest-900/60 rounded-3xl p-6 border border-forest-800">
                <div className="w-11 h-11 bg-jade-500/20 rounded-2xl flex items-center justify-center mb-4">
                  <Icon size={22} className="text-jade-400" />
                </div>
                <h3 className="font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm text-forest-300 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
