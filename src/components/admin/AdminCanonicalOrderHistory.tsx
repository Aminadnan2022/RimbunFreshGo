import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ClipboardList, Loader2, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/currency';
import { fetchCustomerCanonicalDeliveryProofs, type CustomerDeliveryProof } from '../../data/customerTracking';
import type { Json } from '../../types/database';

type Snapshot = Record<string, Json | undefined>;
type LifecycleFilter = 'all' | 'pending_payment' | 'paid_preparing' | 'out_for_delivery' | 'delivered' | 'cancelled';

type CanonicalOrder = {
  id: string;
  order_number: string;
  status: string;
  customer_snapshot: Json;
  delivery_snapshot: Json;
  estimated_total: number;
  final_total: number | null;
  total: number;
  delivery_fee: number;
  payment_status: string;
  price_status: string;
  paid_at: string | null;
  receipt_submitted_at: string | null;
  created_at: string;
  fulfilments: Fulfilment[];
  delivery: Delivery | null;
};

type Fulfilment = {
  id: string;
  sales_order_id: string;
  supplier_id: number;
  status: string;
  packing_started_at: string | null;
  packing_completed_at: string | null;
};

type Delivery = {
  sales_order_id: string;
  assigned_rider_id: string;
  status: string;
  ready_for_rider_at: string;
  delivery_started_at: string | null;
  delivered_at: string | null;
};

type OrderLine = {
  id: string;
  line_number: number;
  item_kind: string;
  product_snapshot: Json;
  supplier_snapshot: Json;
  supplier_id: number | null;
  quantity: number;
  selling_unit: string;
  ordering_mode: string | null;
  unit_selling_price: number;
  estimated_weight_kg: number | null;
  actual_weight_kg: number | null;
  estimated_line_total: number | null;
  final_line_total: number | null;
  line_total: number;
};

type PreparationAnswer = {
  sales_order_line_id: string;
  question_code: string;
  option_code: string | null;
  answer_value: Json;
};

type Receipt = {
  id: string;
  original_file_name: string;
  verification_status: string;
  uploaded_at: string;
  verified_at: string | null;
  rejection_reason: string | null;
};

type Batch = {
  id: string;
  batch_code: string;
  status: string;
  hub_name: string;
  transport_provider: string | null;
  tracking_url: string | null;
  booking_reference: string | null;
  dispatched_at: string | null;
  arrived_hub_at: string | null;
};

type Detail = { lines: OrderLine[]; answers: PreparationAnswer[]; receipts: Receipt[]; batches: Batch[]; proofs: CustomerDeliveryProof[] };

