import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  CheckCircle2, Star, Clock, ShoppingCart, ChevronRight, Users, TrendingDown, Loader2,
} from 'lucide-react';
import { fetchComboBySlug, fetchActiveComboList, buildSelectedComboCartItem } from '../data/combos';
import { useProducts } from '../hooks/useProducts';
import { getVendorById } from '../data/vendors';
import { getPrepLabel } from '../lib/preparationOptions';
import { computeComboItemSubtotal } from '../lib/sellingOptions';
import type { Product, ComboWithItems, DbComboItem, PreparationOption } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useAuthModal } from '../context/AuthModalContext';
import { useDeliveryConfig } from '../context/DeliveryConfigContext';
import { useWebsiteSettings } from '../context/WebsiteSettingsContext';
import ProductImage from '../components/ui/ProductImage';
import ComboCard from '../components/combo/ComboCard';
import FeatureDisabledPage from '../components/system/FeatureDisabledPage';
import { formatCurrency } from '../lib/currency';

function itemQtyLabel(ci: DbComboItem): string {
  if (ci.selling_unit === 'kg') return `${ci.quantity_value} kg`;
  return `${Math.round(ci.quantity_value)} ×`;
}

function itemWeightLabel(ci: DbComboItem, product?: Product): string | null {
  if (ci.selling_unit === 'kg') return `${ci.quantity_value} kg`;
  if (product && product.averageWeight && product.averageWeight > 0) {
    const kg = (ci.quantity_value * product.averageWeight) / 1000;
    return `≈ ${kg.toFixed(2).replace(/\.?0+$/, '')} kg`;
  }
  return null;
}

function formatComboItemPrice(ci: DbComboItem, product: Product): number {
  return computeComboItemSubtotal(product, ci.quantity_value, ci.selling_unit ?? 'piece');
}

