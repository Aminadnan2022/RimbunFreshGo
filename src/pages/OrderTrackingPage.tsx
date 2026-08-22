import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import {
  CheckCircle2, PackageCheck, Package, Truck, Home, Bike, Check,
  ExternalLink, MapPin, User, ChevronRight, CalendarDays, Wallet, BadgeCheck, PackageX, ZoomIn, X,
} from 'lucide-react';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import ProductImage from '../components/ui/ProductImage';
import { formatCurrency } from '../lib/currency';
import { supabase } from '../lib/supabase';
import { formatDisplayDate } from '../data/delivery';
import { isSliceItem } from '../lib/sellingOptions';
import {
  TRACKING_STAGES,
  customerStageIndex,
  fetchRiderNameForDate,
  fetchCustomerCanonicalDeliveryProofs,
  type CustomerDeliveryProof,
} from '../data/customerTracking';
import type { Order, CartItem } from '../types';
import { createBrowserUuid } from '../lib/browserUuid';

const STAGE_ICONS: Record<(typeof TRACKING_STAGES)[number], typeof Package> = {
  orderReceived: PackageCheck,
  awaitingPayment: Wallet,
  paymentConfirmed: BadgeCheck,
  preparing: Package,
  supplierDispatch: Truck,
  arrivedHub: Home,
  readyForRider: Truck,
  outForDelivery: Bike,
  delivered: CheckCircle2,
};

type CanonicalPaymentMeta = {
  salesOrderId: string;
  priceStatus: 'estimated' | 'final';
  paymentStatus: 'pending' | 'receipt_submitted' | 'rejected' | 'paid';
  finalTotal: number | null;
  rejectionReason: string | null;
};

type CanonicalPaymentDisplay = {
  qrStoragePath: string;
  instructions: string | null;
  configurationSource: string;
};

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { getOrder } = useOrders();
  const { t } = useLanguage();

  const isWeightItem = (item: CartItem) => {
    if (isSliceItem(item)) return false;
    if (item.orderingMode) return item.orderingMode === 'weight_only' || item.orderingMode === 'whole_fish_by_weight';
    return item.pricingType === 'per_kg';
  };

  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [riderName, setRiderName] = useState<string | null>(null);
  const [deliveryProofs, setDeliveryProofs] =
    useState<CustomerDeliveryProof[]>([]);
  const [deliveryProofError, setDeliveryProofError] =
    useState<string | null>(null);
  
  const [selectedDeliveryProof, setSelectedDeliveryProof] =
    useState<CustomerDeliveryProof | null>(null);
