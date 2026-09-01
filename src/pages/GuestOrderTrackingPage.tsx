import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, ExternalLink, Package, RefreshCw, Upload, Wallet } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { createBrowserUuid } from '../lib/browserUuid';
import { formatCurrency } from '../lib/currency';
import { ensureGuestAuthIdentity, guestTokenStorageKey } from '../lib/guestCheckout';
import { guestCaptchaConfigured } from '../lib/guestCheckout';
import { GuestCaptchaRequiredError } from '../lib/guestAuth';
import { supabase } from '../lib/supabase';
import GuestCaptchaPanel from '../components/auth/GuestCaptchaPanel';

const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf';

type GuestLine = {
  id: string; name: string; quantity: number; sellingUnit: string;
  estimatedLineTotal: number; finalLineTotal: number | null;
};
type GuestTracking = {
  packingStartedAt: string | null; packingCompletedAt: string | null;
  supplierDispatchStartedAt: string | null; supplierDispatchCompletedAt: string | null;
  readyForRiderAt: string | null; deliveryStartedAt: string | null;
  deliveredAt: string | null; deliveryStatus: string | null; trackingUrl: string | null;
};
type GuestOrder = {
  id: string; orderNumber: string; createdAt: string; status: string;
  priceStatus: 'estimated' | 'final';
  paymentStatus: 'pending' | 'receipt_submitted' | 'rejected' | 'paid';
  estimatedTotal: number; finalSubtotal: number | null; finalTotal: number | null; deliveryFee: number;
  customer: { name: string; phone: string; email: string | null };
  delivery: Record<string, unknown>;
  payment: { qrStoragePath: string | null; instructions: string | null; rejectionReason: string | null } | null;
  lines: GuestLine[]; tracking: GuestTracking;
  deliveryProofs: { type: string; storagePath: string; uploadedAt: string }[];
};

function readBootstrapToken(orderNumber: string): string | null {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const bootstrap = hash.get('token');
  if (bootstrap) {
    try { sessionStorage.setItem(guestTokenStorageKey(orderNumber), bootstrap); } catch { /* Session storage may be disabled. */ }
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    return bootstrap;
  }
  try { return sessionStorage.getItem(guestTokenStorageKey(orderNumber)); } catch { return null; }
}

