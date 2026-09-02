import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Info, Lock, Upload } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useDeliveryConfig } from '../context/DeliveryConfigContext';
import { useLanguage } from '../context/LanguageContext';
import { useWebsiteSettings } from '../context/WebsiteSettingsContext';
import { supabase } from '../lib/supabase';
import { fetchActiveDeliveryPoints, type DeliveryPoint } from '../data/delivery';
import { answerKey, loadPreparationTargets, requiredMissing, type PreparationAnswers, type PreparationLoadFailure, type PreparationQuestion, type PreparationTarget } from '../lib/checkoutPreparation';
import { buildCanonicalPlaceOrderRequest, isBulkDeliveryPointEligible, placeCanonicalOrder, type CanonicalDeliveryMethod } from '../lib/canonicalCheckout';
import DeliverySlotSelector from '../components/ui/DeliverySlotSelector';
import OnboardingTour from '../components/onboarding/OnboardingTour';
import { checkoutTour, paymentReceiptTour } from '../components/onboarding/onboardingTours';
import { formatCurrency } from '../lib/currency';
import { concisePreparationText, conciseReviewLabel, estimatedWholeFishDetails, orderedQuantityText } from '../lib/checkoutReview';
import { getCheckoutPaymentPreview, isPriceFinalAtCheckout, paymentQrPublicUrl, type CheckoutPaymentPreview } from '../lib/checkoutPayment';
import { getUserDisplayName } from '../lib/authProfile';
import { hasCurrentPrivacyConsent } from '../lib/privacyConsent';
import { createBrowserUuid } from '../lib/browserUuid';
import { createGuestAccessToken, ensureGuestAuthIdentity, guestOrderUrl, placeGuestOrder } from '../lib/guestCheckout';
import { guestCaptchaConfigured } from '../lib/guestCheckout';
import GuestCaptchaPanel from '../components/auth/GuestCaptchaPanel';
import type { CustomerDetails, DeliveryDay } from '../types';
import { BULK_DELIVERY_FEE, getMalaysiaDateString, isDeliveryDateAllowed, nextBulkDeliveryDate, nextCustomerDeliveryDate } from '../lib/deliverySlots';

const RECEIPT_FILE_ACCEPT =
  'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf';
type ReceiptSource = 'Files' | 'Camera';

const jsonRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const jsonText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';
const blank: CustomerDetails = { name: '', phone: '', email: '', apartment: '', houseUnit: '', pickupLocation: '', deliveryPointName: '', deliveryMethod: '', notes: '' };
const formatDeliveryDate = (localDate: string, language: 'en' | 'ms') => new Date(`${localDate}T12:00:00+08:00`).toLocaleDateString(
  language === 'ms' ? 'ms-MY' : 'en-MY',
  { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kuala_Lumpur' },
);
const Field = ({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) => {
  const id = useId();
  const control = isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children;
  return <div><label htmlFor={id} className="block text-sm font-semibold text-gray-700 mb-1.5">{label}{required && ' *'}</label>{control}{error && <p className="mt-1 text-xs text-red-500">{error}</p>}</div>;
};

export default function CheckoutPage() {
  const { cart, subtotal, clearCart } = useCart(); const { user, loading: authLoading } = useAuth(); const { config } = useDeliveryConfig(); const { t, language } = useLanguage(); const { settings } = useWebsiteSettings(); const navigate = useNavigate();
  const [consentChecking, setConsentChecking] = useState(true);
  const [guestIdentityReady, setGuestIdentityReady] = useState(false);
  const cartDayIsBulk = cart.deliveryDay ? ['wednesday', 'friday'].includes(cart.deliveryDay.toLowerCase()) : false;
  const [details, setDetails] = useState(blank); const [points, setPoints] = useState<DeliveryPoint[]>([]); const [deliveryDay, setDeliveryDay] = useState<DeliveryDay | null>(cart.deliveryDay); const [errors, setErrors] = useState<Record<string, string>>({});
  const [deliveryMethod, setDeliveryMethod] = useState<CanonicalDeliveryMethod>(cart.deliveryDay && !cartDayIsBulk ? 'instant_customer_lalamove' : 'normal_bulk'); const [instantDate, setInstantDate] = useState(() => cart.deliveryDay && !cartDayIsBulk ? nextCustomerDeliveryDate(cart.deliveryDay) : ''); const [instantTime, setInstantTime] = useState('');
  const [step, setStep] = useState<'details' | 'preparation' | 'review' | 'payment'>('details'); const [targets, setTargets] = useState<PreparationTarget[]>([]); const [answers, setAnswers] = useState<PreparationAnswers>({}); const [prepLoading, setPrepLoading] = useState(true); const [prepError, setPrepError] = useState<string | null>(null); const [prepLoadFailures, setPrepLoadFailures] = useState<PreparationLoadFailure[]>([]); const [placing, setPlacing] = useState(false); const [placeError, setPlaceError] = useState<string | null>(null);
  const [paymentPreview, setPaymentPreview] = useState<CheckoutPaymentPreview | null>(null); const [paymentPreviewLoading, setPaymentPreviewLoading] = useState(false); const [paymentPreviewError, setPaymentPreviewError] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptSource, setReceiptSource] = useState<ReceiptSource | null>(null);
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
  const guestAccessToken = useRef<string | null>(null);
  const isGuestCheckout = !user || user.is_anonymous === true;
  const guestCaptchaPending = guestCaptchaConfigured && !user && !guestIdentityReady;
  const selectedPoint = points.find((p) => p.name === details.deliveryPointName);
  const bulkPoints = points.filter((point) => isBulkDeliveryPointEligible(`${point.name} ${point.area ?? ''}`));
  const isExternalDelivery = deliveryMethod === 'instant_customer_lalamove';
  const fee = isExternalDelivery ? 0 : BULK_DELIVERY_FEE;
  const total = subtotal + fee;
  const requestedDeliveryDate = isExternalDelivery
    ? instantDate
    : deliveryDay ? nextBulkDeliveryDate(deliveryDay) : '';
  const input = (e?: string) => `w-full bg-cream-50 border rounded-2xl px-4 py-3 text-sm ${e ? 'border-red-300 bg-red-50' : 'border-cream-300'}`;
  const priceFinalAtCheckout = isPriceFinalAtCheckout(cart.items);
  useEffect(() => {
    const fallbackPoints: DeliveryPoint[] = config.pickupLocations.map((name, index) => ({
      id: -(index + 1),
      name,
      area: null,
      delivery_fee: BULK_DELIVERY_FEE,
      delivery_method: 'Customer Come Down',
      display_order: index + 1,
      active: true,
      pickup_notes: null,
      latitude: null,
      longitude: null,
    }));
    fetchActiveDeliveryPoints()
      .then((activePoints) => setPoints(activePoints.length > 0 ? activePoints : fallbackPoints))
      .catch(() => setPoints(fallbackPoints));
  }, [config.pickupLocations]);
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.is_anonymous === true) { setConsentChecking(false); return; }
    let cancelled = false;
    void hasCurrentPrivacyConsent()
      .then((complete) => {
        if (!cancelled && !complete) navigate('/privacy-consent', { replace: true, state: { returnTo: '/checkout' } });
      })
      .catch(() => {
        if (!cancelled) navigate('/privacy-consent', { replace: true, state: { returnTo: '/checkout' } });
      })
      .finally(() => { if (!cancelled) setConsentChecking(false); });
    return () => { cancelled = true; };
  }, [authLoading, user, navigate]);
