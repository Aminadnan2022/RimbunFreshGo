import { useState, useEffect } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Lock, Info, Package } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { useDeliveryConfig } from '../context/DeliveryConfigContext';
import { useLanguage } from '../context/LanguageContext';
import { useWebsiteSettings } from '../context/WebsiteSettingsContext';
import { supabase } from '../lib/supabase';
import { fetchActiveDeliveryPoints, type DeliveryPoint } from '../data/delivery';
import DeliverySlotSelector from '../components/ui/DeliverySlotSelector';
import ProductImage from '../components/ui/ProductImage';
import { formatCurrency } from '../lib/currency';
import { isSliceItem } from '../lib/sellingOptions';
import type { CustomerDetails, DeliveryDay, Order, CartItem } from '../types';

const initialDetails: CustomerDetails = {
  name: '', phone: '', email: '', apartment: '', houseUnit: '', pickupLocation: '', deliveryPointName: '', deliveryMethod: '', notes: '',
};

const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

const nextDeliveryDate = (day: DeliveryDay): string => {
  const today = new Date();
  const target = DAY_MAP[day.toLowerCase()] ?? 3;
  const current = today.getDay();
  let diff = target - current;
  if (diff < 0) diff += 7;
  const next = new Date(today);
  next.setDate(today.getDate() + diff);
  return next.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};



