import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, LocateFixed, Loader2, MapPin, Truck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import { createBrowserUuid } from '../../lib/browserUuid';
import { isJalanZamrudUtamaAddress, searchMalaysiaAddresses, resolveMalaysiaAddress, reverseGeocodeMalaysiaAddress, type AddressSuggestion, type SelectedDeliveryAddress } from '../../lib/addressSearch';
import { clearDeliveryAddressPrefill, saveDeliveryAddressPrefill } from '../../lib/deliveryAddressPrefill';
import { ensureGuestAuthIdentity, guestCaptchaConfigured } from '../../lib/guestCheckout';
import { requestLalamoveQuote, type LalamoveQuote } from '../../lib/lalamoveQuote';
import { formatCurrency } from '../../lib/currency';
import type { DeliveryDay } from '../../types';
import DeliverySlotSelector from '../ui/DeliverySlotSelector';
import GuestCaptchaPanel from '../auth/GuestCaptchaPanel';

export default function DeliveryFeeChecker() {
  const { user } = useAuth();
  const { itemCount } = useCart();
  const { t, language } = useLanguage();
  const addressInputId = useId();
  const unitInputId = useId();
  const timeInputId = useId();
  const addressSessionToken = useRef(createBrowserUuid());
  const addressSearchSequence = useRef(0);
  const quoteRequestLock = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [guestIdentityReady, setGuestIdentityReady] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [selectedAddress, setSelectedAddress] = useState<SelectedDeliveryAddress | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [quotePanelOpen, setQuotePanelOpen] = useState(false);
  const [unit, setUnit] = useState('');
  const [deliveryDay, setDeliveryDay] = useState<DeliveryDay | null>(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [quote, setQuote] = useState<LalamoveQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const guestCaptchaPending = guestCaptchaConfigured && !user && !guestIdentityReady;
  const isCommunityEligible = selectedAddress
    ? isJalanZamrudUtamaAddress(selectedAddress.display_address, selectedAddress.place_label)
    : false;
  const startShoppingHref = itemCount > 0 ? '/checkout' : '/shop';
  const startShoppingLabel = itemCount > 0
    ? t('homepage.deliveryFeeChecker.checkout')
    : t('homepage.deliveryFeeChecker.shop');

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    const query = addressQuery.trim();
    const sequence = ++addressSearchSequence.current;
    if (!isOpen || guestCaptchaPending || query.length < 3 || selectedAddress?.display_address === query) {
      setSuggestions([]);
      setAddressLoading(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setAddressLoading(true);
      setAddressError(null);
      void (async () => {
        try {
          if (!user) await ensureGuestAuthIdentity();
          const nextSuggestions = await searchMalaysiaAddresses(query, addressSessionToken.current, language);
          if (addressSearchSequence.current === sequence) setSuggestions(nextSuggestions);
        } catch {
          if (addressSearchSequence.current === sequence) {
            setSuggestions([]);
            setAddressError(t('checkout.addressSearchUnavailable'));
          }
        } finally {
          if (addressSearchSequence.current === sequence) setAddressLoading(false);
        }
      })();
    }, 320);

    return () => window.clearTimeout(timeout);
  }, [addressQuery, guestCaptchaPending, isOpen, language, selectedAddress?.display_address, t, user]);

  useEffect(() => {
    if (!quote) return undefined;
    const remaining = new Date(quote.expiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      setQuote(null);
      return undefined;
    }
    const timeout = window.setTimeout(() => setQuote(null), remaining);
    return () => window.clearTimeout(timeout);
  }, [quote]);

  const closeChecker = () => setIsOpen(false);

  const updateAddressQuery = (value: string) => {
    setAddressQuery(value);
    setSelectedAddress(null);
    clearDeliveryAddressPrefill();
    setSuggestions([]);
    setAddressError(null);
    setQuote(null);
    setQuoteError(null);
  };

  const chooseSuggestion = async (suggestion: AddressSuggestion) => {
    setAddressLoading(true);
    setAddressError(null);
    try {
      if (!user) await ensureGuestAuthIdentity();
      const address = await resolveMalaysiaAddress(suggestion.placeId, addressSessionToken.current, language);
      addressSessionToken.current = createBrowserUuid();
      const selectedAddressWithPlaceLabel = { ...address, place_label: suggestion.displayAddress };
      setSelectedAddress(selectedAddressWithPlaceLabel);
      setAddressQuery(address.display_address);
      saveDeliveryAddressPrefill(selectedAddressWithPlaceLabel);
      setSuggestions([]);
      setQuote(null);
      setQuoteError(null);
    } catch {
      setAddressError(t('checkout.addressSelectionUnavailable'));
    } finally {
      setAddressLoading(false);
    }
  };

  const getCurrentPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error(t('checkout.lalamoveLocationUnsupported')));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 20_000,
      maximumAge: 300_000,
    });
  });

  const requestCurrentLocation = async () => {
    if (locationLoading) return;
    setLocationLoading(true);
    setAddressError(null);
    try {
      if (!user) await ensureGuestAuthIdentity();
      const position = await getCurrentPosition();
      const address = await reverseGeocodeMalaysiaAddress(position.coords.latitude, position.coords.longitude, language);
      setSelectedAddress(address);
      setAddressQuery(address.display_address);
      saveDeliveryAddressPrefill(address);
      setSuggestions([]);
      setQuote(null);
      setQuoteError(null);
    } catch (error) {
      const locationDenied = !!error && typeof error === 'object' && 'code' in error &&
        typeof (error as { code?: unknown }).code === 'number';
      setAddressError(locationDenied ? t('checkout.lalamoveLocationRequired') : t('checkout.currentLocationUnavailable'));
    } finally {
      setLocationLoading(false);
    }
  };

  const openQuotePanel = () => {
    setQuotePanelOpen(true);
    setQuoteError(null);
  };

  const checkDeliveryFee = async () => {
    if (quoteRequestLock.current) return;
    if (guestCaptchaPending) {
      setQuoteError(t('homepage.deliveryFeeChecker.securityRequired'));
      return;
    }
    if (!selectedAddress || !unit.trim() || !deliveryDate || !deliveryTime) {
      setQuoteError(t('homepage.deliveryFeeChecker.fieldsRequired'));
      return;
    }

    quoteRequestLock.current = true;
    setQuoteLoading(true);
    setQuoteError(null);
    setQuote(null);
    try {
      if (!user) await ensureGuestAuthIdentity();
      const nextQuote = await requestLalamoveQuote({
        deliveryAddress: `${unit.trim()}, ${selectedAddress.display_address}`,
        deliveryLatitude: selectedAddress.latitude,
        deliveryLongitude: selectedAddress.longitude,
        requestedDate: deliveryDate,
        requestedTime: deliveryTime,
      });
      saveDeliveryAddressPrefill(selectedAddress);
      setQuote(nextQuote);
    } catch {
      setQuoteError(t('homepage.deliveryFeeChecker.unavailable'));
    } finally {
      quoteRequestLock.current = false;
      setQuoteLoading(false);
    }
  };

  return (
    <section className="bg-cream-100 py-8 sm:py-10" aria-labelledby="delivery-fee-checker-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 rounded-[2rem] border border-cream-300 bg-white p-6 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-jade-700">
              <Truck size={16} aria-hidden="true" />
              {t('homepage.deliveryFeeChecker.eyebrow')}
            </span>
            <h2 id="delivery-fee-checker-title" className="mt-2 font-display text-2xl font-bold leading-tight text-forest-950 sm:text-3xl">
              {t('homepage.deliveryFeeChecker.title')}
            </h2>
            <p className="mt-3 max-w-xl leading-7 text-gray-600">{t('homepage.deliveryFeeChecker.description')}</p>
          </div>
          <button type="button" className="btn-primary inline-flex shrink-0 items-center justify-center gap-2 sm:min-w-[220px]" onClick={() => setIsOpen(true)}>
            {t('homepage.deliveryFeeChecker.openButton')}
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-950/55 p-0 sm:items-center sm:p-6" role="presentation">
          <button type="button" className="absolute inset-0 cursor-default" aria-label={t('homepage.deliveryFeeChecker.close')} onClick={closeChecker} />
          <div
            className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${addressInputId}-title`}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-cream-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-jade-700">{t('homepage.deliveryFeeChecker.eyebrow')}</p>
                <h2 id={`${addressInputId}-title`} className="mt-1 font-display text-2xl font-bold text-forest-950">{t('homepage.deliveryFeeChecker.modalTitle')}</h2>
              </div>
              <button type="button" className="touch-target rounded-full p-2 text-gray-500 hover:bg-cream-100 hover:text-forest-900" aria-label={t('homepage.deliveryFeeChecker.close')} onClick={closeChecker}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-5 p-5 sm:p-7">
              {guestCaptchaPending && <GuestCaptchaPanel onVerified={() => setGuestIdentityReady(true)} />}

              <div className="relative">
                <label htmlFor={addressInputId} className="mb-1.5 block text-sm font-semibold text-gray-700">
                  {t('homepage.deliveryFeeChecker.addressLabel')}
                </label>
                <input
                  id={addressInputId}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={suggestions.length > 0}
                  aria-controls={`${addressInputId}-suggestions`}
                  value={addressQuery}
                  onChange={(event) => updateAddressQuery(event.target.value)}
                  autoComplete="off"
                  className="input-field"
                  placeholder={t('homepage.deliveryFeeChecker.addressPlaceholder')}
                />
                {addressLoading && <p className="mt-1 text-xs text-gray-500">{t('checkout.addressSearching')}</p>}
                {suggestions.length > 0 && (
                  <ul id={`${addressInputId}-suggestions`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-cream-300 bg-white py-1 shadow-lg">
                    {suggestions.map((suggestion) => (
                      <li key={suggestion.placeId} role="option" aria-selected="false">
                        <button type="button" className="flex w-full items-start gap-2 px-4 py-3 text-left text-sm hover:bg-forest-50" onClick={() => void chooseSuggestion(suggestion)}>
                          <MapPin size={16} className="mt-0.5 shrink-0 text-forest-700" aria-hidden="true" />
                          <span>{suggestion.displayAddress}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedAddress && <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-green-700"><CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{t('checkout.addressSelected')}</p>}
                {addressError && <p className="mt-1 text-xs text-red-600" aria-live="polite">{addressError}</p>}
                <button type="button" className="btn-secondary mt-3 inline-flex w-full items-center justify-center gap-2 sm:w-auto" disabled={locationLoading || guestCaptchaPending} onClick={() => void requestCurrentLocation()}>
                  <LocateFixed size={16} aria-hidden="true" />
                  {locationLoading ? t('checkout.currentLocationLoading') : t('checkout.useCurrentLocation')}
                </button>
                <p className="mt-2 text-xs leading-5 text-gray-500">{t('checkout.addressPrivacyNotice')}</p>
              </div>

              {selectedAddress && (
                <div className="space-y-4" aria-live="polite">
                  {isCommunityEligible ? (
                    <div className="rounded-3xl border border-jade-200 bg-jade-50 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-jade-700">{t('homepage.deliveryFeeChecker.communityBadge')}</p>
                          <h3 className="mt-1 font-display text-xl font-bold text-forest-950">{t('homepage.deliveryFeeChecker.communityTitle')}</h3>
                        </div>
                        <strong className="rounded-full bg-white px-3 py-1 text-sm font-bold text-forest-800">RM2 / {t('homepage.deliveryFeeChecker.orderLabel')}</strong>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-gray-700">{t('homepage.deliveryFeeChecker.communityDescription')}</p>
                      <Link to={startShoppingHref} className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 sm:w-auto" onClick={() => saveDeliveryAddressPrefill(selectedAddress)}>
                        {startShoppingLabel}
                        <ArrowRight size={16} aria-hidden="true" />
                      </Link>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-cream-300 bg-cream-50 p-5">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-jade-700">{t('homepage.deliveryFeeChecker.courierBadge')}</p>
                      <h3 className="mt-1 font-display text-xl font-bold text-forest-950">{t('homepage.deliveryFeeChecker.courierTitle')}</h3>
                      <p className="mt-3 text-sm leading-6 text-gray-700">{t('homepage.deliveryFeeChecker.courierDescription')}</p>
                      <Link to={startShoppingHref} className="btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2 sm:w-auto" onClick={() => saveDeliveryAddressPrefill(selectedAddress!)}>
                        {startShoppingLabel}
                        <ArrowRight size={16} aria-hidden="true" />
                      </Link>
                    </div>
                  )}

                  <div className="rounded-3xl border border-cream-200 bg-white p-5">
                    <div className="flex items-start gap-3">
                      <Clock3 size={18} className="mt-0.5 shrink-0 text-jade-700" aria-hidden="true" />
                      <div>
                        <p className="font-semibold text-forest-950">{t('homepage.deliveryFeeChecker.lalamovePromptTitle')}</p>
                        <p className="mt-1 text-sm leading-6 text-gray-600">{t('homepage.deliveryFeeChecker.lalamovePromptDescription')}</p>
                      </div>
                    </div>
                    <button type="button" className="btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2 sm:w-auto" onClick={openQuotePanel}>
                      {t('homepage.deliveryFeeChecker.lalamoveAction')}
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {quotePanelOpen && (
                <div className="rounded-3xl border border-cream-300 bg-cream-50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-jade-700">{t('homepage.deliveryFeeChecker.lalamoveBadge')}</p>
                      <h3 className="mt-1 font-display text-xl font-bold text-forest-950">{t('homepage.deliveryFeeChecker.lalamoveTitle')}</h3>
                    </div>
                    <button type="button" className="text-sm font-semibold text-gray-500 underline underline-offset-4 hover:text-forest-900" onClick={() => { setQuotePanelOpen(false); setQuoteError(null); }}>{t('homepage.deliveryFeeChecker.hide')}</button>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor={unitInputId} className="mb-1.5 block text-sm font-semibold text-gray-700">{t('homepage.deliveryFeeChecker.unitLabel')}</label>
                      <input id={unitInputId} className="input-field" value={unit} onChange={(event) => { setUnit(event.target.value); setQuote(null); setQuoteError(null); }} placeholder={t('checkout.unitNumber')} autoComplete="address-line2" />
                    </div>
                    <div>
                      <label htmlFor={timeInputId} className="mb-1.5 block text-sm font-semibold text-gray-700">{t('homepage.deliveryFeeChecker.timeLabel')}</label>
                      <input id={timeInputId} className="input-field" type="time" min="09:00" max="16:00" value={deliveryTime} onChange={(event) => { setDeliveryTime(event.target.value); setQuote(null); setQuoteError(null); }} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="mb-2 text-sm font-semibold text-gray-700">{t('homepage.deliveryFeeChecker.dateLabel')}</p>
                    <DeliverySlotSelector
                      selected={deliveryDay}
                      selectedDate={deliveryDate}
                      onChange={(day, localDate) => { setDeliveryDay(day); setDeliveryDate(localDate); setQuote(null); setQuoteError(null); }}
                      compact
                      scope="external"
                    />
                  </div>
                  <button type="button" className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2" disabled={quoteLoading || guestCaptchaPending} onClick={() => void checkDeliveryFee()}>
                    {quoteLoading && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
                    {quoteLoading ? t('homepage.deliveryFeeChecker.loading') : t('homepage.deliveryFeeChecker.button')}
                  </button>
                  {quoteError && <p className="mt-3 text-sm text-red-600" aria-live="polite">{quoteError}</p>}
                  {quote && (
                    <div className="mt-4 rounded-2xl border border-jade-200 bg-jade-50 p-4" aria-live="polite">
                      <p className="text-sm font-semibold text-forest-950">{t('homepage.deliveryFeeChecker.resultLabel')}</p>
                      <p className="mt-1 font-display text-3xl font-bold text-forest-800">{quote.currency} {formatCurrency(Number(quote.quotedFee))}</p>
                      <p className="mt-2 text-xs leading-5 text-gray-600">{t('homepage.deliveryFeeChecker.resultDisclaimer')}</p>
                      <Link to={startShoppingHref} className="btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2 sm:w-auto" onClick={() => saveDeliveryAddressPrefill(selectedAddress!)}>
                        {startShoppingLabel}
                        <ArrowRight size={16} aria-hidden="true" />
                      </Link>
                      <p className="mt-2 text-xs text-gray-500">{t('homepage.deliveryFeeChecker.checkoutNote')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
