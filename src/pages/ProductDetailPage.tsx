import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ShoppingCart, Clock, ChevronRight, Loader2, Pencil, Trash2, X, AlertTriangle } from 'lucide-react';
import { useProduct, useProducts } from '../hooks/useProducts';
import { getVendorById } from '../data/vendors';
import { deleteProduct } from '../data/products';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useAuthModal } from '../context/AuthModalContext';
import { useLanguage } from '../context/LanguageContext';
import { useDeliveryConfig } from '../context/DeliveryConfigContext';
import { useWebsiteSettings } from '../context/WebsiteSettingsContext';
import QuantityStepper from '../components/ui/QuantityStepper';
import EstimatedWeightStepper from '../components/ui/EstimatedWeightStepper';
import SliceStepper from '../components/ui/SliceStepper';
import EstimatedQuantityNote from '../components/ui/EstimatedQuantityNote';
import ProductImage from '../components/ui/ProductImage';
import ProductCard from '../components/ui/ProductCard';
import FeatureDisabledPage from '../components/system/FeatureDisabledPage';
import { buildCartItem, computeSubtotal, getSliceRange, isBulkWeighedPieceProduct } from '../lib/sellingOptions';
import { formatCurrency } from '../lib/currency';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { isAdmin, user } = useAuth();
  const { openSignIn } = useAuthModal();
  const { config } = useDeliveryConfig();
  const { settings, loading: settingsLoading } = useWebsiteSettings();
  const { t } = useLanguage();
  const { product, loading, error } = useProduct(id);
  const { products } = useProducts();

  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [estimatedWeight, setEstimatedWeight] = useState(500);
  const [sliceQty, setSliceQty] = useState(2);
  const [added, setAdded] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (product) setSliceQty(getSliceRange(product).defaultSlice);
  }, [product]);

  if (!settingsLoading && !settings.show_shop) {
    return <FeatureDisabledPage />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <p className="text-red-500 text-sm">{error}</p>
        <button onClick={() => navigate('/shop')} className="btn-primary">{t("productDetail.backToShop")}</button>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <p className="text-gray-500">{t("productDetail.productNotFound")}</p>
        <button onClick={() => navigate('/shop')} className="btn-primary">{t("productDetail.backToShop")}</button>
      </div>
    );
  }

  const vendor = getVendorById(product.vendorId);
  const isBulkWeighedPiece = isBulkWeighedPieceProduct(product);
  const hasPieceWeightEstimate =
    (product.orderingMode === 'whole_fish_by_weight' || isBulkWeighedPiece) &&
    (product.averageWeight ?? 0) > 0;
  const related = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const handleAdd = () => {
    if (!user) {
      openSignIn('/shop');
      return;
    }

    const itemData = buildCartItem(product, {
      quantity: qty,
      weightG: estimatedWeight,
      sliceQuantity: sliceQty,
    });

    addItem(itemData);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProduct(product.id);
      navigate('/shop');
    } catch (err) {
      alert(err instanceof Error ? err.message : t("productDetail.deleteFailed"));
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-gray-400 mb-8">
        <Link to="/" className="hover:text-forest-600">{t("productDetail.breadcrumbHome")}</Link>
        <ChevronRight size={12} />
        <Link to="/shop" className="hover:text-forest-600">{t("productDetail.breadcrumbShop")}</Link>
        <ChevronRight size={12} />
        <Link to={`/shop?category=${product.category}`} className="hover:text-forest-600 capitalize">{product.category}</Link>
        <ChevronRight size={12} />
        <span className="text-gray-600">{product.name}</span>
      </nav>

      {/* Admin controls */}
      {isAdmin && (
        <div className="flex items-center gap-2 mb-6">
          <Link
            to={`/admin/products/edit/${product.id}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-forest-700 border border-forest-200 hover:bg-forest-50 transition-all"
          >
            <Pencil size={15} /> {t("productDetail.editProduct")}
          </Link>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-all"
          >
            <Trash2 size={15} /> {t("productDetail.delete")}
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-10 mb-16">
        {/* Gallery */}
        <div>
          <div className="rounded-3xl overflow-hidden shadow-card mb-3 aspect-[4/3]">
            <ProductImage
              src={product.images[activeImg]}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className={`rounded-2xl overflow-hidden border-2 transition-all w-20 h-16 flex-shrink-0 ${
                    activeImg === i ? 'border-forest-600 shadow-green' : 'border-cream-300 hover:border-forest-400'
                  }`}
                >
                  <ProductImage src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <div className="flex items-start justify-between gap-4 mb-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-forest-500 mb-1 capitalize">{product.category}</p>
              <h1 className="font-display text-3xl font-bold text-forest-950">{product.name}</h1>
              <p className="text-forest-400 font-medium">{product.nameMs}</p>
            </div>
            <span className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full ${
              product.freshness === 'available' ? 'bg-jade-100 text-jade-700'
              : product.freshness === 'limited' ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-red-600'
            }`}>
              {product.freshness === 'available' ? t("product.status.available") : product.freshness === 'limited' ? t("product.status.limited") : t("product.status.soldOut")}
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-4 mb-4">
            <span className="text-4xl font-bold text-forest-800">RM{formatCurrency(product.price)}</span>
            <span className="text-gray-400">{product.priceNote ?? product.unit}</span>
            {product.weight && <span className="text-gray-400 text-sm">· {product.weight}</span>}
          </div>

          <p className="text-gray-600 leading-relaxed mb-6">{product.longDescription}</p>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-6">
            {product.tags.map((tag) => (
              <span key={tag} className="bg-forest-50 text-forest-700 text-xs font-medium px-2.5 py-1 rounded-full border border-forest-100">
                {tag}
              </span>
            ))}
          </div>

          {/* Delivery reminder */}
          <div className="flex items-center gap-2.5 bg-jade-50 border border-jade-200 rounded-2xl px-4 py-3 mb-6">
            <Clock size={16} className="text-jade-600 flex-shrink-0" />
            <p className="text-jade-800 text-sm font-medium">
              {t("productDetail.deliveryReminder")} <strong>{config.days.map((d) => t("days." + d.toLowerCase())).join(' & ')}</strong>, {config.time}
            </p>
          </div>

          {/* Add to cart */}
          <div className="flex items-center gap-4">
            {product.orderingMode === 'slice' ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">{t("product.howManySlices")}</span>
                <SliceStepper
                  value={sliceQty}
                  onChange={setSliceQty}
                  min={product.minSlice}
                  max={product.maxSlice}
                  increment={product.sliceIncrement}
                  unit={product.sliceUnit ?? t("product.sliceUnitDefault")}
                />
              </div>
            ) : product.orderingMode === 'whole_fish_by_weight' || isBulkWeighedPiece ? (
              <QuantityStepper value={qty} onChange={setQty} />
            ) : product.orderingMode === 'weight_only' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{t("product.estimatedWeight")}</span>
                <EstimatedWeightStepper value={estimatedWeight} onChange={setEstimatedWeight} />
              </div>
            ) : (
              <QuantityStepper value={qty} onChange={setQty} />
            )}
            <button
              onClick={handleAdd}
              disabled={product.freshness === 'sold-out'}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold transition-all duration-200 ${
                added
                  ? 'bg-jade-500 text-white'
                  : product.freshness === 'sold-out'
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'btn-primary'
              }`}
            >
              <ShoppingCart size={18} />
              {added ? t("product.buttons.added") : t("product.buttons.addToCart")}
            </button>
          </div>

          {/* Estimated price display */}
          {product.orderingMode !== 'fixed_quantity' && product.orderingMode !== 'slice' && (
            <div className="mt-3 text-sm text-gray-500">
              {hasPieceWeightEstimate ? (
                <p>≈ {qty} × {product.averageWeight}g = <strong>{(qty * product.averageWeight / 1000).toFixed(2).replace(/\.?0+$/, '')}kg</strong> · ≈ <strong>RM{formatCurrency(computeSubtotal(product, { quantity: qty }))}</strong></p>
              ) : (
                <p>{t("product.estimatedWeight")}: <strong>{estimatedWeight >= 1000 ? (estimatedWeight / 1000).toFixed(2).replace(/\.?0+$/, '') + 'kg' : estimatedWeight + 'g'}</strong> · ≈ <strong>RM{formatCurrency(computeSubtotal(product, { weightG: estimatedWeight }))}</strong></p>
              )}
            </div>
          )}

          {/* Estimation notes */}
          {product.orderingMode === 'slice' && (
            <div className="mt-4">
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 leading-relaxed space-y-1">
                <p className="font-semibold">{t("product.sliceInstructionTitle")}</p>
                <p>{product.sliceInstruction || t("product.sliceInstructionDefault")}</p>
              </div>
            </div>
          )}
          {product.orderingMode === 'whole_fish_by_weight' && product.showEstimatedQuantity && product.averageWeight && product.averageWeight > 0 && (
            <div className="mt-4">
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 leading-relaxed space-y-1">
                <p className="font-semibold">{t("product.estimatedQuantity")}</p>
                <p>≈ {qty} {t("productDetail.fish")}</p>
                <p className="text-amber-500">{t("product.estimationDisclaimer")}</p>
              </div>
            </div>
          )}

          {isBulkWeighedPiece && product.averageWeight && product.averageWeight > 0 && (
            <div className="mt-4">
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 leading-relaxed space-y-1">
                <p className="font-semibold">{t("product.pieceBulkWeight.title")}</p>
                <p>{t("product.pieceBulkWeight.details", { count: qty })}</p>
              </div>
            </div>
          )}

          {product.orderingMode === 'weight_only' && !isBulkWeighedPiece && product.showEstimatedQuantity && product.averageWeight && product.averageWeight > 0 && (
            <div className="mt-4">
              <EstimatedQuantityNote
                weightGrams={estimatedWeight}
                averageWeight={product.averageWeight}
                unitLabel={product.id === 'udang-a' ? 'prawns' : 'fish'}
              />
            </div>
          )}

          {/* Vendor */}
          {vendor && (
            <div className="mt-6 pt-6 border-t border-cream-200">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{t("productDetail.suppliedBy")}</p>
              <Link to={`/vendors#${vendor.id}`} className="flex items-center gap-3 group">
                <img src={vendor.image} alt={vendor.name} className="w-10 h-10 rounded-full object-cover" />
                <div>
                  <p className="text-sm font-semibold text-forest-800 group-hover:text-forest-600 transition-colors">{vendor.name}</p>
                  <p className="text-xs text-gray-400">{vendor.location}</p>
                </div>
                <ChevronRight size={16} className="ml-auto text-gray-300 group-hover:text-forest-500 transition-colors" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Related products */}
      {related.length > 0 && (
        <section>
          <h2 className="section-title mb-6">{t("productDetail.moreFrom")} {t("shop.categories." + product.category)}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Admin delete modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleting && setShowDeleteModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-[fadeSlideUp_0.2s_ease-out]">
            <button onClick={() => setShowDeleteModal(false)} disabled={deleting} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{t("productDetail.deleteModal.title")}</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {t("productDetail.deleteModal.message", { name: product.name })}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteModal(false)} disabled={deleting} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all">
                {t("productDetail.deleteModal.cancel")}
              </button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50">
                {deleting ? t("productDetail.deleteModal.deleting") : t("productDetail.deleteModal.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