export default function ComboDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { addItem } = useCart();
  const { user } = useAuth();
  const { openSignIn } = useAuthModal();
  const { config } = useDeliveryConfig();
  const { settings, loading: settingsLoading } = useWebsiteSettings();
  const { t } = useLanguage();
  const { products } = useProducts();
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const [added, setAdded] = useState(false);
  const [comboWithItems, setComboWithItems] = useState<ComboWithItems | null>(null);
  const [related, setRelated] = useState<ComboWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChoices, setSelectedChoices] = useState<Record<string, string>>({});
  const [choiceError, setChoiceError] = useState(false);

  useEffect(() => {
    (async () => {
      if (!slug) { setLoading(false); return; }
      setLoading(true);
      try {
        const result = await fetchComboBySlug(slug);
        setComboWithItems(result);
        if (result) {
          const list = await fetchActiveComboList();
          setRelated(list.filter((c) => c.combo.slug !== result.combo.slug).slice(0, 4));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const comboProducts = useMemo(
    () => (comboWithItems ? comboWithItems.items.map((ci) => productMap.get(ci.product_id)).filter((p): p is Product => Boolean(p)) : []),
    [comboWithItems, productMap]
  );
  const choiceGroups = useMemo(() => {
    const groups = new Map<string, DbComboItem[]>();
    comboWithItems?.items.forEach((item) => {
      if (!item.choice_group_key) return;
      groups.set(item.choice_group_key, [...(groups.get(item.choice_group_key) ?? []), item]);
    });
    return [...groups.entries()];
  }, [comboWithItems]);

  if (!settingsLoading && !settings.show_family_combo) {
    return <FeatureDisabledPage />;
  }

  const handleAdd = () => {
    if (!user) {
      openSignIn('/combos');
      return;
    }
    if (!comboWithItems) return;
    if (choiceGroups.some(([key]) => !selectedChoices[key])) {
      setChoiceError(true);
      return;
    }
    addItem(buildSelectedComboCartItem(comboWithItems, comboProducts, Object.values(selectedChoices), qty));
    setChoiceError(false);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex items-center justify-center">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </main>
    );
  }

  if (!comboWithItems) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <p className="text-gray-500">{t("comboDetail.notFound")}</p>
        <Link to="/combos" className="text-forest-600 hover:underline mt-4 inline-block">
          {t("comboDetail.backToCombos")}
        </Link>
      </main>
    );
  }

  const combo = comboWithItems.combo;
  const savings = Math.max(0, Number(combo.original_value) - Number(combo.price));
  const savingsPct = Number(combo.discount_percent) || (Number(combo.original_value) > 0 ? Math.round((savings / Number(combo.original_value)) * 100) : 0);

  return (
    <main className="w-full min-w-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* Breadcrumb */}
      <nav className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400 mb-6 sm:mb-8">
        <Link to="/" className="hover:text-forest-600">{t("comboDetail.breadcrumbHome")}</Link>
        <ChevronRight size={12} />
        <Link to="/combos" className="hover:text-forest-600">{t("comboDetail.breadcrumbCombos")}</Link>
        <ChevronRight size={12} />
        <span className="min-w-0 break-words text-gray-600">{combo.name}</span>
      </nav>

      {/* Hero section */}
      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 mb-10 sm:mb-14">
        {/* Gallery */}
        <div className="min-w-0">
          <div className="rounded-3xl overflow-hidden shadow-card mb-3 aspect-[4/3] relative">
            <ProductImage
              src={(combo.images ?? [])[activeImg] || combo.image}
              alt={combo.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 left-4">
              <span className="inline-flex items-center gap-1.5 bg-forest-700 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow">
                <Star size={13} className="fill-yellow-400 text-yellow-400" /> {combo.badge || t("comboDetail.bestValue")}
              </span>
            </div>
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {(combo.images ?? []).length > 0 ? (combo.images ?? []).map((img, i) => (
              <button
                key={i}
                onClick={() => setActiveImg(i)}
                className={`rounded-2xl overflow-hidden border-2 transition-all w-20 h-16 flex-shrink-0 ${
                  activeImg === i ? 'border-forest-600 shadow-green' : 'border-cream-300 hover:border-forest-400'
                }`}
              >
                <ProductImage src={img} alt="" className="w-full h-full object-cover" />
              </button>
            )) : combo.image && (
              <button className="rounded-2xl overflow-hidden border-2 border-forest-600 w-20 h-16 flex-shrink-0">
                <ProductImage src={combo.image} alt="" className="w-full h-full object-cover" />
              </button>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="min-w-0">
          {combo.category_label && (
            <span className="inline-block bg-jade-100 text-jade-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
              {combo.category_label}
            </span>
          )}
          <h1 className="break-words font-display text-3xl sm:text-4xl font-bold text-forest-950 mb-1">{combo.name}</h1>
          {combo.tagline && <p className="text-lg text-gray-500 mb-4">{combo.tagline}</p>}

          {/* Price */}
          <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-1 mb-6">
            <span className="min-w-0 break-all text-4xl sm:text-5xl font-bold text-forest-800">RM{formatCurrency(Number(combo.price))}</span>
            {Number(combo.original_value) > 0 && (
              <div>
                <p className="text-gray-400 line-through text-xl">RM{formatCurrency(Number(combo.original_value))}</p>
                <p className="text-jade-600 font-semibold text-sm">{t("comboDetail.savePrice", { savings: formatCurrency(savings), pct: savingsPct })}</p>
              </div>
            )}
          </div>

          <p className="text-gray-600 leading-relaxed mb-6">{combo.description}</p>

          {/* What's included */}
          <div className="bg-forest-50 rounded-3xl p-5 mb-6">
            <h3 className="font-semibold text-forest-800 mb-3">{t("comboDetail.whatsIncluded")}</h3>
            <ul className="space-y-3">
              {comboWithItems.items.filter((item) => !item.choice_group_key).map((ci) => {
                const product = comboProducts.find((p) => p.id === ci.product_id);
                const prep = ci.preparation ? getPrepLabel(ci.preparation as PreparationOption) : null;
                const weight = itemWeightLabel(ci, product);
                const vendor = product ? getVendorById(product.vendorId)?.name : undefined;
                return (
                  <li key={ci.id} className="bg-white rounded-2xl border border-cream-200 p-3 flex items-start gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-cream-100">
                      <ProductImage src={product?.image} alt={product?.name ?? ci.product_id} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {product?.name ?? ci.custom_label ?? ci.product_id}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
                        <span className="font-medium text-forest-700">{itemQtyLabel(ci)}</span>
                        {prep && <span>{t("comboDetail.preparedAs", { prep })}</span>}
                        {weight && <span>{weight}</span>}
                        {vendor && <span>{t("comboDetail.vendor", { vendor })}</span>}
                      </div>
                    </div>
                    {product && (
                      <span className="text-xs text-gray-400 flex-shrink-0 self-start">RM{formatCurrency(formatComboItemPrice(ci, product))}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {choiceGroups.map(([key, options]) => (
              <fieldset key={key} className="mt-4 rounded-2xl border border-jade-200 bg-white p-4">
                <legend className="px-1 text-sm font-semibold text-forest-800">
                  {options[0]?.choice_group_label || 'Customer Choice'} <span className="text-xs font-normal text-gray-500">— Choose 1</span>
                </legend>
                <div className="mt-2 space-y-2">
                  {options.map((option) => {
                    const product = productMap.get(option.product_id);
                    return (
                      <label key={option.id} className={`flex min-w-0 cursor-pointer flex-wrap items-center gap-3 rounded-xl border p-3 ${selectedChoices[key] === option.id ? 'border-forest-600 bg-forest-50' : 'border-cream-200'}`}>
                        <input
                          type="radio"
                          name={`choice-${key}`}
                          value={option.id}
                          checked={selectedChoices[key] === option.id}
                          onChange={() => { setSelectedChoices((current) => ({ ...current, [key]: option.id })); setChoiceError(false); }}
                        />
                        <ProductImage src={product?.image} alt="" className="h-10 w-10 rounded-lg object-cover" />
                        <span className="min-w-0 flex-1 break-words text-sm font-medium text-gray-900">{product?.name ?? option.custom_label ?? option.product_id}</span>
                        <span className="text-xs text-gray-500">{itemQtyLabel(option)}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            {choiceError && <p role="alert" className="mt-3 text-sm font-medium text-red-600">Please choose one option from every Customer Choice.</p>}
            {Number(combo.original_value) > 0 && (
              <div className="border-t border-forest-200 mt-4 pt-3 flex justify-between text-sm font-semibold">
                <span className="text-gray-500">{t("comboDetail.ifBoughtSeparately")}</span>
                <span className="text-gray-500 line-through">RM{formatCurrency(Number(combo.original_value))}</span>
              </div>
            )}
          </div>

          {/* Highlights */}
          {(combo.highlights ?? []).length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-6">
              {(combo.highlights ?? []).map((h, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <CheckCircle2 size={13} className="text-jade-500 mt-0.5 flex-shrink-0" />
                  {h}
                </div>
              ))}
            </div>
          )}

          {/* Delivery */}
          <div className="flex items-center gap-2.5 bg-jade-50 border border-jade-200 rounded-2xl px-4 py-3 mb-6">
            <Clock size={16} className="text-jade-600 flex-shrink-0" />
            <p className="text-jade-800 text-sm font-medium" dangerouslySetInnerHTML={{ __html: t("comboDetail.deliveryReminder", { days: config.days.join(' & '), time: config.time }) }} />
          </div>

          {/* Add to cart */}
          <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-2 bg-cream-100 rounded-2xl px-3 py-2">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="qty-btn"
                aria-label={t("comboDetail.decrease")}
              >
                −
              </button>
              <span className="w-8 text-center font-semibold">{qty}</span>
              <button
                onClick={() => setQty(Math.min(10, qty + 1))}
                className="qty-btn"
                aria-label={t("comboDetail.increase")}
              >
                +
              </button>
            </div>
            <button
              onClick={handleAdd}
              className={`flex min-w-0 flex-1 items-center justify-center gap-2 break-words px-3 py-3.5 rounded-2xl font-bold text-base transition-all duration-200 ${
                added
                  ? 'bg-jade-500 text-white'
                  : 'bg-forest-700 hover:bg-forest-800 text-white shadow-green hover:shadow-lg active:scale-95'
              }`}
            >
              <ShoppingCart size={18} />
              {added ? t("comboDetail.addedToCart") : t("comboDetail.addCombo", { qty: qty > 1 ? `${qty}x ` : '', total: formatCurrency(Number(combo.price) * qty) })}
            </button>
          </div>
        </div>
      </div>

      {/* Why the combo */}
      <section className="min-w-0 bg-forest-950 rounded-4xl p-5 sm:p-12 mb-14">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl font-bold text-white mb-2">{t("comboDetail.whyTitle")}</h2>
          <p className="text-forest-300">{t("comboDetail.whySubtitle")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { icon: TrendingDown, title: t("comboDetail.maxSavings"), desc: t("comboDetail.maxSavingsDesc", { savings: formatCurrency(savings), savingsPct }) },
            { icon: Users, title: t("comboDetail.feedsFamily"), desc: t("comboDetail.feedsFamilyDesc", { servings: combo.servings }) },
            { icon: CheckCircle2, title: t("comboDetail.zeroEffort"), desc: t("comboDetail.zeroEffortDesc") },
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

      {/* Related combos */}
      {related.length > 0 && (
        <section className="mb-14">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="section-title">{t("comboDetail.relatedTitle")}</h2>
              <p className="text-gray-500 mt-1">{t("comboDetail.relatedSubtitle")}</p>
            </div>
            <Link to="/combos" className="hidden sm:flex items-center gap-1 text-forest-700 font-semibold text-sm hover:text-forest-900 transition-colors">
              {t("comboDetail.viewAllCombos")} <ChevronRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {related.map((cw) => (
              <ComboCard key={cw.combo.id} comboWithItems={cw} products={products} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