export default function GuestOrderTrackingPage() {
  const { orderNumber = '' } = useParams<{ orderNumber: string }>();
  const token = useRef<string | null>(null);
  const [order, setOrder] = useState<GuestOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState<string | null>(null);
  const [proofUrls, setProofUrls] = useState<{ type: string; url: string }[]>([]);
  const [captchaNeeded, setCaptchaNeeded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      await ensureGuestAuthIdentity();
      if (token.current === null) token.current = readBootstrapToken(orderNumber);
      const { data, error: rpcError } = await supabase.rpc('get_guest_sales_order', {
        p_order_number: orderNumber,
        p_access_token: token.current,
      });
      if (rpcError) throw rpcError;
      const result = data as unknown as { ok?: boolean; message?: string; order?: GuestOrder };
      if (!result?.ok || !result.order) throw new Error('Order access could not be verified.');
      setOrder(result.order);
    } catch (loadError) {
      setOrder(null);
      if (loadError instanceof GuestCaptchaRequiredError && guestCaptchaConfigured) {
        setCaptchaNeeded(true);
      } else {
        setError('Order access could not be verified. Check that you opened the complete private link.');
      }
    } finally { setLoading(false); }
  }, [orderNumber]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let cancelled = false;
    if (!order?.deliveryProofs?.length) { setProofUrls([]); return; }
    void Promise.all(order.deliveryProofs.map(async proof => {
      const { data } = await supabase.storage.from('delivery-proof').createSignedUrl(proof.storagePath, 3600);
      return data?.signedUrl ? { type: proof.type, url: data.signedUrl } : null;
    })).then(items => { if (!cancelled) setProofUrls(items.filter((item): item is { type: string; url: string } => item !== null)); });
    return () => { cancelled = true; };
  }, [order]);

  const stage = useMemo(() => {
    if (!order) return 0;
    const tracking = order.tracking;
    if (tracking.deliveredAt) return 6;
    if (tracking.deliveryStartedAt) return 5;
    if (tracking.readyForRiderAt || tracking.supplierDispatchCompletedAt) return 4;
    if (tracking.supplierDispatchStartedAt) return 3;
    if (tracking.packingStartedAt) return 2;
    if (order.paymentStatus === 'paid') return 1;
    return 0;
  }, [order]);

  const selectReceipt = (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    setReceiptFile(file); setReceiptMessage(null); event.currentTarget.value = '';
  };

  const uploadReceipt = async () => {
    if (!order || !receiptFile || order.finalTotal == null) return;
    setUploading(true); setReceiptMessage(null);
    let storagePath: string | null = null;
    try {
      const allowed: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
      };
      const extension = allowed[receiptFile.type];
      if (!extension) throw new Error('Receipt must be JPG, PNG, WebP, or PDF.');
      if (receiptFile.size <= 0 || receiptFile.size > 5 * 1024 * 1024) throw new Error('Receipt must be 5 MB or smaller.');
      storagePath = `guest/${order.id}/${createBrowserUuid()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('sales-order-payment-receipts')
        .upload(storagePath, receiptFile, { upsert: false, contentType: receiptFile.type, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const { error: submitError } = await supabase.rpc('submit_guest_sales_order_payment_receipt', {
        p_sales_order_id: order.id, p_storage_path: storagePath,
        p_original_file_name: receiptFile.name, p_mime_type: receiptFile.type,
        p_file_size: receiptFile.size, p_expected_final_total: order.finalTotal,
      });
      if (submitError) throw submitError;
      setReceiptFile(null); setReceiptMessage('Receipt submitted. FreshGo will verify it shortly.');
      await load();
    } catch (uploadError) {
      if (storagePath) await supabase.storage.from('sales-order-payment-receipts').remove([storagePath]);
      setReceiptMessage(uploadError instanceof Error ? uploadError.message : 'Receipt upload failed.');
    } finally { setUploading(false); }
  };

  if (loading) return <main className="mx-auto max-w-3xl px-4 py-20 text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-forest-200 border-t-forest-700"/><p>Securely opening your order…</p></main>;
  if (captchaNeeded) return <main className="mx-auto max-w-xl px-4 py-20"><h1 className="section-title text-center">Open your private order</h1><p className="mb-5 mt-3 text-center text-gray-600">Complete the security check to continue.</p><GuestCaptchaPanel onVerified={() => { setCaptchaNeeded(false); void load(); }}/></main>;
  if (error || !order) return <main className="mx-auto max-w-xl px-4 py-20 text-center"><Package className="mx-auto mb-4 text-gray-400" size={42}/><h1 className="section-title">Private order link required</h1><p className="mt-3 text-gray-600">{error}</p><Link to="/" className="btn-primary mt-6 inline-flex">Back to FreshGo</Link></main>;

  const total = order.finalTotal ?? order.estimatedTotal;
  const canUpload = order.priceStatus === 'final' && ['pending', 'rejected'].includes(order.paymentStatus);
  const qrUrl = order.payment?.qrStoragePath
    ? supabase.storage.from('payment-qr').getPublicUrl(order.payment.qrStoragePath).data.publicUrl : null;
  const stages = ['Order received', 'Payment confirmed', 'Preparing', 'Supplier dispatch', 'At FreshGo hub', 'Out for delivery', 'Delivered'];

  return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
    <div className="gradient-forest rounded-3xl p-6 text-center text-white sm:p-8">
      <CheckCircle2 className="mx-auto mb-3" size={34}/><h1 className="text-2xl font-bold">Your FreshGo order</h1>
      <p className="mt-2 font-mono font-bold">{order.orderNumber}</p><p className="mt-1 text-sm text-forest-100">Keep this private link to return to payment and tracking.</p>
    </div>

    <section className="card mt-6 p-5 sm:p-7"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Order progress</h2><button onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2 px-3 py-2"><RefreshCw size={15}/>Refresh</button></div>
      <div className="mt-5 space-y-3">{stages.map((label, index) => <div key={label} className="flex items-center gap-3"><span className={`h-3 w-3 shrink-0 rounded-full ${index <= stage ? 'bg-forest-600' : 'bg-gray-200'}`}/><span className={index <= stage ? 'font-semibold text-gray-800' : 'text-gray-400'}>{label}</span></div>)}</div>
      {order.tracking.trackingUrl && <a href={order.tracking.trackingUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-forest-700">Track supplier delivery <ExternalLink size={14}/></a>}
      {proofUrls.length > 0 && <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">{proofUrls.map(proof => <figure key={proof.type} className="overflow-hidden rounded-xl border bg-white"><img src={proof.url} alt={`${proof.type} delivery proof`} className="aspect-video w-full object-cover"/><figcaption className="p-2 text-center text-xs font-semibold capitalize">{proof.type} delivery proof</figcaption></figure>)}</div>}
    </section>

    <section className="card mt-6 p-5 sm:p-7"><h2 className="flex items-center gap-2 font-semibold"><Wallet size={18}/>Payment</h2>
      <p className="mt-3 text-3xl font-bold text-forest-800">RM{formatCurrency(Number(total))}</p>
      <p className="mt-1 text-sm text-gray-600">Status: {order.paymentStatus.replace(/_/g, ' ')}</p>
      {order.priceStatus !== 'final' && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Fresh items are being weighed. Return here when the final amount is ready.</p>}
      {qrUrl && canUpload && <div className="mt-5 text-center"><img src={qrUrl} alt="FreshGo DuitNow QR" className="mx-auto aspect-square w-60 max-w-full rounded-xl bg-white object-contain p-2"/><p className="mt-3 text-sm">{order.payment?.instructions || 'Pay the final amount, then upload your receipt.'}</p></div>}
      {order.payment?.rejectionReason && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">Receipt needs attention: {order.payment.rejectionReason}</p>}
      {canUpload && <div className="mt-5 rounded-xl border p-4"><p className="mb-3 text-sm font-semibold">Upload payment receipt</p><div className="flex flex-wrap gap-3">
        <input id="guest-receipt-file" className="sr-only" type="file" accept={RECEIPT_ACCEPT} onInput={selectReceipt} onChange={selectReceipt}/><label htmlFor="guest-receipt-file" className="btn-secondary cursor-pointer">Choose file</label>
        <input id="guest-receipt-camera" className="sr-only" type="file" accept="image/*" capture="environment" onInput={selectReceipt} onChange={selectReceipt}/><label htmlFor="guest-receipt-camera" className="btn-secondary cursor-pointer">Use camera</label>
      </div>{receiptFile && <div className="mt-3"><p className="break-all text-sm">{receiptFile.name}</p><button disabled={uploading} onClick={() => void uploadReceipt()} className="btn-primary mt-3 inline-flex items-center gap-2"><Upload size={16}/>{uploading ? 'Uploading…' : 'Submit receipt'}</button></div>}</div>}
      {receiptMessage && <p className="mt-3 text-sm font-semibold text-forest-700">{receiptMessage}</p>}
    </section>

    <section className="card mt-6 p-5 sm:p-7"><h2 className="font-semibold">Order summary</h2><div className="mt-4 divide-y">{order.lines.map(line => <div key={line.id} className="flex justify-between gap-4 py-3 text-sm"><span>{line.name} × {line.quantity} {line.sellingUnit}</span><span>RM{formatCurrency(Number(line.finalLineTotal ?? line.estimatedLineTotal))}</span></div>)}</div><div className="mt-3 border-t pt-3 text-sm"><p className="flex justify-between"><span>Delivery</span><span>RM{formatCurrency(Number(order.deliveryFee))}</span></p></div>
      <div className="mt-5 rounded-xl bg-cream-50 p-4 text-sm"><p className="font-semibold">{order.customer.name}</p><p>{String(order.delivery.house_unit ?? '')}, {String(order.delivery.delivery_point_name ?? order.delivery.pickup_location ?? '')}</p><p>{order.customer.phone}{order.customer.email ? ` · ${order.customer.email}` : ''}</p></div>
    </section>
    <p className="mt-6 text-center text-sm text-gray-600">Want to save details for next time? <Link to="/" className="font-semibold text-forest-700">Create an account</Link> when convenient.</p>
  </main>;
}
