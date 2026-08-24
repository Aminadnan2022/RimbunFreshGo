import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Info, Lock, Upload } from 'lucide-react';
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
import { concisePreparationText, conciseReviewLabel, orderedQuantityText } from '../lib/checkoutReview';
import { getCheckoutPaymentPreview, isPriceFinalAtCheckout, paymentQrPublicUrl, type CheckoutPaymentPreview } from '../lib/checkoutPayment';
import type { CustomerDetails, DeliveryDay } from '../types';

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
  const [paymentPreview, setPaymentPreview] = useState<CheckoutPaymentPreview | null>(null); const [paymentPreviewLoading, setPaymentPreviewLoading] = useState(false); const [paymentPreviewError, setPaymentPreviewError] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [stagedReceipt, setStagedReceipt] = useState<{ storagePath: string; fileName: string } | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  // State updates are asynchronous, so `placing` alone does not prevent two
  // fast clicks from issuing duplicate checkout RPCs before the next render.
  const placementLock = useRef(false);
  const placementSucceeded = useRef(false);
  // Retained until confirmed success, so a timeout/error retry uses the same
  // server-side identity but a later deliberate checkout gets a new key.
  const checkoutAttemptKey = useRef<string | null>(null);
  const fee = points.find((p) => p.name === details.deliveryPointName)?.delivery_fee ?? 0; const total = subtotal + fee; const input = (e?: string) => `w-full bg-cream-50 border rounded-2xl px-4 py-3 text-sm ${e ? 'border-red-300 bg-red-50' : 'border-cream-300'}`;
  const priceFinalAtCheckout = isPriceFinalAtCheckout(cart.items);
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
  useEffect(() => {
    if (step !== 'payment' || !priceFinalAtCheckout) return;
    let mounted = true;
    setPaymentPreviewLoading(true);
    setPaymentPreviewError(null);
    getCheckoutPaymentPreview()
      .then((preview) => { if (mounted) setPaymentPreview(preview); })
      .catch(() => { if (mounted) { setPaymentPreview(null); setPaymentPreviewError(t('payment.qrUnavailable')); } })
      .finally(() => { if (mounted) setPaymentPreviewLoading(false); });
    return () => { mounted = false; };
  }, [step, priceFinalAtCheckout, t]);
  const display = (x: { label: string; label_ms: string }) => language === 'ms' && x.label_ms ? x.label_ms : x.label;
  const reviewText = (target: PreparationTarget, unit: number | null) =>
    concisePreparationText(target, answers, unit, language);
  const setField = (field: keyof CustomerDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setDetails((x) => ({ ...x, [field]: e.target.value })); setErrors((x) => ({ ...x, [field]: '' })); };
  const setPoint = (name: string) => { const p = points.find((x) => x.name === name); setDetails((x) => ({ ...x, pickupLocation: name, deliveryPointName: name, deliveryMethod: p?.delivery_method ?? '' })); };
  const setAnswer = (target: PreparationTarget, unit: number | null, question: PreparationQuestion, value: unknown) => setAnswers((x) => ({ ...x, [answerKey(target, unit)]: { ...(x[answerKey(target, unit)] ?? {}), [question.code]: value } }));
  const validateDetails = () => { const e: Record<string, string> = {}; if (!details.name.trim()) e.name = t('checkout.validation.fullNameRequired'); if (!/^((\+?60)|0)\d{8,10}$/.test(details.phone.replace(/\s/g, ''))) e.phone = t('checkout.validation.phoneInvalid'); if (!details.email.includes('@')) e.email = t('checkout.validation.emailInvalid'); if (!details.houseUnit.trim()) e.houseUnit = t('checkout.validation.unitRequired'); if (deliveryMethod === 'normal_bulk' && !details.deliveryPointName) e.deliveryPointName = t('checkout.validation.deliveryPointRequired'); if (deliveryMethod === 'normal_bulk' && !deliveryDay) e.deliveryDay = t('checkout.validation.deliveryDayRequired'); if (deliveryMethod === 'instant_customer_lalamove' && !instantDate) e.deliveryDay = t('checkout.validation.deliveryDayRequired'); if (deliveryMethod === 'instant_customer_lalamove' && !instantTime) e.deliveryTime = t('checkout.validation.deliveryDayRequired'); setErrors(e); return !Object.keys(e).length; };
  const ensureCheckoutAttemptKey = () => {
    const key = checkoutAttemptKey.current ?? crypto.randomUUID();
    checkoutAttemptKey.current = key;
    return key;
  };
  const uploadReceipt = async () => {
    if (!receiptFile || !paymentPreview || !user) return;
    setReceiptUploading(true); setReceiptError(null);
    const previousPath = stagedReceipt?.storagePath ?? null;
    let uploadedPath: string | null = null;
    try {
      const allowedTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
      const extension = allowedTypes[receiptFile.type];
      if (!extension) throw new Error(t('payment.receiptTypeError'));
      if (receiptFile.size <= 0 || receiptFile.size > 5 * 1024 * 1024) throw new Error(t('payment.receiptSizeError'));
      const idempotencyKey = ensureCheckoutAttemptKey();
      uploadedPath = `staging/${user.id}/${idempotencyKey}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('sales-order-payment-receipts').upload(uploadedPath, receiptFile, { cacheControl: '3600', upsert: false, contentType: receiptFile.type });
      if (uploadError) throw uploadError;
      const { error: stageError } = await supabase.rpc('stage_checkout_payment_receipt', {
        p_idempotency_key: idempotencyKey, p_storage_path: uploadedPath, p_original_file_name: receiptFile.name,
        p_mime_type: receiptFile.type, p_file_size: receiptFile.size, p_expected_final_total: total,
        p_payment_configuration_version_id: paymentPreview.configurationVersionId,
      });
      if (stageError) throw stageError;
      setStagedReceipt({ storagePath: uploadedPath, fileName: receiptFile.name });
      if (previousPath && previousPath !== uploadedPath) await supabase.storage.from('sales-order-payment-receipts').remove([previousPath]);
    } catch (err) {
      if (uploadedPath) await supabase.storage.from('sales-order-payment-receipts').remove([uploadedPath]);
      setReceiptError(err instanceof Error ? err.message : t('payment.receiptUploadError'));
    } finally { setReceiptUploading(false); }
  };
  const createOrder = async () => {
    if (!settings.allow_customer_orders) return setPlaceError(t('checkout.validation.ordersDisabled'));
    if (priceFinalAtCheckout && !paymentPreview) return setPlaceError(t('payment.qrUnavailable'));
    if (priceFinalAtCheckout && !stagedReceipt) return setPlaceError(t('payment.receiptRequired'));
    if (placementLock.current) return;
    placementLock.current = true; setPlacing(true); setPlaceError(null);
    try {
      const idempotencyKey = ensureCheckoutAttemptKey();
      const request = buildCanonicalPlaceOrderRequest({ idempotencyKey, customer: details, items: cart.items, deliveryMethod, deliveryDay, instantDate, instantTime, preparationTargets: targets, preparationAnswers: answers });
      if (priceFinalAtCheckout && paymentPreview) { request.p_expected_final_total = total; request.p_expected_payment_configuration_version_id = paymentPreview.configurationVersionId; }
      const order = await placeCanonicalOrder(request); checkoutAttemptKey.current = null;
      await supabase.from('customer_profiles').upsert({ id: user!.id, email_address: user!.email, full_name: details.name, phone: details.phone, apartment: details.apartment, house_unit: details.houseUnit, pickup_location: details.pickupLocation, notes: details.notes || null, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      placementSucceeded.current = true;
      navigate(`/order/${order.order_number}`, { replace: true });
      clearCart();
    } catch (err) { setPlaceError(err instanceof Error ? err.message : t('checkout.validation.failedToPlaceOrder')); }
    finally { placementLock.current = false; setPlacing(false); }
  };
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

    {cart.items.map((item, lineIndex) => {
      const lineTargets = targets.filter((target) => target.lineKey === `line-${lineIndex}`);
      if (!lineTargets.length) return null;

      if (item.isCombo && item.comboItems?.length) {
        const comboLabel = language === 'ms' ? 'Kombo' : 'Combo';
        return (
          <section key={lineIndex} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-forest-900">{item.name} × {item.quantity}</h3>
              {item.quantity > 1 && (
                <button
                  type="button"
                  className="text-sm text-forest-700 underline"
                  onClick={() => setAnswers((current) => {
                    const copied = { ...current };
                    lineTargets.forEach((target) => {
                      const unitsPerCombo = target.unitsPerCombo ?? 1;
                      for (let comboIndex = 1; comboIndex < item.quantity; comboIndex += 1) {
                        for (let componentUnit = 0; componentUnit < unitsPerCombo; componentUnit += 1) {
                          const source = answerKey(target, componentUnit);
                          const destination = answerKey(target, comboIndex * unitsPerCombo + componentUnit);
                          copied[destination] = { ...(current[destination] ?? {}), ...(current[source] ?? {}) };
                        }
                      }
                    });
                    return copied;
                  })}
                >
                  {t('checkout.applySameToAll')}
                </button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: item.quantity }, (_, comboIndex) => (
                <div key={comboIndex} className="rounded-2xl border border-cream-200 bg-cream-50/60 p-4 space-y-5">
                  <h4 className="font-semibold text-gray-900">{comboLabel} #{comboIndex + 1}</h4>
                  {lineTargets.map((target) => {
                    const unitsPerCombo = target.unitsPerCombo ?? 1;
                    return (
                      <div key={target.key} className="border-t border-cream-200 pt-4 space-y-4 first:border-t-0 first:pt-0">
                        <h5 className="font-medium text-gray-900">{target.name}</h5>
                        {comboIndex === 0 && target.questionnaire.questions.filter((q) => q.selection_scope === 'line').map((q) => (
                          <Question key={q.code} target={target} unit={null} question={q}/>
                        ))}
                        {Array.from({ length: unitsPerCombo }, (_, componentUnit) => {
                          const answerUnit = comboIndex * unitsPerCombo + componentUnit;
                          return (
                            <div key={componentUnit} className="space-y-4">
                              {unitsPerCombo > 1 && <p className="text-sm font-medium text-gray-700">{target.name} #{componentUnit + 1}</p>}
                              {target.questionnaire.questions.filter((q) => q.selection_scope === 'physical_unit').map((q) => (
                                <Question key={q.code} target={target} unit={answerUnit} question={q}/>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        );
      }

      return lineTargets.map((target) => {
        const physical = target.questionnaire.questions.some((q) => q.selection_scope === 'physical_unit');
        return (
          <section key={target.key} className="border border-cream-200 rounded-2xl p-4 space-y-4">
            <h3 className="font-semibold">{target.name}</h3>
            {physical && target.quantity > 1 && <button type="button" className="text-sm text-forest-700 underline" onClick={() => { const first = answers[answerKey(target, 0)] ?? {}; setAnswers((current) => ({ ...current, ...Object.fromEntries(Array.from({ length: target.quantity }, (_, unit) => [answerKey(target, unit), { ...(current[answerKey(target, unit)] ?? {}), ...first }])) })); }}>{t('checkout.applySameToAll')}</button>}
            {target.questionnaire.questions.filter((q) => q.selection_scope === 'line').map((q) => <Question key={q.code} target={target} unit={null} question={q}/>)}
            {physical && Array.from({ length: target.quantity }, (_, unit) => <div key={unit} className="border-t pt-4 space-y-4"><h4 className="font-medium">{conciseReviewLabel(target, unit, language)}</h4>{target.questionnaire.questions.filter((q) => q.selection_scope === 'physical_unit').map((q) => <Question key={q.code} target={target} unit={unit} question={q}/>)}</div>)}
          </section>
        );
      });
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
  const Review = () => (
    <div className="card p-5 sm:p-8 space-y-5">
      <h2 className="font-semibold text-lg">{t('checkout.reviewTitle')}</h2>
      {cart.items.map((item, index) => {
        const lineKey = `line-${index}`;
        const lineTargets = targets.filter((target) => target.lineKey === lineKey);

        if (item.isCombo && item.comboItems?.length) {
          const comboLabel = language === 'ms' ? 'Kombo' : 'Combo';
          return (
            <section key={index} className="border-b pb-4 space-y-3">
              <p className="text-sm font-semibold text-forest-800">{item.name} × {item.quantity}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: item.quantity }, (_, comboIndex) => (
                  <div key={comboIndex} className="rounded-xl border border-cream-200 bg-cream-50/60 p-4">
                    <h3 className="mb-3 font-semibold text-gray-900">{comboLabel} #{comboIndex + 1}</h3>
                    <div className="space-y-2 text-sm text-gray-600">
                      {item.comboItems!.map((component, componentIndex) => {
                        const componentNumber = componentIndex + 1;
                        const target = lineTargets.find((candidate) => candidate.componentNumber === componentNumber);
                        const unitsPerCombo = target?.unitsPerCombo ?? 1;
                        const quantity = orderedQuantityText(component);

                        if (!target) {
                          return <p key={`${componentNumber}-${component.productId}`}><span className="font-medium text-gray-900">{component.name}</span> — {quantity}</p>;
                        }

                        return (
                          <div key={`${componentNumber}-${component.productId}`} className="space-y-1">
                            {Array.from({ length: unitsPerCombo }, (_, componentUnit) => {
                              const answerUnit = comboIndex * unitsPerCombo + componentUnit;
                              const preparation = reviewText(target, answerUnit) || reviewText(target, null);
                              const unitSuffix = unitsPerCombo > 1 ? ` #${componentUnit + 1}` : '';
                              return <p key={componentUnit}><span className="font-medium text-gray-900">{component.name}{unitSuffix}</span> — {[quantity, preparation].filter(Boolean).join(' · ')}</p>;
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        }

        const target = lineTargets[0];
        const quantity = orderedQuantityText(item);
        const rows = !target ? [] : target.quantity > 1
          ? Array.from({ length: target.quantity }, (_, unit) => ({ label: conciseReviewLabel(target, unit, language), preparation: reviewText(target, unit) }))
          : [{ label: item.name, preparation: reviewText(target, 0) || reviewText(target, null) }];
        return (
          <div key={index} className="border-b pb-3 text-sm text-gray-600">
            {rows.length ? <div className="space-y-1">{rows.map((row, unit) => <p key={unit}><span className="font-medium text-gray-900">{row.label}</span> — {[quantity, row.preparation].filter(Boolean).join(' · ')}</p>)}</div> : <p><span className="font-medium text-gray-900">{item.name}</span> — {quantity}</p>}
          </div>
        );
      })}
      <div className="rounded-xl bg-cream-50 p-4 text-sm"><p className="font-semibold">{details.name}</p><p>{details.houseUnit}, {details.deliveryPointName}</p><p>{details.phone} · {details.email}</p><p>{nextDate(deliveryDay!)} · {config.time}</p></div>
      <Totals/>
      {!priceFinalAtCheckout && <p className="text-xs text-amber-700">{t('checkout.finalPriceAfterWeighing')}</p>}
      <div className="flex gap-3"><button className="btn-secondary flex-1" onClick={() => setStep('preparation')}>{t('checkout.back')}</button><button className="btn-primary flex-1" onClick={() => setStep('payment')}>{t('checkout.continueToPayment')}</button></div>
    </div>
  );
  if (authLoading) return <main className="py-20 text-center">Loading…</main>; if (!user) return <Navigate to="/" replace/>; if (!cart.items.length && !placing && !placementSucceeded.current) return <Navigate to="/cart" replace/>;
  const steps = [['details', t('checkout.yourDetails')], ['preparation', t('checkout.preparation')], ['review', t('checkout.review')], ['payment', t('checkout.payment')]] as const;
  const Payment = () => <div className="card p-5 sm:p-8 space-y-5"><h2 className="font-semibold text-lg">{t('payment.title')}</h2>{priceFinalAtCheckout ? <>{paymentPreviewLoading && <p className="text-sm text-gray-500">{t('payment.loadingQr')}</p>}{paymentPreview && <div className="rounded-2xl border border-forest-200 bg-forest-50/40 p-5 text-center"><p className="text-sm font-semibold text-gray-700 mb-2">{t('payment.amountToPay')}</p><p className="text-3xl font-bold text-forest-800 mb-5">RM{formatCurrency(total)}</p><div className="mx-auto w-fit rounded-2xl bg-white border border-cream-200 p-3 shadow-sm"><img src={paymentQrPublicUrl(paymentPreview.qrStoragePath)} alt="FreshGo DuitNow QR" className="w-64 max-w-full aspect-square object-contain" /></div><p className="mt-4 font-semibold text-forest-800">{t('payment.scanDuitNow')}</p><p className="mt-2 text-sm text-gray-600 leading-relaxed max-w-lg mx-auto">{t('payment.checkoutPayUploadPlace')}</p><div className="mt-5 rounded-xl border border-cream-200 bg-white p-4 text-left"><label className="block text-sm font-semibold text-gray-800 mb-2">{t('payment.uploadPaymentReceipt')}</label><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={receiptUploading || placing} onChange={(event) => { setReceiptFile(event.target.files?.[0] ?? null); setReceiptError(null); setStagedReceipt(null); }} className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-forest-100 file:px-3 file:py-2 file:font-semibold file:text-forest-800"/>{receiptFile && <button type="button" disabled={receiptUploading || placing} onClick={uploadReceipt} className="btn-secondary mt-3 w-full sm:w-auto inline-flex items-center justify-center gap-2"><Upload size={16}/>{receiptUploading ? t('payment.uploadingReceipt') : t('payment.uploadReceipt')}</button>}{stagedReceipt && <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-green-700"><CheckCircle2 size={17}/><span>{t('payment.receiptUploaded')}: {stagedReceipt.fileName}</span></div>}{receiptError && <p className="mt-2 text-sm text-red-600">{receiptError}</p>}</div></div>}{!paymentPreviewLoading && !paymentPreview && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{paymentPreviewError || t('payment.qrUnavailable')}</div>}</> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><Lock size={15} className="inline mr-2"/>{t('payment.weighedOrderInstructions')}</div>}<Totals/><div className="flex gap-3"><button className="btn-secondary flex-1" onClick={() => setStep('review')}>{t('checkout.back')}</button><button disabled={placing || receiptUploading || paymentPreviewLoading || (priceFinalAtCheckout && (!paymentPreview || !stagedReceipt))} className="btn-primary flex-1 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500" onClick={createOrder}>{placing ? t('checkout.placingOrder') : t('checkout.placeOrder', { total: formatCurrency(total) })}</button></div>{placeError && <p className="text-red-600 text-sm">{placeError}</p>}</div>;
  return <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8"><Link to="/cart" className="inline-flex items-center gap-2 text-sm text-gray-500"><ChevronLeft size={16}/>{t('checkout.backToCart')}</Link><h1 className="section-title mt-5">{t('checkout.title')}</h1><div className="flex gap-2 overflow-x-auto py-6">{steps.map(([id, title], i) => <div key={id} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${step === id ? 'bg-forest-700 text-white' : steps.findIndex(([x]) => x === step) > i ? 'bg-jade-100 text-jade-700' : 'bg-cream-100 text-gray-500'}`}>{i + 1}. {title}</div>)}</div><div className="grid lg:grid-cols-3 gap-6"><div className="lg:col-span-2">{step === 'details' && <div className="card p-5 sm:p-8 space-y-5"><div className="flex gap-2 text-sm bg-amber-50 p-3 rounded-xl"><Info size={16}/>{t('checkout.estimatedPricingBody')}</div><h2 className="font-semibold text-lg">{t('delivery.deliveryDetails')}</h2><Field label={t('checkout.fullName')} required error={errors.name}><input className={input(errors.name)} value={details.name} onChange={setField('name')}/></Field><Field label={t('checkout.phoneNumber')} required error={errors.phone}><input className={input(errors.phone)} value={details.phone} onChange={setField('phone')}/></Field><Field label={t('checkout.emailAddress')} required error={errors.email}><input className={input(errors.email)} value={details.email} readOnly/></Field><Field label={t('checkout.unitNumber')} required error={errors.houseUnit}><input className={input(errors.houseUnit)} value={details.houseUnit} onChange={setField('houseUnit')}/></Field><Field label="Delivery method" required><select className={input()} value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value as CanonicalDeliveryMethod)}><option value="normal_bulk">Normal bulk delivery</option><option value="instant_customer_lalamove">Instant delivery (book Lalamove)</option></select></Field>{deliveryMethod === 'normal_bulk' && <><Field label={t('checkout.deliveryPoint')} required error={errors.deliveryPointName}><select className={input(errors.deliveryPointName)} value={details.deliveryPointName} onChange={(e) => setPoint(e.target.value)}><option value="">{t('checkout.selectDeliveryPoint')}</option>{points.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}</select></Field><div><p className="font-semibold text-sm mb-2">{t('delivery.deliveryDay')} *</p><DeliverySlotSelector selected={deliveryDay} onChange={setDeliveryDay}/>{errors.deliveryDay && <p className="text-red-500 text-xs">{errors.deliveryDay}</p>}</div></>}{deliveryMethod === 'instant_customer_lalamove' && <><Field label="Requested delivery date" required error={errors.deliveryDay}><input className={input(errors.deliveryDay)} type="date" value={instantDate} onChange={(e) => setInstantDate(e.target.value)}/></Field><Field label="Requested delivery time" required error={errors.deliveryTime}><input className={input(errors.deliveryTime)} type="time" value={instantTime} onChange={(e) => setInstantTime(e.target.value)}/></Field></>}<Field label={t('checkout.orderNotes')}><textarea className={input()} value={details.notes} onChange={setField('notes')}/></Field><button className="btn-primary w-full" onClick={() => validateDetails() && setStep('preparation')}>{t('checkout.continueToPreparation')} <ChevronRight size={16} className="inline"/></button></div>}{step === 'preparation' && <Preparation/>}{step === 'review' && <Review/>}{step === 'payment' && <Payment/>}</div><aside className="card p-5 h-fit"><h3 className="font-semibold mb-3">{t('checkout.orderSummary')}</h3>{cart.items.map((x, i) => <p key={i} className="text-sm mb-2">{x.name} × {x.quantity}</p>)}<Totals/></aside></div></main>;
}