const asSnapshot = (value: Json): Snapshot => value && typeof value === 'object' && !Array.isArray(value) ? value as Snapshot : {};
const text = (value: Json | undefined, fallback = '—') => typeof value === 'string' && value.trim() ? value : fallback;
const optionalText = (value: Json | undefined) => typeof value === 'string' && value.trim() ? value : null;
const humanize = (value?: string | null) => value ? value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Not started';
const date = (value?: string | null, withTime = false) => value ? new Date(value).toLocaleString('en-MY', withTime
  ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
  : { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function lifecycle(order: CanonicalOrder): LifecycleFilter {
  if (order.status === 'cancelled') return 'cancelled';
  if (order.delivery?.status === 'delivered' || order.delivery?.delivered_at) return 'delivered';
  if (order.delivery?.status === 'out_for_delivery' || order.delivery?.delivery_started_at) return 'out_for_delivery';
  if (order.payment_status !== 'paid') return 'pending_payment';
  return 'paid_preparing';
}

function fulfilmentLabel(order: CanonicalOrder) {
  if (order.status === 'cancelled') return 'Cancelled';
  if (order.delivery) return humanize(order.delivery.status);
  if (!order.fulfilments.length) return order.payment_status === 'paid' ? 'Awaiting preparation' : 'Awaiting payment';
  if (order.fulfilments.every((item) => item.status === 'packed')) return 'Packed / awaiting hub transfer';
  if (order.fulfilments.some((item) => item.status === 'packing')) return 'Preparing';
  return humanize(order.fulfilments[0].status);
}

const FILTERS: { value: LifecycleFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'paid_preparing', label: 'Paid / Preparing' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function AdminCanonicalOrderHistory({ legacy }: { legacy: ReactNode }) {
  const [orders, setOrders] = useState<CanonicalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LifecycleFilter>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<CanonicalOrder | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersResult, fulfilmentsResult, deliveriesResult] = await Promise.all([
        supabase.from('sales_orders').select('id, order_number, status, customer_snapshot, delivery_snapshot, estimated_total, final_total, total, delivery_fee, payment_status, price_status, paid_at, receipt_submitted_at, created_at').order('created_at', { ascending: false }),
        supabase.from('sales_order_supplier_fulfilments').select('id, sales_order_id, supplier_id, status, packing_started_at, packing_completed_at'),
        supabase.from('canonical_sales_order_deliveries').select('sales_order_id, assigned_rider_id, status, ready_for_rider_at, delivery_started_at, delivered_at'),
      ]);
      if (ordersResult.error) throw ordersResult.error;
      if (fulfilmentsResult.error) throw fulfilmentsResult.error;
      if (deliveriesResult.error) throw deliveriesResult.error;
      const fulfilments = (fulfilmentsResult.data ?? []) as Fulfilment[];
      const deliveries = new Map(((deliveriesResult.data ?? []) as Delivery[]).map((item) => [item.sales_order_id, item]));
      setOrders((ordersResult.data ?? []).map((order) => ({
        ...order,
        fulfilments: fulfilments.filter((item) => item.sales_order_id === order.id),
        delivery: deliveries.get(order.id) ?? null,
      })) as CanonicalOrder[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Canonical orders could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => orders.filter((order) => {
    const customer = asSnapshot(order.customer_snapshot);
    const haystack = `${order.order_number} ${text(customer.name, '')} ${text(customer.phone, '')}`.toLowerCase();
    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false;
    if (filter !== 'all' && lifecycle(order) !== filter) return false;
    const created = order.created_at.slice(0, 10);
    return (!fromDate || created >= fromDate) && (!toDate || created <= toDate);
  }), [orders, query, filter, fromDate, toDate]);

  if (selected) return <CanonicalDetail order={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-forest-900">Canonical Order History</h2>
        <p className="text-sm text-gray-500 mt-1">Read-only audit view for current and past canonical orders.</p>
      </div>

      <div className="bg-white rounded-2xl border border-cream-200 p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <label className="relative">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order number, customer or phone" className="w-full rounded-xl border border-cream-300 py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500" />
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-500"><Calendar size={15} /><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-xl border border-cream-300 px-3 py-2 text-sm" aria-label="Order date from" /></label>
          <label className="flex items-center gap-2 text-xs text-gray-500">to<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-xl border border-cream-300 px-3 py-2 text-sm" aria-label="Order date to" /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => <button key={item.value} onClick={() => setFilter(item.value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === item.value ? 'bg-forest-700 text-white' : 'bg-cream-100 text-gray-600 hover:bg-cream-200'}`}>{item.label} · {orders.filter((order) => item.value === 'all' || lifecycle(order) === item.value).length}</button>)}
        </div>
      </div>

      {loading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-forest-600" /></div>
        : error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          : filtered.length === 0 ? <div className="py-16 text-center text-gray-500"><ClipboardList className="mx-auto mb-3 text-gray-300" size={42} />No canonical orders match these filters.</div>
            : <div className="overflow-x-auto rounded-2xl border border-cream-200 bg-white shadow-soft"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b border-cream-200 bg-cream-50 text-left text-xs font-semibold text-gray-600"><th className="px-4 py-3">Order</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Ordered / requested</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Fulfilment / delivery</th><th className="px-4 py-3">Rider summary</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-cream-100">{filtered.map((order) => {
              const customer = asSnapshot(order.customer_snapshot); const delivery = asSnapshot(order.delivery_snapshot);
              return <tr key={order.id} className="hover:bg-cream-50/50"><td className="px-4 py-3 font-mono text-xs font-semibold text-forest-800">{order.order_number}</td><td className="px-4 py-3"><div className="font-medium text-gray-900">{text(customer.name)}</div><div className="text-xs text-gray-500">{text(customer.phone)}</div></td><td className="px-4 py-3 text-gray-600"><div>{date(order.created_at)}</div><div className="text-xs">Delivery: {date(optionalText(delivery.requested_date))}</div></td><td className="px-4 py-3 font-semibold text-gray-900">RM{formatCurrency(Number(order.final_total ?? order.estimated_total ?? order.total))}<div className="text-xs font-normal text-gray-400">{order.final_total != null ? 'Final' : 'Estimated'}</div></td><td className="px-4 py-3"><Status value={order.payment_status} /></td><td className="px-4 py-3"><Status value={fulfilmentLabel(order)} /></td><td className="px-4 py-3 text-xs text-gray-600">{order.delivery ? <>{humanize(order.delivery.status)}<div>Rider assigned</div>{order.delivery.delivered_at && <div>{date(order.delivery.delivered_at)}</div>}</> : 'Not assigned'}</td><td className="px-4 py-3 text-right"><button onClick={() => setSelected(order)} className="inline-flex items-center gap-1 rounded-lg border border-forest-200 px-3 py-1.5 text-xs font-semibold text-forest-700 hover:bg-forest-50">View <ChevronRight size={13} /></button></td></tr>;
            })}</tbody></table></div>}

      <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
        <button onClick={() => setShowLegacy((value) => !value)} className="flex w-full items-center justify-between text-left"><span><strong className="text-sm text-gray-700">Legacy / Historical Orders</strong><span className="ml-2 text-xs text-gray-500">Pre-canonical records only</span></span><ChevronRight size={16} className={`transition-transform ${showLegacy ? 'rotate-90' : ''}`} /></button>
        {showLegacy && <div className="mt-5 border-t border-gray-200 pt-5">{legacy}</div>}
      </section>
    </div>
  );
}

function Status({ value }: { value: string }) {
  return <span className="inline-flex rounded-full bg-cream-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{humanize(value)}</span>;
}

function CanonicalDetail({ order, onBack }: { order: CanonicalOrder; onBack: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [linesResult, answersResult, receiptsResult, membershipsResult, proofs] = await Promise.all([
          supabase.from('sales_order_lines').select('id, line_number, item_kind, product_snapshot, supplier_snapshot, supplier_id, quantity, selling_unit, ordering_mode, unit_selling_price, estimated_weight_kg, actual_weight_kg, estimated_line_total, final_line_total, line_total').eq('sales_order_id', order.id).order('line_number'),
          supabase.from('sales_order_preparation_answers').select('sales_order_line_id, question_code, option_code, answer_value').in('sales_order_line_id', (await supabase.from('sales_order_lines').select('id').eq('sales_order_id', order.id)).data?.map((row) => row.id) ?? []),
          supabase.from('sales_order_payment_receipts').select('id, original_file_name, verification_status, uploaded_at, verified_at, rejection_reason').eq('sales_order_id', order.id).order('uploaded_at', { ascending: false }),
          supabase.from('canonical_supplier_delivery_batch_orders').select('batch_id').eq('sales_order_id', order.id),
          fetchCustomerCanonicalDeliveryProofs(order.id),
        ]);
        if (linesResult.error) throw linesResult.error; if (answersResult.error) throw answersResult.error; if (receiptsResult.error) throw receiptsResult.error; if (membershipsResult.error) throw membershipsResult.error;
        const batchIds = (membershipsResult.data ?? []).map((row) => row.batch_id);
        const batchesResult = batchIds.length ? await supabase.from('canonical_supplier_delivery_batches').select('id, batch_code, status, hub_name, transport_provider, tracking_url, booking_reference, dispatched_at, arrived_hub_at').in('id', batchIds) : { data: [], error: null };
        if (batchesResult.error) throw batchesResult.error;
        if (active) setDetail({ lines: (linesResult.data ?? []) as OrderLine[], answers: (answersResult.data ?? []) as PreparationAnswer[], receipts: (receiptsResult.data ?? []) as Receipt[], batches: (batchesResult.data ?? []) as Batch[], proofs });
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'Order detail could not be loaded.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [order]);
  const customer = asSnapshot(order.customer_snapshot); const delivery = asSnapshot(order.delivery_snapshot);
  return <div className="space-y-4"><button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-forest-700"><ChevronLeft size={16} /> Back to canonical orders</button>
    <section className="rounded-2xl border border-cream-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-lg font-bold text-forest-900">{order.order_number}</p><p className="text-sm text-gray-500">Placed {date(order.created_at, true)}</p></div><div className="flex gap-2"><Status value={order.payment_status} /><Status value={fulfilmentLabel(order)} /></div></div><div className="mt-5 grid gap-4 text-sm sm:grid-cols-3"><Info label="Customer" value={`${text(customer.name)} · ${text(customer.phone)}`} /><Info label="Requested delivery" value={`${date(text(delivery.requested_date, ''))} ${text(delivery.requested_time, '')}`} /><Info label="Delivery location" value={[text(delivery.house_unit, ''), text(delivery.apartment, ''), text(delivery.pickup_location, ''), text(delivery.delivery_point_name, '')].filter(Boolean).join(', ') || '—'} /></div></section>
    {loading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-forest-600" /></div> : error ? <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : detail && <>
      <section className="overflow-hidden rounded-2xl border border-cream-200 bg-white"><h3 className="border-b border-cream-200 px-5 py-4 font-semibold">Items, preparation and frozen pricing</h3><div className="divide-y divide-cream-100">{detail.lines.map((line) => { const snapshot = asSnapshot(line.product_snapshot); const answers = detail.answers.filter((answer) => answer.sales_order_line_id === line.id); return <div key={line.id} className="p-5"><div className="flex justify-between gap-4"><div><p className="font-semibold text-gray-900">{text(snapshot.name, 'Historical item')}</p><p className="text-xs text-gray-500">{line.quantity} {humanize(line.selling_unit)} · {humanize(line.ordering_mode)}</p></div><div className="text-right font-semibold">RM{formatCurrency(Number(line.final_line_total ?? line.estimated_line_total ?? line.line_total))}<p className="text-xs font-normal text-gray-500">{line.actual_weight_kg != null ? `${line.actual_weight_kg} kg final` : line.estimated_weight_kg != null ? `${line.estimated_weight_kg} kg estimated` : `RM${formatCurrency(Number(line.unit_selling_price))} each`}</p></div></div>{answers.length > 0 && <div className="mt-3 rounded-xl bg-cream-50 p-3 text-xs text-gray-600">{answers.map((answer, index) => <div key={`${answer.question_code}-${index}`}><strong>{humanize(answer.question_code)}:</strong> {humanize(answer.option_code ?? String(answer.answer_value))}</div>)}</div>}</div>; })}</div><div className="border-t border-cream-200 bg-cream-50 px-5 py-4 text-sm"><div className="flex justify-between"><span>Delivery fee</span><span>RM{formatCurrency(Number(order.delivery_fee))}</span></div><div className="mt-2 flex justify-between text-base font-bold"><span>{order.final_total != null ? 'Final total' : 'Estimated total'}</span><span>RM{formatCurrency(Number(order.final_total ?? order.estimated_total ?? order.total))}</span></div></div></section>
      <div className="grid gap-4 lg:grid-cols-2"><AuditSection title="Payment & receipt"><Info label="Price state" value={humanize(order.price_status)} /><Info label="Payment state" value={humanize(order.payment_status)} /><Info label="Paid" value={date(order.paid_at, true)} />{detail.receipts.length ? detail.receipts.map((receipt) => <div key={receipt.id} className="rounded-xl bg-cream-50 p-3 text-sm"><strong>{receipt.original_file_name}</strong><div>{humanize(receipt.verification_status)} · uploaded {date(receipt.uploaded_at, true)}</div>{receipt.rejection_reason && <div className="text-red-600">{receipt.rejection_reason}</div>}</div>) : <p className="text-sm text-gray-500">No payment receipt recorded.</p>}</AuditSection>
      <AuditSection title="Supplier fulfilment & hub transfer">{order.fulfilments.length ? order.fulfilments.map((item) => { const supplierLine = detail.lines.find((line) => line.supplier_id === item.supplier_id); const supplier = supplierLine ? asSnapshot(supplierLine.supplier_snapshot) : {}; return <div key={item.id} className="rounded-xl bg-cream-50 p-3 text-sm"><strong>{text(supplier.name, `Supplier #${item.supplier_id}`)}</strong><div>{humanize(item.status)}</div><div className="text-xs text-gray-500">Packing: {date(item.packing_started_at, true)} → {date(item.packing_completed_at, true)}</div></div>; }) : <p className="text-sm text-gray-500">No supplier fulfilment recorded.</p>}{detail.batches.map((batch) => <div key={batch.id} className="rounded-xl border border-cream-200 p-3 text-sm"><strong>{batch.batch_code}</strong> · {humanize(batch.status)}<div className="text-xs text-gray-500">{batch.transport_provider || 'Transport pending'} · {batch.hub_name}</div><div className="text-xs text-gray-500">Dispatched {date(batch.dispatched_at, true)} · Arrived {date(batch.arrived_hub_at, true)}</div>{batch.tracking_url && <a className="text-xs font-semibold text-forest-700 underline" href={batch.tracking_url} target="_blank" rel="noreferrer">Open supplier tracking</a>}</div>)}</AuditSection></div>
      <AuditSection title="Final-mile rider & proof of delivery">{order.delivery ? <div className="grid gap-3 sm:grid-cols-3"><Info label="State" value={humanize(order.delivery.status)} /><Info label="Ready / started" value={`${date(order.delivery.ready_for_rider_at, true)} / ${date(order.delivery.delivery_started_at, true)}`} /><Info label="Delivered" value={date(order.delivery.delivered_at, true)} /></div> : <p className="text-sm text-gray-500">No final-mile rider assignment recorded.</p>}{detail.proofs.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-xl">{detail.proofs.map((proof) => proof.signedUrl && <a key={proof.storagePath} href={proof.signedUrl} target="_blank" rel="noreferrer"><img src={proof.signedUrl} alt={`${humanize(proof.proofType)} proof`} className="aspect-video w-full rounded-xl border border-cream-200 object-cover" /><span className="mt-1 block text-xs text-gray-500">{humanize(proof.proofType)} · {date(proof.uploadedAt, true)}</span></a>)}</div>}</AuditSection>
    </>}</div>;
}

function AuditSection({ title, children }: { title: string; children: ReactNode }) { return <section className="space-y-3 rounded-2xl border border-cream-200 bg-white p-5"><h3 className="font-semibold text-gray-900">{title}</h3>{children}</section>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-0.5 text-sm text-gray-700">{value || '—'}</p></div>; }