const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [canonicalPayment, setCanonicalPayment] =
    useState<CanonicalPaymentMeta | null>(null);

  const [canonicalPaymentDisplay, setCanonicalPaymentDisplay] =
    useState<CanonicalPaymentDisplay | null>(null);

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptInputKey, setReceiptInputKey] = useState(0);
const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptSuccess, setReceiptSuccess] = useState<string | null>(null);
useEffect(() => {
  const writeEvent = (eventName: string) => {
    const existing = JSON.parse(
      sessionStorage.getItem('freshgo-upload-debug') || '[]'
    );

    existing.push({
      event: eventName,
      time: new Date().toISOString(),
      visibility: document.visibilityState,
    });

    sessionStorage.setItem(
      'freshgo-upload-debug',
      JSON.stringify(existing.slice(-30))
    );

    console.log('[upload-debug]', eventName, document.visibilityState);
  };

  writeEvent('component-mounted');

  const onVisibility = () => writeEvent('visibilitychange');
  const onPageHide = () => writeEvent('pagehide');
  const onPageShow = () => writeEvent('pageshow');
  const onFocus = () => writeEvent('focus');
  const onBlur = () => writeEvent('blur');

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onBlur);
  };
}, []);
  const loadLive = useCallback(async (ref: string) => {
    let o: Order | null;
    let canonicalRiderResolved = false;

    try {
      o = await getOrder(ref);
    } catch (err) {
      // A SQL/query failure must NOT look like "Order Not Found".
      console.error('[tracking] Failed to fetch order:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load order');
      return;
    }
    if (!o) {
      // Only here does the order truly not exist.
      setOrder(null);
      setRiderName(null);
      setDeliveryProofs([]);
      setDeliveryProofError(null);
      setLoadError(null);
      return;
    }
    setLoadError(null);

    // Canonical payment metadata is intentionally loaded separately.
    // Legacy orders simply return no matching sales_orders row.
    try {
      const { data: canonicalRow, error: canonicalError } = await supabase
        .from('sales_orders')
        .select('id, price_status, payment_status, final_total')
        .eq('order_number', ref)
        .maybeSingle();

      if (canonicalError) throw canonicalError;

      if (canonicalRow) {
        let rejectionReason: string | null = null;

        if (canonicalRow.payment_status === 'rejected') {
          const { data: rejectedReceipt, error: rejectedReceiptError } =
            await supabase
              .from('sales_order_payment_receipts')
              .select('rejection_reason')
              .eq('sales_order_id', canonicalRow.id)
              .eq('verification_status', 'rejected')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

          if (rejectedReceiptError) throw rejectedReceiptError;
          rejectionReason = rejectedReceipt?.rejection_reason ?? null;
        }

        setCanonicalPayment({
          salesOrderId: String(canonicalRow.id),
          priceStatus: canonicalRow.price_status as 'estimated' | 'final',
          paymentStatus: canonicalRow.payment_status as
            | 'pending'
            | 'receipt_submitted'
            | 'rejected'
            | 'paid',
          finalTotal:
            canonicalRow.final_total == null
              ? null
              : Number(canonicalRow.final_total),
          rejectionReason,
        });

        const { data: paymentDisplayData, error: paymentDisplayError } =
          await supabase.rpc('get_sales_order_payment_display', {
            p_sales_order_id: canonicalRow.id,
          });

        if (paymentDisplayError) throw paymentDisplayError;

        const paymentDisplayRow = Array.isArray(paymentDisplayData)
          ? paymentDisplayData[0] ?? null
          : null;

        if (paymentDisplayRow?.qr_storage_path) {
          setCanonicalPaymentDisplay({
            qrStoragePath: String(paymentDisplayRow.qr_storage_path),
            instructions: paymentDisplayRow.instructions
              ? String(paymentDisplayRow.instructions)
              : null,
            configurationSource: String(
              paymentDisplayRow.configuration_source ?? ''
            ),
          });
        } else {
          setCanonicalPaymentDisplay(null);
        }

        const {
          data: fulfilmentTrackingData,
          error: fulfilmentTrackingError,
        } = await supabase.rpc(
          'get_sales_order_supplier_fulfilment_tracking',
          {
            p_sales_order_id: canonicalRow.id,
          }
        );

        if (fulfilmentTrackingError) throw fulfilmentTrackingError;

        const fulfilmentTracking = Array.isArray(fulfilmentTrackingData)
          ? fulfilmentTrackingData[0] ?? null
          : null;

        const {
          data: deliveryTrackingData,
          error: deliveryTrackingError,
        } = await supabase.rpc(
          'get_sales_order_canonical_delivery_tracking',
          {
            p_sales_order_id: canonicalRow.id,
          }
        );

        if (deliveryTrackingError) throw deliveryTrackingError;

        const deliveryTracking = Array.isArray(deliveryTrackingData)
          ? deliveryTrackingData[0] ?? null
          : null;

        const {
          data: riderTrackingData,
          error: riderTrackingError,
        } = await supabase.rpc(
          'get_sales_order_canonical_rider_tracking',
          {
            p_sales_order_id: canonicalRow.id,
          }
        );

        if (riderTrackingError) throw riderTrackingError;

        const riderTracking = Array.isArray(riderTrackingData)
          ? riderTrackingData[0] ?? null
          : null;

        canonicalRiderResolved = true;

        setRiderName(
          riderTracking?.rider_name
            ? String(riderTracking.rider_name)
            : null
        );

        const canonicalDeliveryStatus =
          riderTracking?.delivery_status
            ? String(riderTracking.delivery_status)
            : null;

        const canonicalDeliveredAt =
          riderTracking?.delivered_at
            ? String(riderTracking.delivered_at)
            : null;

        const canonicalIsDelivered =
          canonicalDeliveryStatus === 'delivered' ||
          canonicalDeliveredAt !== null;

        setDeliveryProofError(null);

        if (canonicalIsDelivered) {
          try {
            const proofs =
              await fetchCustomerCanonicalDeliveryProofs(
                String(canonicalRow.id),
              );

            console.log(
              '[tracking] Canonical delivery proofs:',
              proofs,
            );

            setDeliveryProofs(proofs);
          } catch (proofError) {
            console.error(
              '[tracking] Failed to fetch delivery proofs:',
              proofError,
            );

            const message =
              proofError &&
              typeof proofError === 'object' &&
              'message' in proofError &&
              typeof proofError.message === 'string'
                ? proofError.message
                : 'Unable to load delivery proof photos.';

            setDeliveryProofs([]);
            setDeliveryProofError(message);
          }
        } else {
          setDeliveryProofs([]);
          setDeliveryProofError(null);
        }

        o = {
          ...o,
          packingStartedAt:
            fulfilmentTracking?.packing_started_at ?? null,
          packingCompletedAt:
            fulfilmentTracking?.packing_completed_at ?? null,
          supplierDispatchStartedAt:
            deliveryTracking?.supplier_dispatch_started_at ?? null,
          supplierDispatchCompletedAt:
            deliveryTracking?.supplier_dispatch_completed_at ?? null,
          // Canonical supplier-to-hub batches own this URL. Keep it on the
          // customer tracking projection so the existing timeline can render
          // the same customer-safe link as legacy order dispatches.
          lalamoveTrackingUrl: deliveryTracking?.tracking_url ?? null,
          readyForRiderAt:
            riderTracking?.ready_for_rider_at ?? null,
          deliveryStartedAt:
            riderTracking?.delivery_started_at ?? null,
          deliveryStatus:
            (riderTracking?.delivery_status ?? 'pending') as Order['deliveryStatus'],
          deliveredAt:
            riderTracking?.delivered_at ?? null,
        };
      } else {
        setCanonicalPayment(null);
        setCanonicalPaymentDisplay(null);
        setDeliveryProofs([]);
        setDeliveryProofError(null);
      }
    } catch (err) {
      console.error('[tracking] Failed to fetch canonical payment metadata:', err);
      setCanonicalPayment(null);
      setCanonicalPaymentDisplay(null);
      setDeliveryProofs([]);
      setDeliveryProofError(null);
    }

    setOrder(o);

    if (!canonicalRiderResolved) {
      try {
        // Legacy fallback only.
        // Canonical orders resolve their explicitly assigned rider above.
        const riderDate = o.deliveryDate || '';
        setRiderName(
          riderDate
            ? await fetchRiderNameForDate(riderDate)
            : null
        );
      } catch (err) {
        console.error(
          '[tracking] Failed to fetch legacy rider details:',
          err
        );
        setRiderName(null);
      }
    }
  }, [getOrder]);

