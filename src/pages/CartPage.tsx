import { Link } from 'react-router-dom';
import { ShoppingBag, ArrowRight, Trash2, Clock, Package } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import DeliverySlotSelector from '../components/ui/DeliverySlotSelector';
import QuantityStepper from '../components/ui/QuantityStepper';
import EstimatedWeightStepper from '../components/ui/EstimatedWeightStepper';
import SliceStepper from '../components/ui/SliceStepper';
import EstimatedQuantityNote from '../components/ui/EstimatedQuantityNote';
import ProductImage from '../components/ui/ProductImage';
import OnboardingTour from '../components/onboarding/OnboardingTour';
import { cartTour } from '../components/onboarding/onboardingTours';
import { formatCurrency } from '../lib/currency';
import { isBulkWeighedPieceItem, isSliceItem } from '../lib/sellingOptions';
import type { DeliveryDay, CartItem } from '../types';

export default function CartPage() {
  const { cart, removeItem, updateQty, updateEstimatedWeight, updateSlice, setDeliveryDay, subtotal, itemCount } = useCart();
  const { t, lang, language } = useLanguage();

  const isWholeFishItem = (item: CartItem) =>
    item.orderingMode === 'whole_fish_by_weight' ||
    item.selectedOrderMode === 'whole';

  const isBulkWeighedPiece = (item: CartItem) => isBulkWeighedPieceItem(item);

  const isWeightItem = (item: CartItem) => {
    if (isSliceItem(item)) return false;
    if (isWholeFishItem(item)) return false;
    if (isBulkWeighedPiece(item)) return false;
    if (item.selectedOrderMode === 'weight') return true;
    if (item.orderingMode === 'weight_only') return true;
    return item.pricingType === 'per_kg';
  };
  if (cart.items.length === 0) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 flex flex-col items-center text-center">
        <div className="w-24 h-24 bg-cream-100 rounded-full flex items-center justify-center mb-6">
          <ShoppingBag size={40} className="text-cream-400" />
        </div>
        <h2 className="text-2xl font-display font-bold text-forest-950 mb-2">{t("cart.emptyTitle")}</h2>
        <p className="text-gray-500 mb-8">{t("cart.emptySubtitle")}</p>
        <Link to="/shop" className="btn-primary flex items-center gap-2">
          {t("cart.startShopping")} <ArrowRight size={16} />
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="section-title mb-8">{t("cart.title", { count: itemCount, items: itemCount === 1 ? t("cart.item") : t("cart.items") })}</h1>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Items */}
        <div data-onboarding="cart-items" className="lg:col-span-2 space-y-4">
          {cart.items.map((item, itemIndex) => (
            <div
              data-onboarding={itemIndex === 0 ? 'cart-edit' : undefined}
              key={`${item.comboId ?? item.productId}|${item.preparation ?? 'default'}|${item.selectedOrderMode ?? item.pricingType ?? 'default'}`}
              className="card p-4 sm:p-5"
            >
              {/* Combo header */}
              <div className="flex gap-4">
                <ProductImage
                  src={item.image}
                  alt={item.name}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="font-semibold text-charcoal leading-snug">{item.name}</p>
                      {item.preparation && (
                        <p className="text-xs text-gray-400 mt-0.5">{t("cartItem.preparation." + item.preparation)}</p>
                      )}
                      {item.isCombo && (
                        <span className="inline-block bg-forest-100 text-forest-700 text-xs font-semibold px-2 py-0.5 rounded-full mt-1">
                          {t("cartItem.comboBundle")}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(
                        item.productId,
                        item.comboId,
                        item.preparation,
                        item.selectedOrderMode,
                      )}
                      className="p-1.5 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                      aria-label={t("cartItem.remove", { name: item.name })}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    {isWeightItem(item) ? (
                      <>
                        <EstimatedWeightStepper
                          value={(item.estimatedWeight ?? 0.5) * 1000}
                          onChange={(v) => updateEstimatedWeight(
                            item.productId,
                            v / 1000,
                            item.comboId,
                            item.preparation,
                            item.selectedOrderMode,
                          )}
                          size="sm"
                        />
                        <p className="font-bold text-forest-800">≈ RM{formatCurrency(item.price * (item.estimatedWeight ?? 0))}</p>
                      </>
                    ) : isSliceItem(item) ? (
                      <>
                        <SliceStepper
                          value={item.sliceQuantity ?? item.quantity}
                          onChange={(v) => updateSlice(
                            item.productId,
                            v,
                            item.comboId,
                            item.preparation,
                            item.selectedOrderMode,
                          )}
                          min={item.minSlice}
                          max={item.maxSlice}
                          increment={item.sliceIncrement}
                          unit={item.sliceUnit ?? t("product.sliceUnitDefault")}
                          size="sm"
                        />
                        <p className="text-xs text-gray-400">{t("cart.estimatedPriceAfterWeighing")}</p>
                      </>
                    ) : (
                      <>
                        <QuantityStepper
                          value={item.quantity}
                          onChange={(v) => updateQty(
                            item.productId,
                            v,
                            item.comboId,
                            item.preparation,
                            item.selectedOrderMode,
                          )}
                          size="sm"
                        />
                        <p className="font-bold text-forest-800">
                          {isWholeFishItem(item) || isBulkWeighedPiece(item)
                            ? `≈ RM${formatCurrency(item.price * (item.estimatedWeight ?? 0))}`
                            : `RM${formatCurrency(item.price * item.quantity)}`}
                        </p>
                      </>
                    )}
                  </div>
                  {isWeightItem(item) ? (
                    <>
                      <p className="text-xs text-amber-600 mt-1">RM{formatCurrency(item.price)}/kg × {(item.estimatedWeight ?? 0).toFixed(2)}kg — {t("cart.estimatedPrice")}</p>
                      {item.showEstimatedQuantity && item.averageWeight && item.averageWeight > 0 && (
                        <EstimatedQuantityNote
                          weightGrams={(item.estimatedWeight ?? 0.5) * 1000}
                          averageWeight={item.averageWeight}
                          unitLabel={item.productId === 'udang-a' ? 'prawns' : (lang === 'ms' ? 'ekor' : 'pieces')}
                        />
                      )}
                    </>
                  ) : isSliceItem(item) ? (
                    <p className="text-xs text-gray-400 mt-1">
                      {t("cart.slices", { count: item.sliceQuantity ?? item.quantity })}
                    </p>
                  ) : (
                    isWholeFishItem(item) || isBulkWeighedPiece(item) ? (
                      <p className="text-xs text-amber-600 mt-1">
                        {item.quantity} {lang === 'ms' ? 'ekor' : 'fish'}
                        {item.averageWeight && item.averageWeight > 0
                          ? ` · ≈ ${((item.estimatedWeight ?? 0)).toFixed(2)}kg`
                          : ''}
                        {' · '}RM{formatCurrency(item.price)}/kg — {t("cart.estimatedPrice")}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">
                        RM{formatCurrency(item.price)} × {item.quantity} {item.unit}
                      </p>
                    )
                  )}
                </div>
              </div>
              {/* Expanded combo items */}
              {item.comboItems && item.comboItems.length > 0 && (
                <div className="mt-3 pt-3 border-t border-cream-200 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("cartItem.contains")}</p>
                  {item.comboItems.map((ci) => (
                    <div key={ci.productId} className="flex items-center gap-2 text-sm">
                      <Package size={13} className="text-forest-400 flex-shrink-0" />
                      <span className="text-gray-700">{ci.label}</span>
                      {ci.preparation && (
                        <span className="text-xs text-gray-400">({t("cartItem.preparation." + ci.preparation)})</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <Link to="/shop" className="flex items-center gap-2 text-sm text-forest-600 hover:text-forest-800 font-medium transition-colors px-1">
            <ArrowRight size={15} className="rotate-180" /> {t("cartAction.continueShopping")}
          </Link>
        </div>

        {/* Order summary */}
        <div className="space-y-4">
          {/* Delivery slot */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-forest-600" />
              <h3 className="font-semibold text-charcoal">{t("delivery.slot")}</h3>
            </div>
            <DeliverySlotSelector
              selected={cart.deliveryDay}
              onChange={(day: DeliveryDay) => setDeliveryDay(day)}
            />
            {!cart.deliveryDay && (
              <p className="text-xs text-amber-600 mt-2 font-medium">{t("cartSummary.selectDeliveryDay")}</p>
            )}
          </div>

          {/* Summary */}
          <div className="card p-5">
            <h3 className="font-semibold text-charcoal mb-4">{t("cartSummary.title")}</h3>
            <div className="space-y-2.5 mb-4">
              <div className="flex justify-between text-sm text-gray-600">
                <span>{t("cartSummary.subtotal", { count: itemCount })}</span>
                <span>RM{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>{t("cartSummary.deliveryFee")}</span>
                <span className="text-gray-400">{t("cartSummary.calculatedAtCheckout")}</span>
              </div>
              <div className="border-t border-cream-200 pt-2.5 flex justify-between font-bold text-base">
                <span>{t("cartSummary.estimatedTotal")}</span>
                <span className="text-forest-800">RM{formatCurrency(subtotal)}</span>
              </div>
            </div>
            <Link
              to="/checkout"
              data-onboarding="cart-checkout"
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold transition-all ${
                cart.deliveryDay
                  ? 'btn-primary'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
              }`}
              aria-disabled={!cart.deliveryDay}
            >
              {t("cartAction.proceedToCheckout")} <ArrowRight size={16} />
            </Link>
          </div>

          {/* Trust note */}
          <div className="bg-jade-50 border border-jade-200 rounded-2xl p-4 text-xs text-jade-800 leading-relaxed">
            {t("cart.trustNote")}
          </div>
        </div>
      </div>
      <OnboardingTour page="cart" steps={cartTour(language)} />
    </main>
  );
}