useEffect(() => {
  if (!user || user.is_anonymous === true) return;

  let cancelled = false;

  const registrationName = getUserDisplayName(user);

  const loadSavedCheckoutDetails = async () => {
    setDetails((current) => ({
      ...current,
      email: user.email ?? '',
      name: current.name || registrationName,
    }));

    const [{ data: profile }, { data: latestOrder }] = await Promise.all([
      supabase
        .from('customer_profiles')
        .select('full_name, phone, apartment, house_unit, pickup_location, last_delivery_method')
        .eq('id', user.id)
        .maybeSingle(),

      supabase
        .from('sales_orders')
        .select('customer_snapshot, delivery_snapshot')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (cancelled) return;

    const customerSnapshot = jsonRecord(latestOrder?.customer_snapshot);
    const deliverySnapshot = jsonRecord(latestOrder?.delivery_snapshot);

    const previousName = jsonText(customerSnapshot.name);
    const previousPhone = jsonText(customerSnapshot.phone);
    const previousApartment = jsonText(deliverySnapshot.apartment);
    const previousHouseUnit = jsonText(deliverySnapshot.house_unit);
    const previousDeliveryPoint =
      jsonText(deliverySnapshot.delivery_point_name) ||
      jsonText(deliverySnapshot.pickup_location);

    const previousDeliveryMethod = jsonText(deliverySnapshot.method_code);

    const savedDeliveryMethod =
      profile?.last_delivery_method ||
      previousDeliveryMethod;

    if (!cart.deliveryDay && (
      savedDeliveryMethod === 'normal_bulk' ||
      savedDeliveryMethod === 'instant_customer_lalamove'
    )) {
      setDeliveryMethod(savedDeliveryMethod);
    }

    setDetails((current) => ({
      ...current,
      name:
        profile?.full_name ||
        previousName ||
        registrationName ||
        current.name,
      phone:
        profile?.phone ||
        previousPhone ||
        current.phone,
      apartment:
        profile?.apartment ||
        previousApartment ||
        current.apartment,
      houseUnit:
        profile?.house_unit ||
        previousHouseUnit ||
        current.houseUnit,
      pickupLocation:
        profile?.pickup_location ||
        previousDeliveryPoint ||
        current.pickupLocation,
      deliveryPointName:
        profile?.pickup_location ||
        previousDeliveryPoint ||
        current.deliveryPointName,
    }));
  };

  void loadSavedCheckoutDetails();

  return () => {
    cancelled = true;
  };
}, [user, cart.deliveryDay]);

useEffect(() => {
  let mounted = true;

  setPrepLoading(true);
  setPrepError(null);
  setPrepLoadFailures([]);

  loadPreparationTargets(cart.items)
    .then(({ targets: loadedTargets, failures }) => {
      if (!mounted) return;

      setTargets(loadedTargets);
      setPrepLoadFailures(failures);
    })
    .catch(() => {
      if (!mounted) return;

      setTargets([]);
      setPrepLoadFailures([{ productId: '', name: '', error: new Error(t('checkout.preparationLoadError')) }]);
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
    if (guestCaptchaPending) {
      setPaymentPreviewLoading(false);
      return () => { mounted = false; };
    }
    setPaymentPreviewLoading(true);
    setPaymentPreviewError(null);
    void (async () => {
      try {
        // The payment-configuration RPC is available to authenticated users.
        // Establish the guest session before requesting a QR; otherwise a true
        // guest reaches this screen as the anonymous database role.
        if (isGuestCheckout) await ensureGuestAuthIdentity();
        const preview = await getCheckoutPaymentPreview();
        if (mounted) setPaymentPreview(preview);
      } catch {
        if (mounted) {
          setPaymentPreview(null);
          setPaymentPreviewError(t('payment.qrUnavailable'));
        }
      } finally {
        if (mounted) setPaymentPreviewLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [step, priceFinalAtCheckout, t, isGuestCheckout, guestCaptchaPending]);
  const display = (x: { label: string; label_ms: string }) => language === 'ms' && x.label_ms ? x.label_ms : x.label;
  const reviewText = (target: PreparationTarget, unit: number | null) =>
    concisePreparationText(target, answers, unit, language);
  const setField = (field: keyof CustomerDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setDetails((x) => ({ ...x, [field]: e.target.value })); setErrors((x) => ({ ...x, [field]: '' })); };
  const setPoint = (name: string) => { const p = points.find((x) => x.name === name); setDetails((x) => ({ ...x, pickupLocation: name, deliveryPointName: name, deliveryMethod: p?.delivery_method ?? '' })); };
  const setAnswer = (target: PreparationTarget, unit: number | null, question: PreparationQuestion, value: unknown) => setAnswers((x) => ({ ...x, [answerKey(target, unit)]: { ...(x[answerKey(target, unit)] ?? {}), [question.code]: value } }));
  const validateDetails = () => {
    const e: Record<string, string> = {};
    if (!details.name.trim()) e.name = t('checkout.validation.fullNameRequired');
    if (!/^((\+?60)|0)\d{8,10}$/.test(details.phone.replace(/\s/g, ''))) e.phone = t('checkout.validation.phoneInvalid');
    if (details.email.trim() && !details.email.includes('@')) e.email = t('checkout.validation.emailInvalid');
    if (!isGuestCheckout && !details.email.includes('@')) e.email = t('checkout.validation.emailInvalid');
    if (!details.houseUnit.trim()) e.houseUnit = t('checkout.validation.unitRequired');
    if (!isExternalDelivery && !details.deliveryPointName) e.deliveryPointName = t('checkout.validation.deliveryPointRequired');
    if (!isExternalDelivery && !deliveryDay) e.deliveryDay = t('checkout.validation.deliveryDayRequired');
    if (isExternalDelivery && !details.apartment.trim()) e.apartment = t('checkout.validation.fullAddressRequired');
    if (isExternalDelivery && !instantDate) e.deliveryDay = t('checkout.validation.deliveryDayRequired');
    else if (isExternalDelivery && (instantDate < getMalaysiaDateString() || !isDeliveryDateAllowed(instantDate))) e.deliveryDay = t('checkout.validation.deliveryDateUnavailable');
    if (isExternalDelivery && !instantTime) e.deliveryTime = t('checkout.validation.deliveryTimeRequired');
    else if (isExternalDelivery && (instantTime < '09:00' || instantTime > '16:00')) e.deliveryTime = t('checkout.validation.deliveryTimeUnavailable');
    setErrors(e);
    return !Object.keys(e).length;
  };
  const ensureCheckoutAttemptKey = () => {
    const key = checkoutAttemptKey.current ?? createBrowserUuid();
    checkoutAttemptKey.current = key;
    return key;
  };
  const uploadReceipt = async () => {
    if (!receiptFile || !paymentPreview) return;
    setReceiptUploading(true); setReceiptError(null);
    const previousPath = stagedReceipt?.storagePath ?? null;
    let uploadedPath: string | null = null;
    try {
      const allowedTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
      const extension = allowedTypes[receiptFile.type];
      if (!extension) throw new Error(t('payment.receiptTypeError'));
      if (receiptFile.size <= 0 || receiptFile.size > 5 * 1024 * 1024) throw new Error(t('payment.receiptSizeError'));
      const identityId = isGuestCheckout ? await ensureGuestAuthIdentity() : user!.id;
      const idempotencyKey = ensureCheckoutAttemptKey();
      uploadedPath = `staging/${identityId}/${idempotencyKey}/${createBrowserUuid()}.${extension}`;
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
      setReceiptFile(null);
      setReceiptSource(null);
      setStagedReceipt(null);
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
      const token = isGuestCheckout
        ? (guestAccessToken.current ?? createGuestAccessToken())
        : null;
      if (token) guestAccessToken.current = token;
      const order = token
        ? await placeGuestOrder(request, token)
        : await placeCanonicalOrder(request);
      checkoutAttemptKey.current = null;
if (!isGuestCheckout) {
const { error: profileSaveError } = await supabase
  .from('customer_profiles')
  .upsert({
    id: user!.id,
    email_address: user!.email,
    full_name: details.name,
    phone: details.phone,
    apartment: details.apartment,
    house_unit: details.houseUnit,
    pickup_location: details.pickupLocation,
    last_delivery_method: deliveryMethod,
    notes: details.notes || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

if (profileSaveError) {
  console.warn('Unable to save checkout preferences:', profileSaveError);
}
}
      placementSucceeded.current = true;
      if (token) {
        navigate(guestOrderUrl(order.order_number, token), { replace: true });
      } else {
        navigate(`/order/${order.order_number}`, { replace: true });
      }
      clearCart();
    } catch (err) { setPlaceError(err instanceof Error ? err.message : t('checkout.validation.failedToPlaceOrder')); }
    finally { placementLock.current = false; setPlacing(false); }
  };
  const Question = ({ target, unit, question }: { target: PreparationTarget; unit: number | null; question: PreparationQuestion }) => { const value = answers[answerKey(target, unit)]?.[question.code]; if (question.answer_type === 'boolean') return <fieldset><legend className="text-sm font-medium">{display(question)}{question.required && ' *'}</legend><div className="mt-2 flex gap-3"><button type="button" onClick={() => setAnswer(target, unit, question, true)} className={`rounded-xl px-4 py-2 text-sm ${value === true ? 'bg-forest-700 text-white' : 'bg-cream-100'}`}>{t('checkout.yes')}</button><button type="button" onClick={() => setAnswer(target, unit, question, false)} className={`rounded-xl px-4 py-2 text-sm ${value === false ? 'bg-forest-700 text-white' : 'bg-cream-100'}`}>{t('checkout.no')}</button></div></fieldset>; if (question.answer_type === 'single_select') return <Field label={`${display(question)}${question.required ? ' *' : ''}`}><select className={input()} value={String(value ?? '')} onChange={(e) => setAnswer(target, unit, question, e.target.value)}><option value="">{t('checkout.selectOption')}</option>{question.options.map((o) => <option key={o.code} value={o.code}>{display(o)}</option>)}</select></Field>; return <Field label={`${display(question)}${question.required ? ' *' : ''}`}><input className={input()} value={String(value ?? '')} onChange={(e) => setAnswer(target, unit, question, e.target.value)} /></Field>; };
  const Totals = () => <div className="border-t pt-3 space-y-1 text-sm">
    <p className="flex justify-between"><span>{priceFinalAtCheckout ? t('checkout.subtotal') : t('checkout.estimatedSubtotal')}</span><span>RM{formatCurrency(subtotal)}</span></p>
    <p data-onboarding="checkout-delivery-fee" className="flex justify-between gap-3"><span>{t('checkout.delivery')}</span><span className="text-right">{isExternalDelivery ? t('checkout.externalCourierFeePending') : `RM${formatCurrency(fee)}`}</span></p>
    <p className="flex justify-between gap-3 font-bold"><span>{isExternalDelivery ? t('checkout.totalExcludingCourier') : priceFinalAtCheckout ? t('checkout.total') : t('checkout.estimatedTotal')}</span><span>RM{formatCurrency(total)}</span></p>
  </div>;
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
                  {item.comboItems!.map((component, componentIndex) => {
                    const componentNumber = componentIndex + 1;
                    const target = lineTargets.find((candidate) => candidate.componentNumber === componentNumber);
                    if (!target) return null;

                    const unitsPerCombo = target.unitsPerCombo ?? 1;
                    return (
                      <div key={`${comboIndex}-${componentNumber}-${target.key}`} className="border-t border-cream-200 pt-4 space-y-4 first:border-t-0 first:pt-0">
                        <h5 className="font-medium text-gray-900">{component.name}</h5>
                        {target.questionnaire.questions.filter((q) => q.selection_scope === 'line').map((q) => (
                          <Question key={q.code} target={target} unit={null} question={q}/>
                        ))}
                        {Array.from({ length: unitsPerCombo }, (_, componentUnit) => {
                          const answerUnit = comboIndex * unitsPerCombo + componentUnit;
                          return (
                            <div key={`${comboIndex}-${componentNumber}-${componentUnit}`} className="space-y-4">
                              {unitsPerCombo > 1 && <p className="text-sm font-medium text-gray-700">{component.name} #{componentUnit + 1}</p>}
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

    {prepLoadFailures.length > 0 && (
      <p className="text-sm text-red-600">
        {t('checkout.preparationPartialLoadError', { items: prepLoadFailures.filter((failure) => failure.name).map((failure) => failure.name).join(', ') || t('checkout.preparationLoadError') })}
      </p>
    )}

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
        disabled={prepLoading}
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
        const estimatedWholeFish = estimatedWholeFishDetails(item);
        const rows = !target ? [] : target.quantity > 1
          ? Array.from({ length: target.quantity }, (_, unit) => ({ label: conciseReviewLabel(target, unit, language), preparation: reviewText(target, unit), estimate: estimatedWholeFish }))
          : [{ label: item.name, preparation: reviewText(target, 0) || reviewText(target, null), estimate: estimatedWholeFish }];
        return (
          <div key={index} className="border-b pb-3 text-sm text-gray-600">
            {rows.length ? <div className="space-y-1">{rows.map((row, unit) => <p key={unit}><span className="font-medium text-gray-900">{row.label}</span> — {[row.estimate ? t('checkout.estimatedWeightLabel', { weight: `${Number(row.estimate.weightKg.toFixed(3))}kg` }) : quantity, row.estimate ? t('checkout.estimatedPriceLabel', { price: formatCurrency(row.estimate.estimatedPrice) }) : '', row.preparation].filter(Boolean).join(' · ')}</p>)}</div> : <p><span className="font-medium text-gray-900">{item.name}</span> — {quantity}</p>}
          </div>
        );
      })}
      <div className="rounded-xl bg-cream-50 p-4 text-sm"><p className="font-semibold">{details.name}</p><p>{details.houseUnit}, {isExternalDelivery ? details.apartment : details.deliveryPointName}</p><p>{details.phone} · {details.email}</p><p>{requestedDeliveryDate ? formatDeliveryDate(requestedDeliveryDate, language) : ''} · {isExternalDelivery ? instantTime : config.time}</p><p className="mt-1 font-medium text-forest-700">{isExternalDelivery ? t('checkout.externalCourierReview') : t('checkout.bulkDeliveryReview')}</p></div>
      <Totals/>
      {!priceFinalAtCheckout && <p className="text-xs text-amber-700">{t('checkout.finalPriceAfterWeighing')}</p>}
      <div className="flex gap-3"><button className="btn-secondary flex-1" onClick={() => setStep('preparation')}>{t('checkout.back')}</button><button className="btn-primary flex-1" onClick={() => setStep('payment')}>{t('checkout.continueToPayment')}</button></div>
    </div>
  );
  if (authLoading || consentChecking) return <main className="py-20 text-center">Loading…</main>; if (!cart.items.length && !placing && !placementSucceeded.current) return <Navigate to="/cart" replace/>;
  const steps = [['details', t('checkout.yourDetails')], ['preparation', t('checkout.preparation')], ['review', t('checkout.review')], ['payment', t('checkout.payment')]] as const;
  const selectReceiptFile = (file: File, source: ReceiptSource) => {
    setReceiptFile(file);
    setReceiptSource(source);
    setReceiptError(null);
    setStagedReceipt(null);
  };
  const captureReceiptFile = (event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const source: ReceiptSource = input.dataset.receiptSource === 'camera' ? 'Camera' : 'Files';
    selectReceiptFile(file, source);
    input.value = '';
  };
  const changeReceipt = () => {
    setReceiptFile(null);
    setReceiptSource(null);
    setStagedReceipt(null);
    setReceiptError(null);
  };
  const receiptPickerDisabled = receiptUploading || placing;
  const receiptPickerClassName = `inline-flex cursor-pointer items-center justify-center rounded-lg bg-forest-700 px-3 py-2 text-sm font-semibold text-white hover:bg-forest-800 ${receiptPickerDisabled ? 'pointer-events-none cursor-not-allowed opacity-50' : ''}`;
  const receiptPicker = (
    <div className="flex flex-wrap gap-3">
      {!receiptFile ? (
        <>
          <p className="w-full text-sm text-gray-600">Choose one method for your receipt.</p>
          <input
            id="checkout-payment-receipt-file"
            data-receipt-source="files"
            type="file"
            accept={RECEIPT_FILE_ACCEPT}
            disabled={receiptPickerDisabled}
            onInput={captureReceiptFile}
            onChange={captureReceiptFile}
            className="sr-only"
          />
          <label
            data-onboarding="payment-gallery"
            htmlFor="checkout-payment-receipt-file"
            aria-disabled={receiptPickerDisabled}
            className={receiptPickerClassName}
          >
            Choose file
          </label>

          <input
            id="checkout-payment-receipt-camera"
            data-receipt-source="camera"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={receiptPickerDisabled}
            onInput={captureReceiptFile}
            onChange={captureReceiptFile}
            className="sr-only"
          />
          <label
            data-onboarding="payment-camera"
            htmlFor="checkout-payment-receipt-camera"
            aria-disabled={receiptPickerDisabled}
            className={receiptPickerClassName}
          >
            Use camera
          </label>
        </>
      ) : (
        <>
          <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <p className="font-semibold">File selected</p>
            <p className="mt-1 break-all text-xs text-green-700">{receiptFile.name}</p>
            {receiptSource && <p className="mt-1 text-xs text-green-700">Source: {receiptSource}</p>}
          </div>
          <button
            type="button"
            disabled={receiptPickerDisabled}
            onClick={changeReceipt}
            className="btn-secondary w-full sm:w-auto"
          >
            Change receipt
          </button>
        </>
      )}
    </div>
  );
  const deliveryDetailsFields = (
    <>
      <fieldset>
        <legend className="mb-2 block text-sm font-semibold text-gray-700">{t('checkout.deliveryMethodTitle')} *</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`cursor-pointer rounded-2xl border-2 p-4 transition-colors ${!isExternalDelivery ? 'border-forest-700 bg-forest-50' : 'border-cream-300 bg-white'}`}>
            <input type="radio" name="delivery-method" value="normal_bulk" checked={!isExternalDelivery} onChange={() => { setDeliveryMethod('normal_bulk'); if (deliveryDay && !['wednesday', 'friday'].includes(deliveryDay.toLowerCase())) setDeliveryDay(null); setErrors((current) => ({ ...current, apartment: '', deliveryDay: '', deliveryTime: '' })); }} className="sr-only" />
            <span className="block text-sm font-bold text-forest-900">{t('checkout.bulkDeliveryTitle')}</span>
            <span className="mt-1 block text-xs leading-5 text-gray-600">{t('checkout.bulkDeliveryDescription')}</span>
          </label>
          <label className={`cursor-pointer rounded-2xl border-2 p-4 transition-colors ${isExternalDelivery ? 'border-forest-700 bg-forest-50' : 'border-cream-300 bg-white'}`}>
            <input type="radio" name="delivery-method" value="instant_customer_lalamove" checked={isExternalDelivery} onChange={() => { setDeliveryMethod('instant_customer_lalamove'); if (!instantDate && deliveryDay) setInstantDate(nextCustomerDeliveryDate(deliveryDay)); setErrors((current) => ({ ...current, deliveryPointName: '', deliveryDay: '' })); }} className="sr-only" />
            <span className="block text-sm font-bold text-forest-900">{t('checkout.externalDeliveryTitle')}</span>
            <span className="mt-1 block text-xs leading-5 text-gray-600">{t('checkout.externalDeliveryDescription')}</span>
          </label>
        </div>
      </fieldset>

      {!isExternalDelivery ? <>
        <Field label={t('checkout.deliveryPoint')} required error={errors.deliveryPointName}>
          <select className={input(errors.deliveryPointName)} value={details.deliveryPointName} onChange={(event) => setPoint(event.target.value)}>
            <option value="">{t('checkout.selectDeliveryPoint')}</option>
            {bulkPoints.map((point) => <option key={point.id} value={point.name}>{point.name}{point.area && !point.name.toLowerCase().includes(point.area.toLowerCase().replace('residensi ', '')) ? ` · ${point.area}` : ''}</option>)}
          </select>
        </Field>
        {selectedPoint?.pickup_notes && <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><Info size={16} className="mt-0.5 shrink-0"/><span>{selectedPoint.pickup_notes}</span></div>}
        <div>
          <p className="mb-2 text-sm font-semibold">{t('delivery.deliveryDay')} *</p>
          <DeliverySlotSelector selected={deliveryDay} onChange={setDeliveryDay} scope="bulk"/>
          {errors.deliveryDay && <p className="mt-1 text-xs text-red-500">{errors.deliveryDay}</p>}
        </div>
      </> : <>
        <Field label={t('checkout.fullDeliveryAddress')} required error={errors.apartment}>
          <textarea className={input(errors.apartment)} value={details.apartment} onChange={setField('apartment')} rows={3} autoComplete="street-address" placeholder={t('checkout.fullDeliveryAddressPlaceholder')} />
        </Field>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{t('checkout.externalCourierNotice')}</div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t('checkout.requestedDeliveryDate')} *</p>
          <DeliverySlotSelector
            selected={deliveryDay}
            selectedDate={instantDate}
            scope="external"
            onChange={(day, localDate) => { setDeliveryDay(day); setInstantDate(localDate); setErrors((current) => ({ ...current, deliveryDay: '' })); }}
          />
          {errors.deliveryDay && <p className="mt-1 text-xs text-red-500">{errors.deliveryDay}</p>}
        </div>
        <p className="-mt-3 text-xs text-gray-500">{t('checkout.mondayClosed')}</p>
        <Field label={t('checkout.requestedDeliveryTime')} required error={errors.deliveryTime}>
          <input className={input(errors.deliveryTime)} type="time" min="09:00" max="16:00" value={instantTime} onChange={(event) => { setInstantTime(event.target.value); setErrors((current) => ({ ...current, deliveryTime: '' })); }} />
        </Field>
        <p className="-mt-3 text-xs text-gray-500">{t('checkout.externalDeliveryWindow')}</p>
      </>}
    </>
  );
  const payment = <div className="card min-w-0 max-w-full p-5 sm:p-8 space-y-5"><h2 className="font-semibold text-lg">{t('payment.title')}</h2>{guestCaptchaPending && <GuestCaptchaPanel onVerified={() => { setGuestIdentityReady(true); setPlaceError(null); setReceiptError(null); }}/>} {priceFinalAtCheckout ? <>{paymentPreviewLoading && <p className="text-sm text-gray-500">{t('payment.loadingQr')}</p>}{paymentPreview && <div className="rounded-2xl border border-forest-200 bg-forest-50/40 p-5 text-center"><p className="text-sm font-semibold text-gray-700 mb-2">{t('payment.amountToPay')}</p><p data-onboarding="payment-amount" className="text-3xl font-bold text-forest-800 mb-5">RM{formatCurrency(total)}</p><div className="mx-auto w-fit rounded-2xl bg-white border border-cream-200 p-3 shadow-sm"><img src={paymentQrPublicUrl(paymentPreview.qrStoragePath)} alt="FreshGo DuitNow QR" className="w-64 max-w-full aspect-square object-contain" /></div><p className="mt-4 font-semibold text-forest-800">{t('payment.scanDuitNow')}</p><p className="mt-2 text-sm text-gray-600 leading-relaxed max-w-lg mx-auto">{t('payment.checkoutPayUploadPlace')}</p><div data-onboarding="payment-submit" className="mt-5 min-w-0 max-w-full rounded-xl border border-cream-200 bg-white p-4 text-left"><label className="block text-sm font-semibold text-gray-800 mb-2">{t('payment.uploadPaymentReceipt')}</label>{receiptPicker}{receiptFile && <button type="button" disabled={receiptUploading || placing || guestCaptchaPending} onClick={uploadReceipt} className="btn-secondary mt-3 w-full sm:w-auto inline-flex items-center justify-center gap-2"><Upload size={16}/>{receiptUploading ? t('payment.uploadingReceipt') : t('payment.uploadReceipt')}</button>}{stagedReceipt && <div className="mt-3 flex min-w-0 items-start gap-2 text-sm font-semibold text-green-700"><CheckCircle2 size={17} className="mt-0.5 shrink-0"/><span className="min-w-0 break-all">{t('payment.receiptUploaded')}: {stagedReceipt.fileName}</span></div>}{receiptError && <p className="mt-2 text-sm text-red-600">{receiptError}</p>}</div></div>}{!guestCaptchaPending && !paymentPreviewLoading && !paymentPreview && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{paymentPreviewError || t('payment.qrUnavailable')}</div>}</> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><Lock size={15} className="inline mr-2"/>{t('payment.weighedOrderInstructions')}</div>}<Totals/><div className="flex min-w-0 gap-3"><button className="btn-secondary min-w-0 flex-1" onClick={() => setStep('review')}>{t('checkout.back')}</button><button disabled={placing || receiptUploading || paymentPreviewLoading || guestCaptchaPending || (priceFinalAtCheckout && (!paymentPreview || !stagedReceipt))} className="btn-primary min-w-0 flex-1 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500" onClick={createOrder}>{placing ? t('checkout.placingOrder') : t('checkout.placeOrder', { total: formatCurrency(total) })}</button></div>{placeError && <p className="text-red-600 text-sm">{placeError}</p>}</div>;
  return <main className="w-full min-w-0 max-w-5xl mx-auto px-4 sm:px-6 py-8"><Link to="/cart" className="inline-flex items-center gap-2 text-sm text-gray-500"><ChevronLeft size={16}/>{t('checkout.backToCart')}</Link><h1 className="section-title mt-5">{isGuestCheckout ? 'Guest Checkout' : t('checkout.title')}</h1>{isGuestCheckout && <p className="mt-2 text-sm text-gray-600">No account needed. We’ll give you a private link for payment and delivery tracking.</p>}<div className="flex gap-2 overflow-x-auto py-6">{steps.map(([id, title], i) => <div key={id} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${step === id ? 'bg-forest-700 text-white' : steps.findIndex(([x]) => x === step) > i ? 'bg-jade-100 text-jade-700' : 'bg-cream-100 text-gray-500'}`}>{i + 1}. {title}</div>)}</div><div className="grid min-w-0 grid-cols-1 lg:grid-cols-3 gap-6"><div className="min-w-0 lg:col-span-2">{step === 'details' && <div data-onboarding="checkout-address" className="card p-5 sm:p-8 space-y-5"><div className="flex gap-2 text-sm bg-amber-50 p-3 rounded-xl"><Info size={16}/>{t('checkout.estimatedPricingBody')}</div><h2 className="font-semibold text-lg">{t('delivery.deliveryDetails')}</h2><Field label={t('checkout.fullName')} required error={errors.name}><input className={input(errors.name)} value={details.name} onChange={setField('name')} autoComplete="name"/></Field><Field label={t('checkout.phoneNumber')} required error={errors.phone}><input className={input(errors.phone)} value={details.phone} onChange={setField('phone')} inputMode="tel" autoComplete="tel"/></Field><Field label={`${t('checkout.emailAddress')}${isGuestCheckout ? ' (optional)' : ''}`} required={!isGuestCheckout} error={errors.email}><input className={input(errors.email)} type="email" value={details.email} readOnly={!isGuestCheckout} onChange={setField('email')} autoComplete="email"/></Field><Field label={t('checkout.unitNumber')} required error={errors.houseUnit}><input className={input(errors.houseUnit)} value={details.houseUnit} onChange={setField('houseUnit')} autoComplete="address-line2"/></Field>{deliveryDetailsFields}<Field label={t('checkout.orderNotes')}><textarea className={input()} value={details.notes} onChange={setField('notes')}/></Field><button data-onboarding="checkout-next" className="btn-primary w-full" onClick={() => validateDetails() && setStep('preparation')}>{t('checkout.continueToPreparation')} <ChevronRight size={16} className="inline"/></button></div>}{step === 'preparation' && <Preparation/>}{step === 'review' && <Review/>}{step === 'payment' && payment}</div><aside data-onboarding="checkout-summary" className="card min-w-0 p-5 h-fit"><h3 className="font-semibold mb-3">{t('checkout.orderSummary')}</h3>{cart.items.map((x, i) => <p key={i} className="text-sm mb-2">{x.name} × {x.quantity}</p>)}<Totals/></aside></div><OnboardingTour page="checkout" steps={checkoutTour(language)} enabled={step === 'details'} /><OnboardingTour page="payment-receipt" steps={paymentReceiptTour(language, 'upload')} enabled={step === 'payment'} /></main>;
}