useEffect(() => {
  if (!user) return;

  let active = true;
  const ref = id ?? '';

  setInitialLoading(true);

  loadLive(ref).finally(() => {
    if (active) setInitialLoading(false);
  });

  // Do not refresh while Camera / Gallery / Files picker has hidden the page.
  // This avoids interrupting the native file-selection handoff on mobile.
  const interval = window.setInterval(() => {
    if (!active) return;
    if (document.visibilityState !== 'visible') return;

    loadLive(ref);
  }, 25000);

  return () => {
    active = false;
    window.clearInterval(interval);
  };
}, [id, loadLive, user]);

  const handleReceiptUpload = async () => {
    if (!canonicalPayment || !receiptFile) return;

    setReceiptUploading(true);
    setReceiptError(null);
    setReceiptSuccess(null);

    try {
      if (canonicalPayment.priceStatus !== 'final') {
        throw new Error('Final order price is not ready yet.');
      }

      if (!['pending', 'rejected'].includes(canonicalPayment.paymentStatus)) {
        throw new Error('Payment receipt cannot be submitted for this order right now.');
      }

      const allowedTypes: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'application/pdf': 'pdf',
      };

      const extension = allowedTypes[receiptFile.type];

      if (!extension) {
        throw new Error('Receipt must be JPG, PNG, WebP, or PDF.');
      }

      if (receiptFile.size <= 0 || receiptFile.size > 5 * 1024 * 1024) {
        throw new Error('Receipt file must be 5 MB or smaller.');
      }

      const receiptObjectId = createBrowserUuid();
      const storagePath =
        `${canonicalPayment.salesOrderId}/${receiptObjectId}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('sales-order-payment-receipts')
        .upload(storagePath, receiptFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: receiptFile.type,
        });

      if (uploadError) throw uploadError;

      const { error: submitError } = await supabase.rpc(
        'submit_sales_order_payment_receipt',
        {
          p_sales_order_id: canonicalPayment.salesOrderId,
          p_storage_path: storagePath,
          p_original_file_name: receiptFile.name,
          p_mime_type: receiptFile.type,
          p_file_size: receiptFile.size,
        },
      );

      if (submitError) throw submitError;

      setReceiptFile(null);
  setReceiptInputKey((key) => key + 1);
  setReceiptSuccess('Receipt submitted successfully. Waiting for admin verification.');

      await loadLive(id ?? '');
    } catch (err) {
      console.error('[tracking:receiptUpload]', err);

      setReceiptError(
        err instanceof Error
          ? err.message
          : 'Failed to submit payment receipt.',
      );
    } finally {
      setReceiptUploading(false);
    }
  };

  const retry = () => {
    const ref = id ?? '';
    setLoadError(null);
    setInitialLoading(true);
    loadLive(ref).finally(() => setInitialLoading(false));
  };

  const pointName = order?.customer.deliveryPointName || order?.customer.pickupLocation || '—';

  const formatMilestoneTime = (timestamp: string) =>
    new Date(timestamp).toLocaleString('en-MY', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const deliveryMethodLabel = (method: string | undefined) => {
    switch (method) {
      case 'normal_bulk':
        return 'Normal Delivery';
      case 'instant_customer_lalamove':
        return 'Instant Delivery';
      default:
        return method || '—';
    }
  };

  const currentIndex = useMemo(() => {
    if (!order) return 0;
    return customerStageIndex({
      paymentStatus: order.paymentStatus,
      packingStartedAt: order.packingStartedAt ?? null,
      packingCompletedAt: order.packingCompletedAt ?? null,
      supplierDispatchStartedAt: order.supplierDispatchStartedAt ?? null,
      supplierDispatchCompletedAt: order.supplierDispatchCompletedAt ?? null,
      readyForRiderAt: order.readyForRiderAt ?? null,
      deliveryStatus:
        (order.deliveryStatus as
          | 'pending'
          | 'arrived'
          | 'ready_for_rider'
          | 'out_for_delivery'
          | 'delivered') ?? 'pending',
      deliveredAt: order.deliveredAt ?? null,
    });
  }, [order]);

  const isTerminalDelivered = currentIndex === TRACKING_STAGES.length - 1;
  const stageTimestamp = (key: (typeof TRACKING_STAGES)[number]) => {
    switch (key) {
      case 'orderReceived': return order?.createdAt ?? null;
      case 'paymentConfirmed': return order?.paidAt ?? null;
      case 'preparing': return order?.packingStartedAt ?? null;
      case 'supplierDispatch': return order?.supplierDispatchStartedAt ?? null;
      case 'arrivedHub': return order?.supplierDispatchCompletedAt ?? null;
      case 'readyForRider': return order?.readyForRiderAt ?? null;
      case 'outForDelivery': return order?.deliveryStartedAt ?? null;
      case 'delivered': return order?.deliveredAt ?? null;
      default: return null;
    }
  };
  const currentStageNext: Partial<Record<(typeof TRACKING_STAGES)[number], string>> = {
    awaitingPayment: 'Complete payment once the final amount is ready. We will begin preparation after payment is confirmed.',
    paymentConfirmed: 'Your supplier will begin preparing your order next.',
    preparing: 'Your supplier will send the packed order to FreshGo Hub next.',
    supplierDispatch: 'The order is on its way to FreshGo Hub. We will prepare it for your rider after it arrives.',
    arrivedHub: 'FreshGo Hub will assign the order to a rider next.',
    readyForRider: 'Your assigned rider will collect the order from FreshGo Hub.',
    outForDelivery: 'Your rider is bringing the order to your selected delivery point.',
  };
  const isHttp = (u: string) => /^https?:\/\//i.test(u);
  const supplierDispatchTrackingUrl =
    currentIndex === TRACKING_STAGES.indexOf('supplierDispatch') &&
    order?.lalamoveTrackingUrl &&
    isHttp(order.lalamoveTrackingUrl)
      ? order.lalamoveTrackingUrl
      : null;

  const stageState = (i: number): 'done' | 'current' | 'future' => {
    if (i < currentIndex) return 'done';
    if (i === currentIndex) return isTerminalDelivered ? 'done' : 'current';
    return 'future';
  };

  const circleCls = (st: 'done' | 'current' | 'future') =>
    st === 'done'
      ? 'bg-emerald-500 border-emerald-500 text-white'
      : st === 'current'
      ? 'bg-white border-2 border-blue-500 text-blue-600 shadow-[0_0_0_4px_rgba(59,130,246,0.18)]'
      : 'bg-cream-100 border-2 border-cream-300 text-gray-300';

  const lineCls = (st: 'done' | 'current' | 'future') =>
    st === 'done' ? 'bg-emerald-400' : st === 'current' ? 'bg-blue-300' : 'bg-cream-200';

  if (!user) return <Navigate to="/" replace />;

  if (order === undefined && loadError) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-4">
          <PackageX size={28} className="text-red-400" />
        </div>
        <h2 className="section-title mb-2">{t("orderSuccess.loadError")}</h2>
        <button onClick={retry} className="btn-primary mt-4">{t("orderSuccess.retry")}</button>
      </main>
    );
  }

  if (initialLoading || order === undefined) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-10 h-10 border-2 border-forest-200 border-t-forest-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">{t("orderSuccess.loading")}</p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="section-title mb-4">{t("orderSuccess.notFound")}</h2>
        <p className="text-gray-500 mb-6">{t("orderSuccess.notFoundMessage", { id: id ?? '' })}</p>
        <Link to="/" className="btn-primary">{t("orderSuccess.backToHome")}</Link>
      </main>
    );
  }

  const from = 'Pasar Tani Putrajaya';
  const to = 'FreshGo Hub (Residensi Rimbun)';

  const paymentQrUrl = canonicalPaymentDisplay?.qrStoragePath
    ? supabase.storage
        .from('payment-qr')
        .getPublicUrl(canonicalPaymentDisplay.qrStoragePath).data.publicUrl
    : null;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-gray-400 mb-8">
        <Link to="/" className="hover:text-forest-600">{t("orderSuccess.home")}</Link>
        <ChevronRight size={12} />
        <span className="text-gray-600">{t("orderSuccess.pageTitle")}</span>
      </nav>

      {/* Confirmation banner */}
      <div className="gradient-forest rounded-3xl p-6 sm:p-8 mb-6 text-center text-white">
        <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={30} className="text-jade-300" />
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">
          {isTerminalDelivered ? 'Delivery completed' : t("orderSuccess.orderConfirmed")}
        </h1>
        <p className="text-forest-200 text-sm">
          {isTerminalDelivered
            ? 'Your FreshGo order has been delivered.'
            : t("orderSuccess.thankYou", { name: order.customer.name.split(' ')[0] })}
        </p>
        <div className="mt-3 bg-forest-300 rounded-2xl px-4 py-2 inline-block">
          <p className="text-xs text-forest-100">{t("orderSuccess.orderNumber")}</p>
          <p className="font-mono font-bold text-white">{order.id}</p>
        </div>
      </div>

      {/* Payment Status */}
      <div className="card p-6 sm:p-8 mb-6">
        <h2 className="font-semibold text-charcoal mb-4">{t("payment.status")}</h2>
        {order.paymentStatus === 'Pending' && (
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="font-semibold text-amber-700">{t("payment.pending")}</span>
          </div>
        )}
        {order.paymentStatus === 'Ready To Pay' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-orange-400 flex-shrink-0" />
              <span className="font-semibold text-orange-700">{t("payment.readyToPay")}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-cream-200 pt-3">
              <span className="text-gray-600 font-medium">{t("payment.amount")}</span>
              <span className="font-bold text-forest-800 text-base">RM{formatCurrency(order.total)}</span>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-sm text-orange-800 leading-relaxed">
              {t("payment.readyToPayInstructions")}
            </div>
          </div>
        )}
        {order.paymentStatus === 'Paid' && (
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
            <span className="font-semibold text-green-700">{t("payment.paid")}</span>
            {order.paidAt && (
              <span className="text-xs text-gray-400 ml-1">
                {new Date(order.paidAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Canonical payment receipt */}
      {canonicalPayment && (
        <div className="card p-6 sm:p-8 mb-6">
          <h2 className="font-semibold text-charcoal mb-4">
            Payment Receipt
          </h2>

          {canonicalPayment.priceStatus !== 'final' && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Final order price is still pending supplier finalisation.
              Payment receipt can be submitted once the final price is ready.
            </div>
          )}

          {canonicalPayment.priceStatus === 'final' &&
            canonicalPayment.paymentStatus !== 'paid' &&
            paymentQrUrl && (
              <div className="mb-5 rounded-2xl border border-forest-200 bg-forest-50/40 p-5 text-center">
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  Amount to pay
                </p>

                <p className="text-3xl font-bold text-forest-800 mb-5">
                  RM{formatCurrency(
                    canonicalPayment.finalTotal ?? order.total
                  )}
                </p>

                <div className="mx-auto w-fit rounded-2xl bg-white border border-cream-200 p-3 shadow-sm">
                  <img
                    src={paymentQrUrl}
                    alt="FreshGo DuitNow QR"
                    className="w-64 max-w-full aspect-square object-contain"
                  />
                </div>

                <p className="mt-4 font-semibold text-forest-800">
                  Scan DuitNow QR
                </p>

                <p className="mt-2 text-sm text-gray-600 leading-relaxed max-w-lg mx-auto">
                  {canonicalPaymentDisplay?.instructions ||
                    'Scan the DuitNow QR above and pay the exact order amount. After payment, upload your receipt for verification.'}
                </p>
              </div>
            )}

          {canonicalPayment.priceStatus === 'final' &&
            canonicalPayment.paymentStatus !== 'paid' &&
            !paymentQrUrl && (
              <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Payment QR is currently unavailable. Please contact FreshGo for assistance.
              </div>
            )}

          {canonicalPayment.priceStatus === 'final' &&
            canonicalPayment.paymentStatus === 'receipt_submitted' && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <p className="font-semibold text-blue-800">
                  Receipt submitted
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  Your receipt is waiting for admin verification.
                </p>
              </div>
            )}

          {canonicalPayment.paymentStatus === 'paid' && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
              <p className="font-semibold text-green-800">
                Payment confirmed
              </p>
              <p className="text-sm text-green-700 mt-1">
                Your payment has been verified successfully.
              </p>
            </div>
          )}

          {canonicalPayment.priceStatus === 'final' &&
            ['pending', 'rejected'].includes(canonicalPayment.paymentStatus) && (
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-cream-200 pb-3">
                  <span className="text-sm text-gray-600">
                    Final amount
                  </span>
                  <span className="font-bold text-lg text-forest-800">
                    RM{formatCurrency(
                      canonicalPayment.finalTotal ?? order.total
                    )}
                  </span>
                </div>

                {canonicalPayment.paymentStatus === 'rejected' && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                    <p className="font-semibold text-red-800">
                      Previous receipt rejected
                    </p>
                    <p className="text-sm text-red-700 mt-1">
                      {canonicalPayment.rejectionReason ||
                        'Please upload a new payment receipt.'}
                    </p>
                  </div>
                )}

                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                  Scan the DuitNow QR above, pay the exact amount shown,
                  then upload your payment receipt below.
                </div>

                <div>
                  <label
                    htmlFor="canonical-payment-receipt"
                    className="block text-sm font-semibold text-gray-700 mb-2"
                  >
                    Upload receipt
                  </label>

                  <input
                key={receiptInputKey}
                id="canonical-payment-receipt"
                type="file"
                accept="image/*"
                disabled={receiptUploading}
                onChange={(e) => {
                  const existing = JSON.parse(
  sessionStorage.getItem('freshgo-upload-debug') || '[]'
);

existing.push({
  event: 'file-input-change',
  time: new Date().toISOString(),
  fileCount: e.currentTarget.files?.length ?? 0,
});

sessionStorage.setItem(
  'freshgo-upload-debug',
  JSON.stringify(existing.slice(-30))
);
                  const file = e.currentTarget.files?.[0] ?? null;

                  console.log('[tracking:receiptFileSelected]', {
                    selected: Boolean(file),
                    name: file?.name ?? null,
                    type: file?.type ?? null,
                    size: file?.size ?? null,
                  });

                  if (!file) return;

                  setReceiptFile(file);
                  setReceiptError(null);
                  setReceiptSuccess(null);
                }}
                className="block w-full text-sm text-gray-600
                  file:mr-4 file:rounded-xl file:border-0
                  file:bg-forest-50 file:px-4 file:py-2.5
                  file:text-sm file:font-semibold file:text-forest-700
                  hover:file:bg-forest-100"
              />

              {receiptFile && (
                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3">
                  <p className="text-sm font-semibold text-green-800">
                    File selected
                  </p>
                  <p className="mt-1 break-all text-xs text-green-700">
                    {receiptFile.name}
                  </p>
                  <p className="mt-1 text-xs text-green-600">
                    {(receiptFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              )}

                  <p className="mt-2 text-xs text-gray-400">
                    JPG, PNG, WebP or PDF · maximum 5 MB
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleReceiptUpload}
                  disabled={!receiptFile || receiptUploading}
                  className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {receiptUploading
                    ? 'Uploading receipt...'
                    : 'Submit Payment Receipt'}
                </button>
              </div>
            )}

          {receiptError && (
            <p className="mt-4 text-sm text-red-600">
              {receiptError}
            </p>
          )}

          {receiptSuccess && (
            <p className="mt-4 text-sm text-green-700">
              {receiptSuccess}
            </p>
          )}
        </div>
      )}

      {/* Live timeline */}
      <div className="card p-6 sm:p-8 mb-6">
        <h2 className="font-semibold text-charcoal mb-6">{t("tracking.live.title")}</h2>
        <div className="relative pl-1">
          {TRACKING_STAGES.map((key, i) => {
            const st = stageState(i);
            const Icon = STAGE_ICONS[key];
            const title = t(`tracking.live.stage.${key}.title`);
            const timestamp = stageTimestamp(key);
            const isHistoricalPaymentStep =
              key === 'awaitingPayment' &&
              order.paymentStatus === 'Paid' &&
              st === 'done';
            return (
              <div key={key} className="relative pl-14 pb-7 last:pb-0">
                {i < TRACKING_STAGES.length - 1 && (
                  <div className={`absolute top-11 bottom-0 left-[19px] w-0.5 rounded-full ${lineCls(st)}`} />
                )}
                <div className={`absolute top-0 left-0 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${circleCls(st)}`}>
                  {st === 'done' ? <Check size={20} /> : <Icon size={18} />}
                </div>

                <div className={`min-w-0 rounded-2xl ${st === 'current' ? 'bg-blue-50 border border-blue-200 p-3' : 'py-1'}`}>
                  <p className={`font-semibold ${
                    st === 'done' ? 'text-emerald-700'
                      : st === 'current' ? 'text-blue-700'
                      : 'text-gray-400'
                  }`}>
                    {title}
                  </p>
                  <p className={`text-sm mt-0.5 ${st === 'future' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {isHistoricalPaymentStep
                      ? 'Final amount was confirmed before preparation began.'
                      : key === 'supplierDispatch'
                      ? t('tracking.live.stage.supplierDispatch.body', { from, to })
                      : t(`tracking.live.stage.${key}.body`)}
                  </p>

                  {timestamp && st !== 'future' && (
                    <p className="mt-1.5 text-xs font-medium text-gray-500">
                      {st === 'current' ? 'Updated' : 'Completed'} · {formatMilestoneTime(timestamp)}
                    </p>
                  )}

                  {st === 'current' && currentStageNext[key] && (
                    <p className="mt-3 rounded-xl border border-blue-100 bg-white/80 px-3 py-2 text-xs leading-relaxed text-blue-800">
                      <span className="font-semibold">What happens next:</span>{' '}
                      {currentStageNext[key]}
                    </p>
                  )}

                  {key === 'delivered' && st === 'done' && (
                    <p className="mt-2 text-sm font-medium text-emerald-700">
                      Your order has been delivered successfully.
                    </p>
                  )}

                  {key === 'supplierDispatch' && supplierDispatchTrackingUrl && (
                    <a
                      href={supplierDispatchTrackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-forest-700 text-white text-sm font-semibold hover:bg-forest-800 transition-all"
                    >
                      <ExternalLink size={16} />
                      {t("tracking.live.trackLalamove")}
                    </a>
                  )}

                  {key === 'outForDelivery' && currentIndex === 7 && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-forest-700">
                      <MapPin size={14} />
                      {t("tracking.live.currentDeliveryPoint")}: <span className="font-semibold">{pointName}</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Delivery details */}
      <div className="card p-6 sm:p-8 mb-6">
        <h2 className="font-semibold text-charcoal mb-4">{t("tracking.deliveryDetails")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <CalendarDays size={18} className="text-forest-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400">{t("tracking.live.deliveryDate")}</p>
              <p className="text-sm font-semibold text-forest-800">
                {order.deliveryDate ? formatDisplayDate(order.deliveryDate) : t("tracking.live.deliveryDate")}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin size={18} className="text-forest-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-400">{t("tracking.deliveryPoint")}</p>
              <p className="text-sm font-semibold text-gray-800">{pointName}</p>
              <p className="text-sm text-gray-500">{t("tracking.unit")} {order.customer.houseUnit}{order.customer.apartment ? `, ${order.customer.apartment}` : ''}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Package size={18} className="text-forest-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400">{t("tracking.live.deliveryMethod")}</p>
              <p className="text-sm font-medium text-gray-800">{deliveryMethodLabel(order.customer.deliveryMethod)}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className="text-forest-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400">{t("payment.status")}</p>
              <p className={`text-sm font-semibold ${
                order.paymentStatus === 'Paid' ? 'text-green-700' : order.paymentStatus === 'Ready To Pay' ? 'text-orange-700' : 'text-amber-700'
              }`}>
                {order.paymentStatus}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Proof of delivery */}
      {(currentIndex === TRACKING_STAGES.length - 1 ||
        order.deliveredAt != null) && (
        <div className="card p-6 sm:p-8 mb-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="font-semibold text-charcoal text-lg">
                Proof of Delivery
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                Photos taken by your FreshGo rider when your order was delivered.
              </p>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-semibold whitespace-nowrap">
              <CheckCircle2 size={14} />
              Delivered
            </span>
          </div>

          {deliveryProofError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-semibold text-red-700">
                Delivery photos could not be loaded.
              </p>

              <p className="text-xs text-red-600 mt-1 break-words">
                {deliveryProofError}
              </p>
            </div>
          ) : deliveryProofs.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-800">
                Delivery completed, but no proof photos were returned.
              </p>

              <p className="text-xs text-amber-700 mt-1">
                Refresh the page. If the photos still do not appear, please contact FreshGo.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {deliveryProofs.map((proof) => {
                  const isCloseup =
                    proof.proofType === 'closeup';

                  const title = isCloseup
                    ? 'Package Close-up'
                    : 'Delivery Placement';

                  const description = isCloseup
                    ? 'Close-up photo showing your FreshGo package and its identifying label.'
                    : 'Wide photo showing exactly where your rider placed the order.';

                  const number =
                    isCloseup ? 'Photo 1' : 'Photo 2';

                  return (
                    <article
                      key={proof.proofType}
                      className="overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-sm"
                    >
                      {proof.signedUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedDeliveryProof(proof)
                          }
                          className="group relative block w-full bg-black text-left"
                          aria-label={`View ${title}`}
                        >
                          <img
                            src={proof.signedUrl}
                            alt={title}
                            className="w-full aspect-[4/3] object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          />

                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />

                          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                            <ZoomIn size={13} />
                            View
                          </span>
                        </button>
                      ) : (
                        <div className="w-full aspect-[4/3] bg-cream-100 flex items-center justify-center text-gray-400">
                          <PackageX size={32} />
                        </div>
                      )}

                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                              {number}
                            </p>

                            <p className="font-semibold text-gray-900 mt-0.5">
                              {title}
                            </p>
                          </div>

                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700">
                            <CheckCircle2 size={12} />
                            Photo submitted
                          </span>
                        </div>

                        <p className="text-xs leading-relaxed text-gray-500 mt-2">
                          {description}
                        </p>

                        <p className="text-xs text-gray-400 mt-3">
                          Uploaded{' '}
                          {new Date(
                            proof.uploadedAt,
                          ).toLocaleString('en-MY', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border border-green-100 bg-green-50 px-4 py-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2
                    size={16}
                    className="mt-0.5 flex-shrink-0 text-green-700"
                  />

                  <div>
                    <p className="text-sm font-semibold text-green-900">
                      Delivery successfully recorded
                    </p>

                    <p className="text-xs leading-relaxed text-green-800 mt-0.5">
                      These photos were submitted by your assigned FreshGo rider as proof that the order was delivered.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Delivery proof lightbox */}
      {selectedDeliveryProof?.signedUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Delivery proof photo"
          onClick={() =>
            setSelectedDeliveryProof(null)
          }
        >
          <button
            type="button"
            onClick={() =>
              setSelectedDeliveryProof(null)
            }
            className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
            aria-label="Close image"
          >
            <X size={22} />
          </button>

          <div
            className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-4 py-3 sm:px-5">
              <div>
                <p className="font-semibold text-gray-900">
                  {selectedDeliveryProof.proofType ===
                  'closeup'
                    ? 'Package Close-up'
                    : 'Delivery Placement'}
                </p>

                <p className="text-xs text-gray-500 mt-0.5">
                  Proof of Delivery
                </p>
              </div>

              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                <CheckCircle2 size={13} />
                Delivered
              </span>
            </div>

            <div className="bg-black flex items-center justify-center">
              <img
                src={
                  selectedDeliveryProof.signedUrl
                }
                alt={
                  selectedDeliveryProof.proofType ===
                  'closeup'
                    ? 'Package Close-up'
                    : 'Delivery Placement'
                }
                className="max-h-[75vh] w-auto max-w-full object-contain"
              />
            </div>

            <div className="px-4 py-3 sm:px-5">
              <p className="text-xs text-gray-500">
                Uploaded{' '}
                {new Date(
                  selectedDeliveryProof.uploadedAt,
                ).toLocaleString('en-MY', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Rider info */}
      {riderName && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold text-charcoal mb-4">{t("tracking.live.rider")}</h2>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0">
              <User size={20} />
            </div>
            <p className="font-semibold text-forest-800">{riderName}</p>
          </div>
        </div>
      )}

      {/* Order summary */}
      <div className="card p-6 sm:p-8">
        <h3 className="font-semibold text-charcoal mb-4">{t("tracking.orderContents")}</h3>
        <div className="space-y-3 mb-4">
          {order.items.map((item) => (
            <div key={item.comboId ?? item.productId} className="flex gap-3 items-center">
              <ProductImage src={item.image} alt={item.name} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{item.name}</p>
                {item.preparation && <p className="text-xs text-gray-400">{t("cartItem.preparation." + item.preparation)}</p>}
                {isSliceItem(item) ? (
                  <p className="text-xs text-gray-500">{t("tracking.slices", { count: item.sliceQuantity ?? item.quantity })}</p>
                ) : isWeightItem(item) ? (
                  <p className="text-xs text-amber-600">~{(item.estimatedWeight ?? 0).toFixed(2)} kg</p>
                ) : (
                  <p className="text-xs text-gray-400">{t("checkout.qty", { count: item.quantity })}</p>
                )}
                {isSliceItem(item) && item.actualWeight != null && (
                  <p className="text-xs text-forest-700 font-medium mt-0.5">
                    {t("tracking.actualWeight", { weight: item.actualWeight.toFixed(2) })} · {t("tracking.pricePerKg", { price: formatCurrency(item.price) })} · <strong>{t("tracking.finalPrice", { price: formatCurrency(item.price * item.actualWeight) })}</strong>
                  </p>
                )}
                {item.comboItems && item.comboItems.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-cream-200 space-y-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("checkout.contains")}</p>
                    {item.comboItems.map((ci) => (
                      <div key={ci.productId} className="flex items-center gap-1.5 text-xs">
                        <span className="text-gray-700">{ci.label}</span>
                        {ci.preparation && (
                          <span className="text-gray-400">({t("cartItem.preparation." + ci.preparation)})</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {isWeightItem(item) ? (
                <p className="text-sm font-semibold text-amber-700">≈ RM{formatCurrency(item.price * (item.estimatedWeight ?? 0))}</p>
              ) : isSliceItem(item) ? (
                item.actualWeight != null ? (
                  <p className="text-sm font-semibold text-forest-800">RM{formatCurrency(item.price * item.actualWeight)}</p>
                ) : (
                  <p className="text-xs text-gray-400">{t("checkout.afterWeighing")}</p>
                )
              ) : (
                <p className="text-sm font-semibold text-forest-800">RM{formatCurrency(item.price * item.quantity)}</p>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-cream-200 pt-3 space-y-1.5">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t("checkout.subtotal")}</span><span>RM{formatCurrency(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>{t("checkout.delivery")}</span>
            <span>RM{formatCurrency(order.deliveryFee)}</span>
          </div>
          <div className="flex justify-between font-bold text-base border-t border-cream-200 pt-2">
            <span>{t("checkout.total")}</span>
            <span className="text-forest-800">RM{formatCurrency(order.total)}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link to="/shop" className="btn-secondary">{t("orderSuccess.continueShopping")}</Link>
      </div>
    </main>
  );
}
