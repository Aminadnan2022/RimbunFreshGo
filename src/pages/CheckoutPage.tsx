import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Info, Lock } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useDeliveryConfig } from '../context/DeliveryConfigContext';
import { useLanguage } from '../context/LanguageContext';
import { useWebsiteSettings } from '../context/WebsiteSettingsContext';
import { supabase } from '../lib/supabase';
import { fetchActiveDeliveryPoints, type DeliveryPoint } from '../data/delivery';
import { answerKey, loadPreparationTargets, requiredMissing, type PreparationAnswers, type PreparationQuestion, type PreparationTarget } from '../lib/checkoutPreparation';
import { buildCanonicalPlaceOrderRequest, placeCanonicalOrder, type CanonicalDeliveryMethod } from '../lib/canonicalCheckout';
import DeliverySlotSelector from '../components/ui/DeliverySlotSelector';
import { formatCurrency } from '../lib/currency';
import { isSliceItem } from '../lib/sellingOptions';
import type { CustomerDetails, DeliveryDay, CartItem } from '../types';

const blank: CustomerDetails = { name: '', phone: '', email: '', apartment: '', houseUnit: '', pickupLocation: '', deliveryPointName: '', deliveryMethod: '', notes: '' };
const days: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const nextDate = (day: DeliveryDay) => { const d = new Date(); let offset = (days[day.toLowerCase()] ?? 3) - d.getDay(); if (offset < 0) offset += 7; d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); };
const Field = ({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) => {
  const id = useId();
  const control = isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children;
  return <div><label htmlFor={id} className="block text-sm font-semibold text-gray-700 mb-1.5">{label}{required && ' *'}</label>{control}{error && <p className="mt-1 text-xs text-red-500">{error}</p>}</div>;
};

export default function CheckoutPage() {
  const { cart, subtotal, clearCart } = useCart(); const { user, loading: authLoading } = useAuth(); const { config } = useDeliveryConfig(); const { t, language } = useLanguage(); const { settings } = useWebsiteSettings(); const navigate = useNavigate();
  const [details, setDetails] = useState(blank); const [points, setPoints] = useState<DeliveryPoint[]>([]); const [deliveryDay, setDeliveryDay] = useState<DeliveryDay | null>(cart.deliveryDay); const [errors, setErrors] = useState<Record<string, string>>({});
  const [deliveryMethod, setDeliveryMethod] = useState<CanonicalDeliveryMethod>('normal_bulk'); const [instantDate, setInstantDate] = useState(''); const [instantTime, setInstantTime] = useState('');
  const [step, setStep] = useState<'details' | 'preparation' | 'review' | 'payment'>('details'); const [targets, setTargets] = useState<PreparationTarget[]>([]); const [answers, setAnswers] = useState<PreparationAnswers>({}); const [prepLoading, setPrepLoading] = useState(true); const [prepError, setPrepError] = useState<string | null>(null); const [placing, setPlacing] = useState(false); const [placeError, setPlaceError] = useState<string | null>(null);
  // State updates are asynchronous, so `placing` alone does not prevent two
  // fast clicks from issuing duplicate checkout RPCs before the next render.
  const placementLock = useRef(false);
  // Retained until confirmed success, so a timeout/error retry uses the same
  // server-side identity but a later deliberate checkout gets a new key.
  const checkoutAttemptKey = useRef<string | null>(null);
  const weighted = (item: CartItem) => !isSliceItem(item) && (item.orderingMode === 'weight_only' || item.orderingMode === 'whole_fish_by_weight' || item.pricingType === 'per_kg');
  const fee = points.find((p) => p.name === details.deliveryPointName)?.delivery_fee ?? 0; const total = subtotal + fee; const input = (e?: string) => `w-full bg-cream-50 border rounded-2xl px-4 py-3 text-sm ${e ? 'border-red-300 bg-red-50' : 'border-cream-300'}`;
  useEffect(() => { fetchActiveDeliveryPoints().then(setPoints).catch(() => {}); }, []);
  useEffect(() => { if (!user) return; setDetails((x) => ({ ...x, email: user.email ?? '' })); supabase.from('customer_profiles').select('full_name, phone, apartment, house_unit, pickup_location, notes').eq('id', user.id).maybeSingle().then(({ data }) => { if (data) setDetails((x) => ({ ...x, name: data.full_name || x.name, phone: data.phone || x.phone, apartment: data.apartment || x.apartment, houseUnit: data.house_unit || x.houseUnit, pickupLocation: data.pickup_location || x.pickupLocation, deliveryPointName: data.pickup_location || x.deliveryPointName, notes: data.notes || x.notes })); }); }, [user]);
useEffect(() => {
  let mounted = true;

  setPrepLoading(true);
  setPrepError(null);

  loadPreparationTargets(cart.items)
    .then((loadedTargets) => {
      if (!mounted) return;

      setTargets(loadedTargets);
      setPrepError(null);
    })
    .catch(() => {
      if (!mounted) return;

      setTargets([]);
      setPrepError(t('checkout.preparationLoadError'));
    })
    .finally(() => {
      if (mounted) {
        setPrepLoading(false);
      }
    });

  return () => {
    mounted = false;
  };
}, [cart.items, t]);
useEffect(() => {
  // The banner is set only inside the "Continue" click handler; without this,
  // it stays visible even after the user supplies the missing answer.
  if (prepError === t('checkout.preparationRequired') && !requiredMissing(targets, answers)) {
    setPrepError(null);
  }
}, [targets, answers, prepError, t]);
  const display = (x: { label: string; label_ms: string }) => language === 'ms' && x.label_ms ? x.label_ms : x.label;
  const setField = (field: keyof CustomerDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setDetails((x) => ({ ...x, [field]: e.target.value })); setErrors((x) => ({ ...x, [field]: '' })); };
  const setPoint = (name: string) => { const p = points.find((x) => x.name === name); setDetails((x) => ({ ...x, pickupLocation: name, deliveryPointName: name, deliveryMethod: p?.delivery_method ?? '' })); };
  const setAnswer = (target: PreparationTarget, unit: number | null, question: PreparationQuestion, value: unknown) => setAnswers((x) => ({ ...x, [answerKey(target, unit)]: { ...(x[answerKey(target, unit)] ?? {}), [question.code]: value } }));
  const validateDetails = () => { const e: Record<string, string> = {}; if (!details.name.trim()) e.name = t('checkout.validation.fullNameRequired'); if (!/^((\+?60)|0)\d{8,10}$/.test(details.phone.replace(/\s/g, ''))) e.phone = t('checkout.validation.phoneInvalid'); if (!details.email.includes('@')) e.email = t('checkout.validation.emailInvalid'); if (!details.houseUnit.trim()) e.houseUnit = t('checkout.validation.unitRequired'); if (deliveryMethod === 'normal_bulk' && !details.deliveryPointName) e.deliveryPointName = t('checkout.validation.deliveryPointRequired'); if (deliveryMethod === 'normal_bulk' && !deliveryDay) e.deliveryDay = t('checkout.validation.deliveryDayRequired'); if (deliveryMethod === 'instant_customer_lalamove' && !instantDate) e.deliveryDay = t('checkout.validation.deliveryDayRequired'); if (deliveryMethod === 'instant_customer_lalamove' && !instantTime) e.deliveryTime = t('checkout.validation.deliveryDayRequired'); setErrors(e); return !Object.keys(e).length; };
  const createOrder = async () => { if (!settings.allow_customer_orders) return setPlaceError(t('checkout.validation.ordersDisabled')); if (placementLock.current) return; placementLock.current = true; setPlacing(true); setPlaceError(null); try { const idempotencyKey = checkoutAttemptKey.current ?? crypto.randomUUID(); checkoutAttemptKey.current = idempotencyKey; const request = buildCanonicalPlaceOrderRequest({ idempotencyKey, customer: details, items: cart.items, deliveryMethod, deliveryDay, instantDate, instantTime, preparationTargets: targets, preparationAnswers: answers }); const order = await placeCanonicalOrder(request); checkoutAttemptKey.current = null; await supabase.from('customer_profiles').upsert({ id: user!.id, email_address: user!.email, full_name: details.name, phone: details.phone, apartment: details.apartment, house_unit: details.houseUnit, pickup_location: details.pickupLocation, notes: details.notes || null, updated_at: new Date().toISOString() }, { onConflict: 'id' }); clearCart(); navigate(`/order/${order.order_number}`); } catch (err) { setPlaceError(err instanceof Error ? err.message : t('checkout.validation.failedToPlaceOrder')); } finally { placementLock.current = false; setPlacing(false); } };
  const Question = ({ target, unit, question }: { target: PreparationTarget; unit: number | null; question: PreparationQuestion }) => { const value = answers[answerKey(target, unit)]?.[question.code]; if (question.answer_type === 'boolean') return <fieldset><legend className="text-sm font-medium">{display(question)}{question.required && ' *'}</legend><div className="mt-2 flex gap-3"><button type="button" onClick={() => setAnswer(target, unit, question, true)} className={`rounded-xl px-4 py-2 text-sm ${value === true ? 'bg-forest-700 text-white' : 'bg-cream-100'}`}>{t('checkout.yes')}</button><button type="button" onClick={() => setAnswer(target, unit, question, false)} className={`rounded-xl px-4 py-2 text-sm ${value === false ? 'bg-forest-700 text-white' : 'bg-cream-100'}`}>{t('checkout.no')}</button></div></fieldset>; if (question.answer_type === 'single_select') return <Field label={`${display(question)}${question.required ? ' *' : ''}`}><select className={input()} value={String(value ?? '')} onChange={(e) => setAnswer(target, unit, question, e.target.value)}><option value="">{t('checkout.selectOption')}</option>{question.options.map((o) => <option key={o.code} value={o.code}>{display(o)}</option>)}</select></Field>; return <Field label={`${display(question)}${question.required ? ' *' : ''}`}><input className={input()} value={String(value ?? '')} onChange={(e) => setAnswer(target, unit, question, e.target.value)} /></Field>; };
  const Totals = () => <div className="border-t pt-3 space-y-1 text-sm"><p className="flex justify-between"><span>{t('checkout.subtotal')}</span><span>RM{formatCurrency(subtotal)}</span></p><p className="flex justify-between"><span>{t('checkout.delivery')}</span><span>RM{formatCurrency(fee)}</span></p><p className="flex justify-between font-bold"><span>{t('checkout.total')}</span><span>RM{formatCurrency(total)}</span></p></div>;
const Preparation = () => (
  <div className="card p-5 sm:p-8 space-y-6">
    <h2 className="font-semibold text-lg">
      {t('checkout.preparationTitle')}
    </h2>

    {prepLoading && (
      <p>{t('checkout.preparationLoading')}</p>
    )}

    {!prepLoading && !prepError && targets.length === 0 && (
      <p className="text-gray-500">
        {t('checkout.noPreparationNeeded')}
      </p>
    )}

    {targets.map((target) => {
      const physical = target.questionnaire.questions.some(
        (q) => q.selection_scope === 'physical_unit'
      );

      const unitName = target.name;

      return (
        <section
          key={target.key}
          className="border border-cream-200 rounded-2xl p-4 space-y-4"
        >
          <h3 className="font-semibold">{target.name}</h3>

          {physical && target.quantity > 1 && (
            <button
              type="button"
              className="text-sm text-forest-700 underline"
              onClick={() => {
                const first = answers[answerKey(target, 0)] ?? {};

                setAnswers((current) => ({
                  ...current,
                  ...Object.fromEntries(
                    Array.from({ length: target.quantity }, (_, i) => [
                      answerKey(target, i),
                      {
                        ...(current[answerKey(target, i)] ?? {}),
                        ...first,
                      },
                    ])
                  ),
                }));
              }}
            >
              {t('checkout.applySameToAll')}
            </button>
          )}

          {target.questionnaire.questions
            .filter((q) => q.selection_scope === 'line')
            .map((q) => (
              <Question
                key={q.code}
                target={target}
                unit={null}
                question={q}
              />
            ))}

          {physical &&
            Array.from({ length: target.quantity }, (_, unit) => (
              <div
                key={unit}
                className="border-t pt-4 space-y-4"
              >
                <h4 className="font-medium">
                  {unitName} #{unit + 1}
                </h4>

                {target.questionnaire.questions
                  .filter((q) => q.selection_scope === 'physical_unit')
                  .map((q) => (
                    <Question
                      key={q.code}
                      target={target}
                      unit={unit}
                      question={q}
                    />
                  ))}
              </div>
            ))}
        </section>
      );
    })}

    {prepError && (
      <p className="text-sm text-red-600">
        {prepError}
      </p>
    )}

    <div className="flex gap-3">
      <button
        className="btn-secondary flex-1"
        onClick={() => setStep('details')}
      >
        {t('checkout.back')}
      </button>

      <button
        className="btn-primary flex-1"
        disabled={prepLoading || Boolean(prepError)}
        onClick={() => {
          if (requiredMissing(targets, answers)) {
            setPrepError(t('checkout.preparationRequired'));
            return;
          }

          setPrepError(null);
          setStep('review');
        }}
      >
        {t('checkout.continueToReview')}
      </button>
    </div>
  </div>
);
  const Review = () => <div className="card p-5 sm:p-8 space-y-5"><h2 className="font-semibold text-lg">{t('checkout.reviewTitle')}</h2>{cart.items.map((item, index) => <div key={index} className="border-b pb-3"><p className="font-medium">{item.name} · {weighted(item) ? `~${item.estimatedWeight ?? 0} kg` : t('checkout.qty', { count: item.quantity })}</p>{targets.filter((x) => x.lineKey === `line-${index}`).map((target) => <div key={target.key} className="ml-3 mt-2 text-sm text-gray-600">{target.questionnaire.questions.some((q) => q.selection_scope === 'physical_unit') && Array.from({ length: target.quantity }, (_, unit) => <p key={unit}>{target.category === 'chicken' ? t('checkout.chicken') : t('checkout.unit')} #{unit + 1}: {target.questionnaire.questions.filter((q) => q.selection_scope === 'physical_unit').map((q) => `${display(q)}: ${String(answers[answerKey(target, unit)]?.[q.code] ?? '—')}`).join(' · ')}</p>)}{target.questionnaire.questions.filter((q) => q.selection_scope === 'line').map((q) => <p key={q.code}>{display(q)}: {String(answers[answerKey(target, null)]?.[q.code] ?? '—')}</p>)}</div>)}</div>)}<div className="rounded-xl bg-cream-50 p-4 text-sm"><p className="font-semibold">{details.name}</p><p>{details.houseUnit}, {details.deliveryPointName}</p><p>{details.phone} · {details.email}</p><p>{nextDate(deliveryDay!)} · {config.time}</p></div><Totals/><p className="text-xs text-amber-700">{t('checkout.finalPriceAfterWeighing')}</p><div className="flex gap-3"><button className="btn-secondary flex-1" onClick={() => setStep('preparation')}>{t('checkout.back')}</button><button className="btn-primary flex-1" onClick={() => setStep('payment')}>{t('checkout.continueToPayment')}</button></div></div>;
  if (authLoading) return <main className="py-20 text-center">Loading…</main>; if (!user) return <Navigate to="/" replace/>; if (!cart.items.length && !placing) return <Navigate to="/cart" replace/>;
  const steps = [['details', t('checkout.yourDetails')], ['preparation', t('checkout.preparation')], ['review', t('checkout.review')], ['payment', t('checkout.payment')]] as const;
  return <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8"><Link to="/cart" className="inline-flex items-center gap-2 text-sm text-gray-500"><ChevronLeft size={16}/>{t('checkout.backToCart')}</Link><h1 className="section-title mt-5">{t('checkout.title')}</h1><div className="flex gap-2 overflow-x-auto py-6">{steps.map(([id, title], i) => <div key={id} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${step === id ? 'bg-forest-700 text-white' : steps.findIndex(([x]) => x === step) > i ? 'bg-jade-100 text-jade-700' : 'bg-cream-100 text-gray-500'}`}>{i + 1}. {title}</div>)}</div><div className="grid lg:grid-cols-3 gap-6"><div className="lg:col-span-2">{step === 'details' && <div className="card p-5 sm:p-8 space-y-5"><div className="flex gap-2 text-sm bg-amber-50 p-3 rounded-xl"><Info size={16}/>{t('checkout.estimatedPricingBody')}</div><h2 className="font-semibold text-lg">{t('delivery.deliveryDetails')}</h2><Field label={t('checkout.fullName')} required error={errors.name}><input className={input(errors.name)} value={details.name} onChange={setField('name')}/></Field><Field label={t('checkout.phoneNumber')} required error={errors.phone}><input className={input(errors.phone)} value={details.phone} onChange={setField('phone')}/></Field><Field label={t('checkout.emailAddress')} required error={errors.email}><input className={input(errors.email)} value={details.email} readOnly/></Field><Field label={t('checkout.unitNumber')} required error={errors.houseUnit}><input className={input(errors.houseUnit)} value={details.houseUnit} onChange={setField('houseUnit')}/></Field><Field label="Delivery method" required><select className={input()} value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value as CanonicalDeliveryMethod)}><option value="normal_bulk">Normal bulk delivery</option><option value="instant_customer_lalamove">Instant delivery (book Lalamove)</option></select></Field>{deliveryMethod === 'normal_bulk' && <><Field label={t('checkout.deliveryPoint')} required error={errors.deliveryPointName}><select className={input(errors.deliveryPointName)} value={details.deliveryPointName} onChange={(e) => setPoint(e.target.value)}><option value="">{t('checkout.selectDeliveryPoint')}</option>{points.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}</select></Field><div><p className="font-semibold text-sm mb-2">{t('delivery.deliveryDay')} *</p><DeliverySlotSelector selected={deliveryDay} onChange={setDeliveryDay}/>{errors.deliveryDay && <p className="text-red-500 text-xs">{errors.deliveryDay}</p>}</div></>}{deliveryMethod === 'instant_customer_lalamove' && <><Field label="Requested delivery date" required error={errors.deliveryDay}><input className={input(errors.deliveryDay)} type="date" value={instantDate} onChange={(e) => setInstantDate(e.target.value)}/></Field><Field label="Requested delivery time" required error={errors.deliveryTime}><input className={input(errors.deliveryTime)} type="time" value={instantTime} onChange={(e) => setInstantTime(e.target.value)}/></Field></>}<Field label={t('checkout.orderNotes')}><textarea className={input()} value={details.notes} onChange={setField('notes')}/></Field><button className="btn-primary w-full" onClick={() => validateDetails() && setStep('preparation')}>{t('checkout.continueToPreparation')} <ChevronRight size={16} className="inline"/></button></div>}{step === 'preparation' && <Preparation/>}{step === 'review' && <Review/>}{step === 'payment' && <div className="card p-5 sm:p-8 space-y-5"><h2 className="font-semibold text-lg">{t('payment.title')}</h2><div className="bg-jade-50 p-4 rounded-xl"><Lock size={15} className="inline mr-2"/>{t('payment.codDescription', { total: formatCurrency(total) })}</div><Totals/><div className="flex gap-3"><button className="btn-secondary flex-1" onClick={() => setStep('review')}>{t('checkout.back')}</button><button disabled={placing} className="btn-primary flex-1" onClick={createOrder}>{placing ? t('checkout.placingOrder') : t('checkout.placeOrder', { total: formatCurrency(total) })}</button></div>{placeError && <p className="text-red-600 text-sm">{placeError}</p>}</div>}</div><aside className="card p-5 h-fit"><h3 className="font-semibold mb-3">{t('checkout.orderSummary')}</h3>{cart.items.map((x, i) => <p key={i} className="text-sm mb-2">{x.name} × {x.quantity}</p>)}<Totals/></aside></div></main>;
}
