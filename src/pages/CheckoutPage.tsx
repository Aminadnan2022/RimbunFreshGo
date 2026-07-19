import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Clock, Lock, Info } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { useDeliveryConfig } from '../context/DeliveryConfigContext';
import { supabase } from '../lib/supabase';
import DeliverySlotSelector from '../components/ui/DeliverySlotSelector';
import type { CustomerDetails, DeliveryDay, Order } from '../types';

const initialDetails: CustomerDetails = {
  name: '', phone: '', email: '', apartment: '', houseUnit: '', pickupLocation: '', notes: '',
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

const prepLabel = (p?: string): string => {
  const map: Record<string, string> = {
    whole: 'Whole', cleaned: 'Cleaned', descaled: 'Descaled', gutted: 'Gutted & Cleaned',
    cut: 'Cut into pieces', cut4: 'Cut into 4', cut12: 'Cut into 12', cut16: 'Cut into 16',
  };
  return p ? (map[p] ?? p) : '';
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
  const navigate = useNavigate();

  const [details, setDetails] = useState<CustomerDetails>(initialDetails);
  const [deliveryDay, setDeliveryDay] = useState<DeliveryDay | null>(cart.deliveryDay);
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerDetails | 'deliveryDay', string>>>({});
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [step, setStep] = useState<'details' | 'payment' | 'done'>('details');

  // Pre-populate form from saved delivery profile
  useEffect(() => {
    if (!user) return;
    setDetails((prev) => ({ ...prev, email: user.email ?? '' }));
    supabase
      .from('customer_profiles')
      .select('full_name, phone, apartment, house_unit, pickup_location')
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
        }));
      });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const deliveryFee = subtotal >= 50 ? 0 : 5;
  const total = subtotal + deliveryFee;

  const validate = () => {
    const e: typeof errors = {};
    if (!details.name.trim()) e.name = 'Full name is required';
    if (!details.phone.trim()) e.phone = 'Phone number is required';
    else if (!/^(\+?60|0)\d{8,10}$/.test(details.phone.replace(/\s/g, '')))
      e.phone = 'Enter a valid Malaysian phone number';
    if (!details.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) e.email = 'Enter a valid email';
    if (!details.houseUnit.trim()) e.houseUnit = 'House unit number is required (e.g. A-18-08)';
    if (!details.pickupLocation) e.pickupLocation = 'Please select a pickup location';
    if (!deliveryDay) e.deliveryDay = 'Please select a delivery day';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContinue = () => {
    if (validate()) setStep('payment');
  };

  const handlePlaceOrder = async () => {
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
        full_name:        details.name,
        phone:            details.phone,
        apartment:        details.apartment,
        house_unit:       details.houseUnit,
        pickup_location:  details.pickupLocation,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      clearCart();
      setStep('done');
      navigate(`/order/${id}`);
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : 'Failed to place order. Please try again.');
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
      <h1 className="section-title mb-2">Checkout</h1>
      <p className="text-gray-500 mb-8">Complete your order below.</p>

      {/* Progress steps */}
      <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-2">
        {(['details', 'payment'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-shrink-0">
            {i > 0 && <ChevronRight size={16} className="text-gray-300" />}
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium ${
              step === s ? 'bg-forest-700 text-white' : step === 'payment' && s === 'details' ? 'bg-jade-100 text-jade-700' : 'bg-cream-100 text-gray-400'
            }`}>
              {step === 'payment' && s === 'details' ? <CheckCircle2 size={14} /> : <span className="w-4 h-4 flex items-center justify-center">{i + 1}</span>}
              {s === 'details' ? 'Your Details' : 'Payment'}
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
                  <p className="font-semibold mb-0.5">Product Images</p>
                  <p className="leading-relaxed">Product images are for illustration purposes only. As our products are fresh and natural, the actual size, colour, shape and appearance may vary. Every fish, chicken and seafood item is unique.</p>
                </div>
              </div>

              {/* Estimated Pricing Notice */}
              <div className="flex items-start gap-3 p-4 bg-jade-50 border border-jade-200 rounded-2xl text-sm text-jade-800">
                <Info size={16} className="flex-shrink-0 mt-0.5 text-jade-600" />
                <div>
                  <p className="font-semibold mb-0.5">Estimated Pricing</p>
                  <p className="leading-relaxed">Prices displayed for products sold by weight are estimated prices only. The final selling price will be calculated based on the actual weight after preparation and the latest selling price for the delivery day. This applies to fish, prawns, squid and all products sold by kilogram. Whole Chicken is charged at the listed fixed price.</p>
                </div>
              </div>

              <div className="card p-6 sm:p-8 space-y-5">
                <h2 className="font-semibold text-charcoal text-lg mb-1">Delivery Details</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field label="Full Name" required error={errors.name}>
                    <input value={details.name} onChange={set('name')} placeholder="Ahmad bin Abdullah" className={inputClass(errors.name)} />
                  </Field>
                  <Field label="Phone Number" required error={errors.phone}>
                    <input value={details.phone} onChange={set('phone')} placeholder="012-345 6789" className={inputClass(errors.phone)} />
                  </Field>
                </div>

                <Field label="Email Address" required error={errors.email}>
                  <input type="email" value={details.email} readOnly className={`${inputClass(errors.email)} bg-cream-100 cursor-default text-gray-500`} />
                </Field>

                <Field label="Apartment / Block (optional)" error={errors.apartment}>
                  <input value={details.apartment} onChange={set('apartment')} placeholder="e.g. Rimbun Apartment, Block B" className={inputClass(errors.apartment)} />
                </Field>

                <Field label="House / Unit Number" required error={errors.houseUnit}>
                  <input value={details.houseUnit} onChange={set('houseUnit')} placeholder="e.g. A-18-08" className={inputClass(errors.houseUnit)} />
                </Field>

                <Field label="Pickup Location" required error={errors.pickupLocation}>
                  <select value={details.pickupLocation} onChange={set('pickupLocation')} className={inputClass(errors.pickupLocation)}>
                    <option value="">Select a pickup location...</option>
                    {config.pickupLocations.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Order Notes (optional)">
                  <textarea
                    value={details.notes}
                    onChange={set('notes')}
                    rows={3}
                    placeholder="Any special requests or cleaning preferences..."
                    className={inputClass() + ' resize-none'}
                  />
                </Field>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Delivery Day <span className="text-red-500">*</span>
                  </label>
                  <DeliverySlotSelector selected={deliveryDay} onChange={setDeliveryDay} />
                  {errors.deliveryDay && <p className="mt-1 text-xs text-red-500">{errors.deliveryDay}</p>}
                  {deliveryDay && (
                    <p className="text-xs text-jade-700 font-medium mt-2">
                      Next delivery: {nextDeliveryDate(deliveryDay)}
                    </p>
                  )}
                </div>

                <button onClick={handleContinue} className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 text-base">
                  Continue to Payment <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 'payment' && (
            <div className="card p-6 sm:p-8 space-y-5">
              <h2 className="font-semibold text-charcoal text-lg mb-1">Payment</h2>
              <div className="bg-jade-50 border border-jade-200 rounded-2xl px-5 py-4">
                <div className="flex items-center gap-2 text-jade-700 mb-1">
                  <Lock size={14} />
                  <span className="text-sm font-semibold">Cash on Delivery</span>
                </div>
                <p className="text-sm text-jade-600">Pay RM{total.toFixed(2)} in cash when your order arrives. Our rider will have exact change.</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 border border-cream-200 rounded-2xl">
                  <p className="text-xs text-gray-400 mb-1 font-medium">DELIVERY TO</p>
                  <p className="text-sm font-semibold">{details.name}</p>
                  {details.apartment && <p className="text-sm text-gray-600">{details.apartment}</p>}
                  <p className="text-sm text-gray-600">Unit {details.houseUnit}</p>
                  <p className="text-sm text-gray-600">{details.pickupLocation}</p>
                  <p className="text-sm text-gray-500 mt-1">{details.phone} · {details.email}</p>
                </div>
                <div className="p-4 border border-cream-200 rounded-2xl">
                  <p className="text-xs text-gray-400 mb-1 font-medium">DELIVERY SLOT</p>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-forest-600" />
                    <p className="text-sm font-semibold capitalize">{deliveryDay}, {config.time}</p>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{nextDeliveryDate(deliveryDay!)}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep('details')} className="btn-secondary flex-1">
                  Back
                </button>
                <button
                  onClick={handlePlaceOrder}
                  disabled={placing}
                  className={`flex-1 btn-primary flex items-center justify-center gap-2 py-3.5 text-base ${placing ? 'opacity-70 cursor-wait' : ''}`}
                >
                  {placing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Placing Order...
                    </>
                  ) : (
                    <>Place Order — RM{total.toFixed(2)}</>
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
            <h3 className="font-semibold text-charcoal mb-4">Order Summary</h3>
            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
              {cart.items.map((item) => (
                <div key={item.comboId ?? item.productId} className="flex gap-3">
                  <img src={item.image} alt={item.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-charcoal leading-snug truncate">{item.name}</p>
                    {item.preparation && (
                      <p className="text-xs text-gray-400">{prepLabel(item.preparation)}</p>
                    )}
                    <p className="text-xs text-gray-400">Qty {item.quantity}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {item.pricingType === 'per_kg' ? (
                      <div>
                        <p className="text-sm font-semibold text-amber-700">≈ RM{(item.price * item.quantity).toFixed(2)}</p>
                        <p className="text-xs text-amber-600 leading-tight">est. only</p>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-forest-800">RM{(item.price * item.quantity).toFixed(2)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {cart.items.some((i) => i.pricingType === 'per_kg') && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3 leading-relaxed">
                Final price will be confirmed after weighing.
              </p>
            )}
            <div className="border-t border-cream-200 pt-3 space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span><span>RM{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Delivery</span>
                <span className={deliveryFee === 0 ? 'text-jade-600 font-semibold' : ''}>
                  {deliveryFee === 0 ? 'FREE' : `RM${deliveryFee.toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between font-bold border-t border-cream-200 pt-2">
                <span>Total</span>
                <span className="text-forest-800">RM{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
