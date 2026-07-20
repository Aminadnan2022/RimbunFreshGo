import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Zap } from 'lucide-react';
import { getPrepLabel } from '../../lib/preparationOptions';
import type { Product, PreparationOption } from '../../types';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useAuthModal } from '../../context/AuthModalContext';
import QuantityStepper from './QuantityStepper';

interface Props {
  product: Product;
}

const freshnessConfig = {
  available: { label: 'Available', color: 'bg-jade-100 text-jade-700' },
  limited: { label: 'Limited Stock', color: 'bg-amber-100 text-amber-700' },
  'sold-out': { label: 'Sold Out', color: 'bg-red-100 text-red-600' },
};

export default function ProductCard({ product }: Props) {
  const { addItem } = useCart();
  const { user } = useAuth();
  const { openSignIn } = useAuthModal();
  const [qty, setQty] = useState(1);
  const [prep, setPrep] = useState<PreparationOption>(product.preparationOptions[0]);
  const [added, setAdded] = useState(false);
  const freshness = freshnessConfig[product.freshness];

  const handleAdd = () => {
    if (product.freshness === 'sold-out') return;
    if (!user) {
      openSignIn('/shop');
      return;
    }
    const pricingType: 'per_kg' | 'fixed' =
      product.unit === 'per kg' || product.priceNote?.includes('/kg') ? 'per_kg' : 'fixed';
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
      price: product.price,
      unit: product.unit,
      quantity: qty,
      preparation: prep,
      pricingType,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  return (
    <article className="card card-hover flex flex-col h-full">
      {/* Image */}
      <Link to={`/product/${product.id}`} className="block relative overflow-hidden rounded-t-3xl">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-48 sm:h-52 object-cover transition-transform duration-500 hover:scale-105"
          loading="lazy"
        />
        <div className="absolute top-3 left-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${freshness.color}`}>
            {freshness.label}
          </span>
        </div>
        {product.isPopular && (
          <div className="absolute top-3 right-3">
            <span className="inline-flex items-center gap-1 bg-forest-700 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              <Zap size={11} /> Popular
            </span>
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 gap-3">
        <div>
          <p className="text-xs text-forest-500 font-medium uppercase tracking-wide mb-0.5">
            {product.category}
          </p>
          <Link to={`/product/${product.id}`} className="hover:text-forest-700 transition-colors">
            <h3 className="font-semibold text-charcoal leading-snug">{product.name}</h3>
          </Link>
          {product.weight && (
            <p className="text-xs text-gray-400 mt-0.5">{product.weight}</p>
          )}
          <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </div>

        {/* Prep selector */}
        {product.preparationOptions.length > 1 && (
          <select
            value={prep}
            onChange={(e) => setPrep(e.target.value as PreparationOption)}
            className="text-xs bg-cream-50 border border-cream-300 rounded-xl px-3 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-forest-400"
            aria-label="Preparation option"
          >
              {product.preparationOptions.map((o) => (
                <option key={o} value={o}>{getPrepLabel(o)}</option>
            ))}
          </select>
        )}

        <div className="flex items-end justify-between mt-auto pt-1">
          <div>
            <p className="text-xl font-bold text-forest-800">RM{product.price}</p>
            <p className="text-xs text-gray-400">{product.priceNote ?? product.unit}</p>
          </div>
          <QuantityStepper value={qty} onChange={setQty} size="sm" />
        </div>

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
          {added ? 'Added!' : product.freshness === 'sold-out' ? 'Sold Out' : 'Add to Cart'}
        </button>
      </div>
    </article>
  );
}
