import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Zap } from 'lucide-react';
import type { Product } from '../../types';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useAuthModal } from '../../context/AuthModalContext';
import { useLanguage } from '../../context/LanguageContext';
import QuantityStepper from './QuantityStepper';
import EstimatedWeightStepper from './EstimatedWeightStepper';
import SliceStepper from './SliceStepper';
import EstimatedQuantityNote from './EstimatedQuantityNote';
import ProductImage from './ProductImage';
import { buildCartItem, computeSubtotal, getSliceRange } from '../../lib/sellingOptions';
import { formatCurrency } from '../../lib/currency';

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const { addItem } = useCart();
  const { user } = useAuth();
  const { openSignIn } = useAuthModal();
  const { t, lang } = useLanguage();
  const [qty, setQty] = useState(1);
  const [estimatedWeight, setEstimatedWeight] = useState(500);
  const [sliceQty, setSliceQty] = useState(() => getSliceRange(product).defaultSlice);
  const [added, setAdded] = useState(false);

  const freshnessConfig = {
    available: { label: t("product.status.available"), color: 'bg-jade-100 text-jade-700' },
    limited: { label: t("product.status.limited"), color: 'bg-amber-100 text-amber-700' },
    'sold-out': { label: t("product.status.soldOut"), color: 'bg-red-100 text-red-600' },
  };
  const freshness = freshnessConfig[product.freshness];

  const productUnitLabel = product.weight
    ? product.weight
    : product.priceNote ?? product.unit;

  const handleAdd = () => {
    if (product.freshness === 'sold-out') return;
    if (!user) {
      openSignIn('/shop');
      return;
    }

    const mode = product.orderingMode ?? 'fixed_quantity';
    const itemData = buildCartItem(product, {
      quantity: qty,
      weightG: estimatedWeight,
      sliceQuantity: sliceQty,
    });

    addItem(itemData);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const renderStepper = () => {
    const mode = product.orderingMode ?? 'fixed_quantity';

    if (mode === 'slice') {
      return (
        <div className="flex flex-col items-end gap-0.5">
          <SliceStepper
            value={sliceQty}
            onChange={setSliceQty}
            min={product.minSlice}
            max={product.maxSlice}
            increment={product.sliceIncrement}
            unit={product.sliceUnit ?? t("product.sliceUnitDefault")}
            size="sm"
          />
          <span className="text-[10px] text-gray-400 whitespace-nowrap">
            {t("product.estimatedPriceAfterWeighing")}
          </span>
        </div>
      );
    }

    if (mode === 'whole_fish_by_weight') {
      return (
        <div className="flex flex-col items-end gap-0.5">
          <QuantityStepper value={qty} onChange={setQty} size="sm" />
          {product.averageWeight && product.averageWeight > 0 && (
            <span className="text-[10px] text-gray-400 whitespace-nowrap">
              ≈ {((qty * product.averageWeight) / 1000).toFixed(2).replace(/\.?0+$/, '')}kg
              {' · '}≈ RM{formatCurrency(computeSubtotal(product, { quantity: qty }))}
            </span>
          )}
        </div>
      );
    }

    if (mode === 'weight_only') {
      return (
        <div className="flex flex-col items-end gap-0.5">
          <EstimatedWeightStepper value={estimatedWeight} onChange={setEstimatedWeight} size="sm" />
          <span className="text-[10px] text-gray-400 whitespace-nowrap">
            ≈ RM{formatCurrency(computeSubtotal(product, { weightG: estimatedWeight }))}
          </span>
        </div>
      );
    }

    return <QuantityStepper value={qty} onChange={setQty} size="sm" />;
  };

  const estNoteMode = product.orderingMode === 'weight_only';

  const unitLabel = product.id === 'udang-a'
    ? 'prawns'
    : product.category === 'fish'
      ? (lang === 'ms' ? 'ekor' : 'fish')
      : (lang === 'ms' ? 'ekor' : 'pieces');

  return (
    <article className="card card-hover flex flex-col h-full">
      <Link to={`/product/${product.id}`} className="block relative overflow-hidden rounded-t-3xl">
        <ProductImage
          src={product.image}
          alt={product.name}
          className="w-full h-48 sm:h-52 object-cover transition-transform duration-500 hover:scale-105"
        />
        <div className="absolute top-3 left-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${freshness.color}`}>
            {freshness.label}
          </span>
        </div>
        {product.isPopular && (
          <div className="absolute top-3 right-3">
            <span className="inline-flex items-center gap-1 bg-forest-700 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              <Zap size={11} /> {t("product.badges.popular")}
            </span>
          </div>
        )}
      </Link>

      <div className="flex flex-col flex-1 p-4 gap-3">
        <div>
          <p className="text-xs text-forest-500 font-medium uppercase tracking-wide mb-0.5">
            {product.category}
          </p>
          <Link to={`/product/${product.id}`} className="hover:text-forest-700 transition-colors">
            <h3 className="font-semibold text-charcoal leading-snug">{product.name}</h3>
          </Link>
          <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </div>

        <div className="flex items-end justify-between mt-auto pt-1">
          <div>
            <p className="text-xl font-bold text-forest-800">RM{formatCurrency(product.price)}</p>
            <p className="text-xs text-gray-400">{productUnitLabel}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {renderStepper()}
          </div>
        </div>

        {product.orderingMode === 'whole_fish_by_weight' && product.showEstimatedQuantity && product.averageWeight && product.averageWeight > 0 && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed">
            <p className="font-semibold">{t("product.estimatedQuantity")}</p>
            <p>≈ {qty} {lang === 'ms' ? 'ekor ikan' : 'fish'}</p>
            <p className="text-amber-500">{t("product.estimationDisclaimer")}</p>
          </div>
        )}

        {estNoteMode && product.showEstimatedQuantity && product.averageWeight && product.averageWeight > 0 && (
          <EstimatedQuantityNote
            weightGrams={estimatedWeight}
            averageWeight={product.averageWeight}
            unitLabel={unitLabel}
          />
        )}

        <button
          onClick={handleAdd}
          disabled={product.freshness === 'sold-out'}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl font-semibold text-sm transition-all duration-200 ${
            added
              ? 'bg-jade-500 text-white'
              : product.freshness === 'sold-out'
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-forest-700 hover:bg-forest-800 text-white shadow-green hover:shadow-lg active:scale-95'
          }`}
        >
          <ShoppingCart size={15} />
          {added ? t("product.buttons.added") : product.freshness === 'sold-out' ? t("product.status.soldOut") : t("product.buttons.addToCart")}
        </button>
      </div>
    </article>
  );
}