function Field({
  label, required, error, children,
}: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export default function CheckoutPage() {
  const { cart, subtotal, clearCart } = useCart();
  const { addOrder } = useOrders();
  const { user, loading: authLoading } = useAuth();
  const { config } = useDeliveryConfig();
  const { t } = useLanguage();
  const { settings: websiteSettings } = useWebsiteSettings();
  const navigate = useNavigate();

  const isWeightItem = (item: CartItem) => {
    if (isSliceItem(item)) return false;
    if (item.orderingMode) return item.orderingMode === 'weight_only' || item.orderingMode === 'whole_or_weight';
    return item.pricingType === 'per_kg';
  };

  const [details, setDetails] = useState<CustomerDetails>(initialDetails);
  const [deliveryPoints, setDeliveryPoints] = useState<DeliveryPoint[]>([]);
  const [deliveryDay, setDeliveryDay] = useState<DeliveryDay | null>(cart.deliveryDay);
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerDetails | 'deliveryDay', string>>>({});
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [step, setStep] = useState<'details' | 'payment' | 'done'>('details');

  // Load active delivery points for the checkout dropdown
  useEffect(() => {
    let active = true;
    fetchActiveDeliveryPoints()
      .then((points) => { if (active) setDeliveryPoints(points); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Pick a delivery point and snapshot its fee + handover method.
  const setDeliveryPoint = (name: string) => {
    const point = deliveryPoints.find((p) => p.name === name);
    setDetails((prev) => ({
      ...prev,
      pickupLocation: name,
      deliveryPointName: name,
      deliveryMethod: point?.delivery_method ?? '',
    }));
    if (errors.deliveryPointName) setErrors((prev) => ({ ...prev, deliveryPointName: undefined }));
  };

  // Pre-populate form from saved delivery profile
  useEffect(() => {
    if (!user) return;
    setDetails((prev) => ({ ...prev, email: user.email ?? '' }));
    supabase
      .from('customer_profiles')
      .select('full_name, phone, apartment, house_unit, pickup_location', 'notes', 'notes')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return;
        setDetails((prev) => ({
          ...prev,
          name:           data.full_name     || prev.name,
          phone:          data.phone         || prev.phone,
          apartment:      data.apartment     || prev.apartment,
          houseUnit:      data.house_unit    || prev.houseUnit,
          pickupLocation: data.pickup_location || prev.pickupLocation,
          deliveryPointName: data.pickup_location || prev.deliveryPointName,
          deliveryMethod: prev.deliveryMethod,
          notes:          data.notes          || prev.notes,
        }));
      });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const deliveryFee = deliveryPoints.find((p) => p.name === details.deliveryPointName)?.delivery_fee ?? 0;
  const total = subtotal + deliveryFee;

  const validate = () => {
    const e: typeof errors = {};
    if (!details.name.trim()) e.name = t("checkout.validation.fullNameRequired");
    if (!details.phone.trim()) e.phone = t("checkout.validation.phoneRequired");
    else if (!/^(\+?60|0)\d{8,10}$/.test(details.phone.replace(/\s/g, '')))
      e.phone = t("checkout.validation.phoneInvalid");
    if (!details.email.trim()) e.email = t("checkout.validation.emailRequired");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) e.email = t("checkout.validation.emailInvalid");
    if (!details.houseUnit.trim()) e.houseUnit = t("checkout.validation.unitRequired");
    if (!details.deliveryPointName) e.deliveryPointName = t("checkout.validation.deliveryPointRequired");
    if (!deliveryDay) e.deliveryDay = t("checkout.validation.deliveryDayRequired");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = () => {
    if (validate()) setStep('payment');
  };

  const handlePlaceOrder = async () => {
    if (!websiteSettings.allow_customer_orders) {
      setPlaceError(t("checkout.validation.ordersDisabled"));
      return;
    }
    setPlacing(true);
    setPlaceError(null);
    try {
      const orderRef = `RFG-${Date.now().toString(36).toUpperCase()}`;
      const deliveryDate = nextDeliveryDate(deliveryDay!);
      const dayLabel = deliveryDay!.charAt(0).toUpperCase() + deliveryDay!.slice(1);
      const order: Order = {
        id: orderRef,
        items: cart.items,
        customer: details,
        deliveryDay: deliveryDay!,
        deliveryDate,
        deliveryWindow: config.time,
        subtotal,
        deliveryFee,
        total,
        status: 'confirmed',
        createdAt: new Date().toISOString(),
        statusTimeline: [
          { status: 'Order Confirmed', time: new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }), done: true },
          { status: 'Being Prepared', time: `${dayLabel} morning`, done: false },
          { status: 'Out for Delivery', time: `${dayLabel} ${config.time.split('\u2013')[0] || config.time}`, done: false },
          { status: 'Delivered', time: `${dayLabel} by end of window`, done: false },
        ],
      };
      const { id } = await addOrder(order);
      // Save delivery profile for future checkouts
      await supabase.from('customer_profiles').upsert({
        id: user!.id,
        email_address: user?.email,
        full_name:        details.name,
        phone:            details.phone,
        apartment:        details.apartment,
        house_unit:       details.houseUnit,
        pickup_location:  details.pickupLocation,
        notes: details.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      clearCart();
      setStep('done');
      navigate(`/order/${id}`);
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : t("checkout.validation.failedToPlaceOrder"));
      setPlacing(false);
    }
  };

  const set = (field: keyof CustomerDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setDetails((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const inputClass = (err?: string) =>
    `w-full bg-cream-50 border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-all ${
      err ? 'border-red-300 bg-red-50' : 'border-cream-300'
    }`;

  if (authLoading) {
    return (
      <main className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-forest-200 border-t-forest-600 rounded-full animate-spin" />
      </main>
    );
  }

  if (!user) return <Navigate to="/" replace />;

  if (cart.items.length === 0 && step !== 'done') {
    navigate('/cart');
    return null;
  }

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/cart"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-forest-700 transition-colors"
        >
          <ChevronLeft size={16} />
          {t("checkout.backToCart")}
        </Link>
        <div />
      </div>
      <h1 className="section-title mb-2">{t("checkout.title")}</h1>
      <p className="text-gray-500 mb-8">{t("checkout.subtitle")}</p>

      {/* Progress steps */}
      <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-2">
        {(['details', 'payment'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-shrink-0">
            {i > 0 && <ChevronRight size={16} className="text-gray-300" />}
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium ${
              step === s ? 'bg-forest-700 text-white' : step === 'payment' && s === 'details' ? 'bg-jade-100 text-jade-700' : 'bg-cream-100 text-gray-400'
            }`}>
              {step === 'payment' && s === 'details' ? <CheckCircle2 size={14} /> : <span className="w-4 h-4 flex items-center justify-center">{i + 1}</span>}
              {s === 'details' ? t("checkout.yourDetails") : t("checkout.payment")}
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {step === 'details' && (
            <div className="space-y-4">
              {/* Product Images Notice */}
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800">
                <Info size={16} className="flex-shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="font-semibold mb-0.5">{t("checkout.productImagesTitle")}</p>
                  <p className="leading-relaxed">{t("checkout.productImagesBody")}</p>
                </div>
              </div>

              {/* Estimated Pricing Notice */}
              <div className="flex items-start gap-3 p-4 bg-jade-50 border border-jade-200 rounded-2xl text-sm text-jade-800">
                <Info size={16} className="flex-shrink-0 mt-0.5 text-jade-600" />
                <div>
                  <p className="font-semibold mb-0.5">{t("checkout.estimatedPricingTitle")}</p>
                  <p className="leading-relaxed">{t("checkout.estimatedPricingBody")}</p>
                </div>
              </div>

              <div className="card p-6 sm:p-8 space-y-5">
                <h2 className="font-semibold text-charcoal text-lg mb-1">{t("delivery.deliveryDetails")}</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label={t("checkout.fullName")} required error={errors.name}>
                    <input value={details.name} onChange={set('name')} placeholder={t("checkout.fullNamePlaceholder")} className={inputClass(errors.name)} />
                  </Field>
                  <Field label={t("checkout.phoneNumber")} required error={errors.phone}>
                    <input value={details.phone} onChange={set('phone')} placeholder={t("checkout.phonePlaceholder")} className={inputClass(errors.phone)} />
                  </Field>
                </div>

                <Field label={t("checkout.emailAddress")} required error={errors.email}>
                  <input type="email" value={details.email} readOnly className={`${inputClass(errors.email)} bg-cream-100 cursor-default text-gray-500`} />
                </Field>

                <Field label={t("checkout.apartment")} error={errors.apartment}>
                  <input value={details.apartment} onChange={set('apartment')} placeholder={t("checkout.apartmentPlaceholder")} className={inputClass(errors.apartment)} />
                </Field>

                <Field label={t("checkout.unitNumber")} required error={errors.houseUnit}>
                  <input value={details.houseUnit} onChange={set('houseUnit')} placeholder={t("checkout.unitPlaceholder")} className={inputClass(errors.houseUnit)} />
                </Field>

                <Field label={t("checkout.deliveryPoint")} required error={errors.deliveryPointName}>
                  <select value={details.deliveryPointName} onChange={(e) => setDeliveryPoint(e.target.value)} className={inputClass(errors.deliveryPointName)}>
                    <option value="">{t("checkout.selectDeliveryPoint")}</option>
                    {deliveryPoints.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name} · RM{formatCurrency(p.delivery_fee)} · {p.delivery_method}
                      </option>
                    ))}
                  </select>
                </Field>
                {details.deliveryMethod && (
                  <p className="text-xs text-gray-500 -mt-2">
                    {t("checkout.deliveryMethod", { method: details.deliveryMethod })}
                  </p>
                )}

                <Field label={t("checkout.orderNotes")}>
                  <textarea
                    value={details.notes}
                    onChange={set('notes')}
                    rows={3}
                    placeholder={t("checkout.orderNotesPlaceholder")}
                    className={inputClass() + ' resize-none'}
                  />
                </Field>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t("delivery.deliveryDay")} <span className="text-red-500">*</span>
                  </label>
                  <DeliverySlotSelector selected={deliveryDay} onChange={setDeliveryDay} />
                  {errors.deliveryDay && <p className="mt-1 text-xs text-red-500">{errors.deliveryDay}</p>}
                  {deliveryDay && (
                    <p className="text-xs text-jade-700 font-medium mt-2">
                      {t("checkout.nextDelivery")} {nextDeliveryDate(deliveryDay)}
                    </p>
                  )}
                </div>

                <button onClick={handleContinue} className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 text-base">
                  {t("checkout.continueToPayment")} <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 'payment' && (
            <div className="card p-6 sm:p-8 space-y-5">
              <h2 className="font-semibold text-charcoal text-lg mb-1">{t("payment.title")}</h2>
              <div className="bg-jade-50 border border-jade-200 rounded-2xl px-5 py-4">
                <div className="flex items-center gap-2 text-jade-700 mb-1">
                  <Lock size={14} />
                  <span className="text-sm font-semibold">{t("payment.cashOnDelivery")}</span>
                </div>
                <p className="text-sm text-jade-600">{t("payment.codDescription", { total: formatCurrency(total) })}</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 border border-cream-200 rounded-2xl">
                  <p className="text-xs text-gray-400 mb-1 font-medium">{t("delivery.deliveryTo")}</p>
                  <p className="text-sm font-semibold">{details.name}</p>
                  {details.apartment && <p className="text-sm text-gray-600">{details.apartment}</p>}
                  <p className="text-sm text-gray-600">Unit {details.houseUnit}</p>
                  <p className="text-sm text-gray-600">{details.deliveryPointName}</p>
                  {details.deliveryMethod && (
                    <p className="text-xs text-forest-700 font-medium">{details.deliveryMethod}</p>
                  )}
                  <p className="text-sm text-gray-500 mt-1">{details.phone} · {details.email}</p>
                  {details.notes && (
                    <div className="mt-2 pt-2 border-t border-cream-200">
                      <p className="text-xs text-gray-400 font-medium">{t("checkout.remarks")}</p>
                      <p className="text-sm text-gray-600 mt-0.5">{details.notes}</p>
                    </div>
                  )}
                </div>
                <div className="p-4 border border-cream-200 rounded-2xl">
                  <p className="text-xs text-gray-400 mb-1 font-medium">{t("delivery.slotLabel")}</p>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-forest-600" />
                    <p className="text-sm font-semibold capitalize">{deliveryDay}, {config.time}</p>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{nextDeliveryDate(deliveryDay!)}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep('details')} className="btn-secondary flex-1">
                  {t("checkout.back")}
                </button>
                <button
                  onClick={handlePlaceOrder}
                  disabled={placing}
                  className={`flex-1 btn-primary flex items-center justify-center gap-2 py-3.5 text-base ${placing ? 'opacity-70 cursor-wait' : ''}`}
                >
                  {placing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t("checkout.placingOrder")}
                    </>
                  ) : (
                    <>{t("checkout.placeOrder", { total: formatCurrency(total) })}</>
                  )}
                </button>
                {placeError && (
                  <p className="text-sm text-red-600 text-center mt-2">{placeError}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Order summary sidebar */}
        <div>
          <div className="card p-5 sticky top-24">
            <h3 className="font-semibold text-charcoal mb-4">{t("checkout.orderSummary")}</h3>
            <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
              {cart.items.map((item) => (
                <div key={item.comboId ?? item.productId}>
                  <div className="flex gap-3">
                    <ProductImage src={item.image} alt={item.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-charcoal leading-snug truncate">{item.name}</p>
                      {item.preparation && (
                        <p className="text-xs text-gray-400">{t("cartItem.preparation." + item.preparation)}</p>
                      )}
                      {isWeightItem(item) ? (
                        <p className="text-xs text-amber-600">~{(item.estimatedWeight ?? 0).toFixed(2)} kg</p>
                      ) : isSliceItem(item) ? (
                        <p className="text-xs text-gray-500">{t("checkout.slices", { count: item.sliceQuantity ?? item.quantity })}</p>
                      ) : (
                        <p className="text-xs text-gray-400">{t("checkout.qty", { count: item.quantity })}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {isWeightItem(item) ? (
                        <div>
                          <p className="text-sm font-semibold text-amber-700">≈ RM{formatCurrency(item.price * (item.estimatedWeight ?? 0))}</p>
                          <p className="text-xs text-amber-600 leading-tight">{t("checkout.estimatedOnly")}</p>
                        </div>
                      ) : isSliceItem(item) ? (
                        <p className="text-xs text-gray-400 leading-tight max-w-[7rem]">{t("checkout.afterWeighing")}</p>
                      ) : (
                        <p className="text-sm font-semibold text-forest-800">RM{formatCurrency(item.price * item.quantity)}</p>
                      )}
                    </div>
                  </div>
                  {/* Expanded combo items */}
                  {item.comboItems && item.comboItems.length > 0 && (
                    <div className="ml-14 mt-2 pl-3 border-l-2 border-jade-200 space-y-1.5">
                      <p className="text-xs font-semibold text-jade-700 uppercase tracking-wide">{t("checkout.contains")}</p>
                      {item.comboItems.map((ci) => (
                        <div key={ci.productId} className="flex items-start gap-2 text-xs">
                          <Package size={12} className="text-jade-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="text-gray-700 font-medium">{ci.label}</span>
                            {ci.preparation && (
                              <p className="text-gray-400">{t("checkout.preparation", { prep: t("cartItem.preparation." + ci.preparation) })}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {cart.items.some((i) => isWeightItem(i) || isSliceItem(i)) && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3 leading-relaxed">
                {t("checkout.finalPriceAfterWeighing")}
              </p>
            )}
            <div className="border-t border-cream-200 pt-3 space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>{t("checkout.subtotal")}</span><span>RM{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>{t("checkout.delivery")}</span>
                <span>RM{formatCurrency(deliveryFee)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-cream-200 pt-2">
                <span>{t("checkout.total")}</span>
                <span className="text-forest-800">RM{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
