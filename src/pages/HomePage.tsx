import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Shield, Snowflake, Clock, ChevronRight, Repeat2, CheckCircle2, Loader2
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useWebsiteSettings } from '../context/WebsiteSettingsContext';
import { isHomepageSectionEnabled, isPageEnabled } from '../lib/websiteVisibility';
import DeliverySlotSelector from '../components/ui/DeliverySlotSelector';
import type { DeliveryDay, ComboWithItems } from '../types';
import { fetchActiveComboList } from '../data/combos';
import { useProducts } from '../hooks/useProducts';
import ProductImage from '../components/ui/ProductImage';
import ProductCard from '../components/ui/ProductCard';
import ComboCard from '../components/combo/ComboCard';
import GuestLandingExperience from '../components/home/GuestLandingExperience';
import DeliveryTimingBadge from '../components/home/DeliveryTimingBadge';
import DeliveryFeeChecker from '../components/home/DeliveryFeeChecker';

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
  const { setDeliveryDay } = useCart();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { settings } = useWebsiteSettings();
  const { products, loading: productsLoading, error: productsError } = useProducts();
  const [combos, setCombos] = useState<ComboWithItems[]>([]);
  const [comboLoading, setComboLoading] = useState(true);
  const popularProducts = products.filter((p) => p.isPopular).slice(0, 4);
  const categoryImages: Record<string, string> = {
    chicken: settings.home_category_chicken_image,
    fish: settings.home_category_fish_image,
    prawns: settings.home_category_prawns_image,
    squid: settings.home_category_squid_image,
  };

  useEffect(() => {
    (async () => {
      setComboLoading(true);
      try {
        const data = await fetchActiveComboList();
        setCombos(data);
      } catch (err) {
        console.error('Failed to load combos:', err);
      } finally {
        setComboLoading(false);
      }
    })();
  }, []);

  const trustIndicators = [
    {
      icon: CheckCircle2,
      title: t("homepage.trust.freshDaily.title"),
      desc: t("homepage.trust.freshDaily.desc"),
    },
    {
      icon: Snowflake,
      title: t("homepage.trust.neverFrozen.title"),
      desc: t("homepage.trust.neverFrozen.desc"),
    },
    {
      icon: Clock,
      title: t("homepage.trust.scheduledDelivery.title"),
      desc: t("homepage.trust.scheduledDelivery.desc"),
    },
    {
      icon: Shield,
      title: t("homepage.trust.cleanSafe.title"),
      desc: t("homepage.trust.cleanSafe.desc"),
    },
  ];

  const handleDaySelect = (day: DeliveryDay) => {
    setSelectedDay(day);
    setDeliveryDay(day);
  };

  return (
    <main>
      {/* Hero — only shown when signed out */}
      {!user && (
        <GuestLandingExperience
          badge={<DeliveryTimingBadge />}
          showShop={isPageEnabled(settings, 'shop')}
          showCombos={isPageEnabled(settings, 'family_combo')}
          deliverySelector={isHomepageSectionEnabled(settings, 'delivery_schedule') ? (
            <div className="mt-8 max-w-md rounded-3xl border border-white/80 bg-white/70 p-5 shadow-soft backdrop-blur-md">
              <p className="mb-3 text-sm font-semibold text-forest-950">{t("homepage.hero.chooseSlot")}</p>
              <p className="mb-3 text-xs leading-5 text-gray-600">{t('homepage.hero.deliveryPolicy')}</p>
              <DeliverySlotSelector selected={selectedDay} onChange={handleDaySelect} />
              {selectedDay && (
                <p className="mt-3 text-xs font-medium text-forest-700">
                  {t("homepage.hero.selectedSlot", { day: t(`days.${selectedDay.toLowerCase()}`) })}
                </p>
              )}
            </div>
          ) : undefined}
        />
      )}

      <DeliveryFeeChecker />

      {/* Categories */}
      {isPageEnabled(settings, 'shop') && (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="section-title">{t("homepage.categories.title")}</h2>
            <p className="text-gray-500 mt-1">{t("homepage.categories.subtitle")}</p>
          </div>
          <Link to="/shop" className="hidden sm:flex items-center gap-1 text-forest-700 font-semibold text-sm hover:text-forest-900 transition-colors">
            {t("homepage.categories.viewAll")} <ChevronRight size={16} />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              to={`/shop?category=${cat.id}`}
              className="relative rounded-3xl overflow-hidden aspect-square group shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1"
            >
              <ProductImage
                src={categoryImages[cat.id] || cat.image}
                alt={t("homepage.categories." + cat.id)}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className={`absolute inset-0 bg-gradient-to-t ${cat.color} opacity-60 group-hover:opacity-70 transition-opacity`} />
              <div className="absolute inset-0 flex flex-col items-center justify-end p-4 pb-5">
                <p className="text-white font-display font-bold text-xl sm:text-2xl drop-shadow">{t("homepage.categories." + cat.id)}</p>
                <p className="text-white/80 text-xs font-medium mt-0.5">{t("homepage.categories." + cat.id)}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      )}

      {/* Combo Packages */}
      {isHomepageSectionEnabled(settings, 'featured_combos') && (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {comboLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-forest-500" size={32} />
          </div>
        ) : combos.length > 0 ? (
          <>
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="section-title">{t("homepage.combo.title")}</h2>
                <p className="text-gray-500 mt-1">{t("homepage.combo.subtitle")}</p>
              </div>
              <Link to="/combos" className="hidden sm:flex items-center gap-1 text-forest-700 font-semibold text-sm hover:text-forest-900 transition-colors">
                {t("homepage.combo.viewAll")} <ChevronRight size={16} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {combos.slice(0, 4).map((cw) => (
                <ComboCard key={cw.combo.id} comboWithItems={cw} products={products} hideDescription />
              ))}
            </div>
          </>
        ) : null}
      </section>
      )}

      {/* Popular Products */}
      {isHomepageSectionEnabled(settings, 'featured_products') && (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="section-title">{t("homepage.popular.title")}</h2>
            <p className="text-gray-500 mt-1">{t("homepage.popular.subtitle")}</p>
          </div>
          <Link to="/shop" className="hidden sm:flex items-center gap-1 text-forest-700 font-semibold text-sm hover:text-forest-900 transition-colors">
            {t("homepage.popular.viewAll")} <ChevronRight size={16} />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {productsLoading ? (
            <div className="col-span-full flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-forest-500" size={32} />
            </div>
          ) : productsError ? (
            <div className="col-span-full text-center py-16 text-red-500 text-sm">{productsError}</div>
          ) : popularProducts.map((product) => (
            <ProductCard key={product.id} product={product} hideDescription />
          ))}
        </div>
      </section>
      )}

      {/* Recurring Basket CTA */}
      {isPageEnabled(settings, 'recurring_basket') && (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="bg-jade-50 border-2 border-jade-200 rounded-4xl p-8 sm:p-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="w-14 h-14 bg-jade-100 rounded-3xl flex items-center justify-center flex-shrink-0">
              <Repeat2 size={28} className="text-jade-700" />
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold text-forest-950 mb-1">{t("homepage.recurring.title")}</h2>
              <p className="text-gray-600 leading-relaxed max-w-lg">
                {t("homepage.recurring.description")}
              </p>
            </div>
          </div>
          <Link to="/recurring" className="btn-primary flex-shrink-0 flex items-center gap-2 whitespace-nowrap">
            {t("homepage.recurring.cta")} <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      )}

      {/* Trust indicators */}
      {isHomepageSectionEnabled(settings, 'why_freshgo') && (
      <section className="bg-forest-950 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="font-display text-3xl font-bold text-white mb-2">{t("homepage.trust.title")}</h2>
            <p className="text-forest-300">{t("homepage.trust.subtitle")}</p>
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
      )}
    </main>
  );
}
