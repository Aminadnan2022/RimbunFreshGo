import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Star, Users, Clock, ChevronRight, Package } from 'lucide-react';
import type { ComboWithItems, Product } from '../../types';
import { buildComboCartItem } from '../../data/combos';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useAuthModal } from '../../context/AuthModalContext';
import { useLanguage } from '../../context/LanguageContext';
import { useDeliveryConfig } from '../../context/DeliveryConfigContext';
import ProductImage from '../ui/ProductImage';
import { formatCurrency } from '../../lib/currency';

interface Props {
  comboWithItems: ComboWithItems;
  products: Product[];
}

const BADGE_STYLES: Record<string, string> = {
  'Best Value': 'bg-forest-700 text-white',
  'Popular': 'bg-amber-500 text-white',
  'Limited': 'bg-red-600 text-white',
  'New': 'bg-jade-500 text-white',
};

export default function ComboCard({ comboWithItems, products }: Props) {
  const { addItem } = useCart();
  const { user } = useAuth();
  const { openSignIn } = useAuthModal();
  const { t } = useLanguage();
  const { config } = useDeliveryConfig();
  const [added, setAdded] = useState(false);

  const combo = comboWithItems.combo;
  const price = Number(combo.price);
  const original = Number(combo.original_value);
  const savings = Math.max(0, original - price);
  const savingsPct = Number(combo.discount_percent) || (original > 0 ? Math.round((savings / original) * 100) : 0);
  const itemCount = comboWithItems.items.length;

  const productMap = new Map(products.map((p) => [p.id, p]));
  const thumbnails = comboWithItems.items
    .map((ci) => productMap.get(ci.product_id))
    .filter((p): p is Product => Boolean(p))
    .slice(0, 4);

  const handleAdd = () => {
    if (!user) {
      openSignIn('/combos');
      return;
    }
    addItem(buildComboCartItem(comboWithItems, products));
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const badgeClass = BADGE_STYLES[combo.badge] ?? 'bg-forest-700 text-white';
  const daysShort = config.days.map((d) => t('days.' + d.toLowerCase()).slice(0, 3)).join(' · ');

  return (
    <article className="card card-hover flex flex-col h-full">
      <Link to={`/combos/${combo.slug}`} className="relative block overflow-hidden rounded-t-3xl">
        <ProductImage
          src={combo.image || (combo.images ?? [])[0]}
          alt={combo.name}
          className="w-full h-44 sm:h-48 object-cover transition-transform duration-500 hover:scale-105"
        />
        {combo.badge && (
          <span className={`absolute top-3 left-3 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full shadow ${badgeClass}`}>
            <Star size={11} className="fill-current" /> {combo.badge}
          </span>
        )}
        {savingsPct > 0 && (
          <span className="absolute top-3 right-3 bg-jade-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow">
            -{savingsPct}%
          </span>
        )}
      </Link>

      <div className="flex flex-col flex-1 p-4 gap-3">
        <div>
          {combo.category_label && (
            <p className="text-xs text-forest-500 font-medium uppercase tracking-wide mb-0.5">
              {combo.category_label}
            </p>
          )}
          <Link to={`/combos/${combo.slug}`} className="hover:text-forest-700 transition-colors">
            <h3 className="font-semibold text-charcoal leading-snug">{combo.name}</h3>
          </Link>
          <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
            {combo.tagline || combo.description}
          </p>
        </div>

        {/* Included product thumbnails */}
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {thumbnails.length > 0 ? thumbnails.map((p) => (
              <div key={p.id} className="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-cream-100">
                <ProductImage src={p.image} alt={p.name} className="w-full h-full object-cover" />
              </div>
            )) : (
              <div className="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-cream-100 flex items-center justify-center">
                <Package size={14} className="text-gray-400" />
              </div>
            )}
          </div>
          <span className="text-xs text-gray-500 font-medium">
            {itemCount} {t("comboList.itemsLabel")}
          </span>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-forest-800">RM{formatCurrency(price)}</span>
          {original > 0 && (
            <span className="text-sm text-gray-400 line-through">RM{formatCurrency(original)}</span>
          )}
        </div>
        {savings > 0 && (
          <p className="text-xs font-semibold text-jade-600">
            {t("comboList.saveLabel", { amount: formatCurrency(savings), pct: savingsPct })}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Users size={13} /> {t("comboList.feedsLabel", { count: combo.servings })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock size={13} /> {t("comboList.deliveryBadge", { days: daysShort })}
          </span>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-1">
          <Link
            to={`/combos/${combo.slug}`}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl font-semibold text-sm border-2 border-forest-700 text-forest-700 hover:bg-forest-700 hover:text-white transition-all duration-200"
          >
            {t("comboList.viewCombo")} <ChevronRight size={15} />
          </Link>
          <button
            onClick={handleAdd}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl font-semibold text-sm transition-all duration-200 ${
              added
                ? 'bg-jade-500 text-white'
                : 'bg-forest-700 hover:bg-forest-800 text-white shadow-green hover:shadow-lg active:scale-95'
            }`}
          >
            <ShoppingCart size={15} />
            {added ? t("comboList.addedToCart") : t("comboList.addCombo")}
          </button>
        </div>
      </div>
    </article>
  );
}
