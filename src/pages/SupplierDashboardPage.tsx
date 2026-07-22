import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, ChevronLeft, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Scale, Lock, Phone, Home, MapPin } from 'lucide-react';
import { getPrepLabel } from '../lib/preparationOptions';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { PaymentStatus, PreparationOption, ComboExpandedItem } from '../types';

// ----------- Product-to-category mapping -----------

const PRODUCT_CATEGORY: Record<string, 'chicken' | 'fish' | 'prawns' | 'squid'> = {
  'broiler-chicken': 'chicken',
  'siakap': 'fish',
  'cencaru': 'fish',
  'bawal-emas': 'fish',
  'bawal-hitam': 'fish',
  'bawal-putih': 'fish',
  'jenahak-potong': 'fish',
  'jenahak-b': 'fish',
  'kerisi-a': 'fish',
  'mabong-a': 'fish',
  'merah-potong': 'fish',
  'merah-b': 'fish',
  'nyok': 'fish',
  'pelaling': 'fish',
  'parang': 'fish',
  'selar': 'fish',
  'selar-kuning': 'fish',
  'sardin': 'fish',
  'talapia-merah': 'fish',
  'tenggiri': 'fish',
  'tenggiri-potong': 'fish',
  'tongkol-hitam': 'fish',
  'tongkol-putih': 'fish',
  'keli': 'fish',
  'udang-a': 'prawns',
  'udang-rencah': 'prawns',
  'sotong-a': 'squid',
  'sotong-kembang': 'squid',
};

function getProductCategory(productId: string): 'chicken' | 'fish' | 'prawns' | 'squid' {
  return PRODUCT_CATEGORY[productId] ?? 'fish';
}

// ----------- Packing analysis helpers -----------

interface PackingItem {
  productId: string;
  name: string;
  quantity: number;
  preparation?: string;
}

function collectPackingItems(order: SupplierOrder): PackingItem[] {
  const result: PackingItem[] = [];
  for (const item of order.items) {
    if (item.comboItems && item.comboItems.length > 0) {
      for (const ci of item.comboItems) {
        result.push({
          productId: ci.productId,
          name: ci.name,
          quantity: ci.quantity * item.quantity,
          preparation: ci.preparation,
        });
      }
    } else if (item.comboId) {
      result.push({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        preparation: item.preparation,
      });
    } else {
      result.push({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        preparation: item.preparation,
      });
    }
  }
  return result;
}

interface CategoryTotals {
  total: number;
  byPrep: Record<string, number>;
  byProduct: Record<string, { total: number; byPrep: Record<string, number> }>;
}

function buildPackingSummary(orders: SupplierOrder[]) {
  const categories: Record<string, CategoryTotals> = { chicken: { total: 0, byPrep: {}, byProduct: {} }, fish: { total: 0, byPrep: {}, byProduct: {} }, prawns: { total: 0, byPrep: {}, byProduct: {} }, squid: { total: 0, byPrep: {}, byProduct: {} } };
  for (const order of orders) {
    const items = collectPackingItems(order);
    for (const pi of items) {
      const cat = getProductCategory(pi.productId);
      const catData = categories[cat];
      catData.total += pi.quantity;
      if (cat === 'chicken') {
        const prep = pi.preparation || 'whole';
        catData.byPrep[prep] = (catData.byPrep[prep] || 0) + pi.quantity;
      } else if (cat === 'fish') {
        if (!catData.byProduct[pi.productId]) catData.byProduct[pi.productId] = { total: 0, byPrep: {} };
        catData.byProduct[pi.productId].total += pi.quantity;
        const prep = pi.preparation || 'whole';
        catData.byProduct[pi.productId].byPrep[prep] = (catData.byProduct[pi.productId].byPrep[prep] || 0) + pi.quantity;
      } else if (cat === 'prawns' || cat === 'squid') {
        if (!catData.byProduct[pi.productId]) catData.byProduct[pi.productId] = { total: 0, byPrep: {} };
        catData.byProduct[pi.productId].total += pi.quantity;
      }
    }
  }
  return categories;
}

// ----------- Local types (scoped to supplier workflow) -----------

interface OrderItem {
  productId: string;
  name: string;
  price: number;
  unit: string;
  quantity: number;
  preparation?: string;
  pricingType?: 'per_kg' | 'fixed';
  comboId?: string;
  comboItems?: ComboExpandedItem[];
}

interface OrderSummary {
  deliveryDate?: string;
  deliveryWindow?: string;
  statusTimeline?: { status: string; time: string; done: boolean }[];
  orderRef?: string;
}

interface SupplierOrder {
  dbId: number;
  orderRef: string;
  customerName: string;
  customerPhone: string;
  apartment: string;
  houseUnit: string;
  pickupLocation: string;
  deliveryDate: string;
  deliveryWindow: string;
  items: OrderItem[];
  summary: OrderSummary;
  supplierWeights: Record<string, number>;
  deliveryFee: number;
  paymentStatus: PaymentStatus;
  orderNotes: string;
}

// ----------- Helpers -----------

const isPerKg = (item: OrderItem): boolean => {
  if (item.pricingType !== undefined) return item.pricingType === 'per_kg';
  if (item.unit === 'per kg') return true;
  if (item.unit === 'per bird' || item.comboId) return false;
  return true;
};

// ----------- Main page -----------

export default function SupplierDashboardPage() {
  const { isSupplier, loading: authLoading } = useAuth();
  const [view, setView] = useState<'schedule' | 'orders'>('schedule');
  const [selected, setSelected] = useState<SupplierOrder | null>(null);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('Orders')
        .select('id, full_name, phone_number, apartment, house_unit, pickup_location, order_notes, order_items, order_summary, supplier_weights, delivery_fee, payment_status')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const mapped: SupplierOrder[] = (data ?? []).map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = row as any;
        const summary: OrderSummary = r.order_summary ?? {};
        return {
          dbId: r.id,
          orderRef: summary.orderRef ?? String(r.id),
          customerName: r.full_name,
          customerPhone: r.phone_number ?? '',
          apartment: r.apartment ?? '',
          houseUnit: r.house_unit ?? '',
          pickupLocation: r.pickup_location ?? '',
          deliveryDate: summary.deliveryDate ?? '—',
          deliveryWindow: summary.deliveryWindow ?? '',
          items: (r.order_items as OrderItem[]) ?? [],
          summary,
          supplierWeights: (r.supplier_weights as Record<string, number>) ?? {},
          deliveryFee: Number(r.delivery_fee),
          paymentStatus: (r.payment_status as PaymentStatus) ?? 'Pending',
          orderNotes: r.order_notes ?? '',
        };
      });

      setOrders(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  if (authLoading) {
    return (
      <main className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </main>
    );
  }

  if (!isSupplier) return <Navigate to="/" replace />;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="font-display font-bold text-forest-900 text-2xl">Packing Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Prepare products before opening customer orders</p>
      </div>

      {selected ? (
        <WeightEntryView
          order={selected}
          onBack={() => { setSelected(null); loadOrders(); }}
          onSaved={() => { setSelected(null); loadOrders(); }}
        />
      ) : view === 'schedule' ? (
        <DeliveryScheduleView orders={orders} loading={loading} error={error} onOpenOrders={() => setView('orders')} onOpenOrder={setSelected} />
      ) : (
        <OrderListView orders={orders} loading={loading} error={error} onOpen={setSelected} onBack={() => setView('schedule')} />
      )}
    </main>
  );
}

// ----------- Payment status badge -----------

function PaymentBadge({ status }: { status: PaymentStatus }) {
  const styles: Record<PaymentStatus, string> = {
    'Pending':      'bg-amber-50 text-amber-700',
    'Ready To Pay': 'bg-orange-50 text-orange-700',
    'Paid':         'bg-green-50 text-green-700',
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

// ----------- Order list -----------

function OrderListView({ orders, onOpen, onBack }: { orders: SupplierOrder[]; onOpen: (o: SupplierOrder) => void; onBack: () => void }) {
  if (orders.length === 0) {
    return (
      <>
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-forest-700 mb-6 transition-colors">
          <ChevronLeft size={16} /> Back to Delivery Schedule
        </button>
        <div className="text-center py-20">
          <Scale size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No orders found.</p>
        </div>
      </>
    );
  }

  // Sort: deliveryDate → pickupLocation → customerName
  const sorted = [...orders].sort((a, b) => {
    const dateA = new Date(a.deliveryDate).getTime();
    const dateB = new Date(b.deliveryDate).getTime();
    if (!isNaN(dateA) && !isNaN(dateB) && dateA !== dateB) return dateA - dateB;
    const locCmp = a.pickupLocation.localeCompare(b.pickupLocation);
    if (locCmp !== 0) return locCmp;
    return a.customerName.localeCompare(b.customerName);
  });

  return (
    <>
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-forest-700 mb-6 transition-colors">
        <ChevronLeft size={16} /> Back to Delivery Schedule
      </button>

      <div className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream-50 border-b border-cream-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-700 w-8">#</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Order Ref</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">Pickup Location</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Payment</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {sorted.map((order, index) => (
                <tr key={order.dbId} className="hover:bg-cream-50/50 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{index + 1}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-900">{order.orderRef}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{order.customerName}</p>
                    {order.customerPhone && <p className="text-xs text-gray-400">{order.customerPhone}</p>}
                    {order.houseUnit && <p className="text-xs text-gray-400">Unit {order.houseUnit}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell text-xs">{order.pickupLocation || '—'}</td>
                  <td className="px-4 py-3">
                    <PaymentBadge status={order.paymentStatus} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onOpen(order)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-forest-700 border border-forest-200 hover:bg-forest-50 transition-all"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-right text-xs text-gray-400 mt-2">
        Showing {sorted.length} of {orders.length} orders
      </div>
    </>
  );
}

// ----------- Delivery Schedule View -----------

function DeliveryScheduleView({ orders, loading, error, onOpenOrders, onOpenOrder }: { orders: SupplierOrder[]; loading: boolean; error: string | null; onOpenOrders: () => void; onOpenOrder: (o: SupplierOrder) => void }) {
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [collapsedFish, setCollapsedFish] = useState<Record<string, boolean>>({});
  const [checkedCats, setCheckedCats] = useState<Record<string, boolean>>({});

  const toggleCat = (key: string) => setCollapsedCats((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleFish = (key: string) => setCollapsedFish((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleCheck = (key: string) => setCheckedCats((prev) => ({ ...prev, [key]: !prev[key] }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
        <AlertCircle size={18} className="flex-shrink-0" /> {error}
      </div>
    );
  }

  // Group orders by delivery date
  const dateGroups = orders.reduce<Record<string, SupplierOrder[]>>((acc, o) => {
    const d = o.deliveryDate || 'Unknown';
    if (!acc[d]) acc[d] = [];
    acc[d].push(o);
    return acc;
  }, {});

  const sortedDates = Object.keys(dateGroups).sort((a, b) => {
    const da = new Date(a).getTime();
    const db = new Date(b).getTime();
    if (!isNaN(da) && !isNaN(db)) return da - db;
    return a.localeCompare(b);
  });

  const [selectedDate, setSelectedDate] = useState(sortedDates[0] ?? '');
  const sliderRef = useRef<HTMLDivElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeBtnRef.current && sliderRef.current) {
      const container = sliderRef.current;
      const btn = activeBtnRef.current;
      const scrollLeft = btn.offsetLeft - container.offsetLeft - container.clientWidth / 2 + btn.clientWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
    }
  }, [selectedDate]);

  const dayOrders = dateGroups[selectedDate] ?? [];
  const pending = dayOrders.filter((o) => o.paymentStatus === 'Pending' || o.paymentStatus === 'Ready To Pay').length;
  const paid = dayOrders.filter((o) => o.paymentStatus === 'Paid').length;
  const summary = buildPackingSummary(dayOrders);
  const catOrder = ['chicken', 'fish', 'prawns', 'squid'] as const;
  const catLabels: Record<string, string> = { chicken: '🐔 Chicken', fish: '🐟 Fish', prawns: '🦐 Prawns', squid: '🦑 Squid' };

  function formatDateLabel(raw: string): string {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
  }

  return (
    <div className="space-y-6">
      {/* Date slider */}
      <div ref={sliderRef} className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-cream-300 scrollbar-track-transparent -mx-1 px-1">
        {sortedDates.map((date) => {
          const isActive = date === selectedDate;
          return (
            <button
              key={date}
              ref={isActive ? activeBtnRef : null}
              onClick={() => setSelectedDate(date)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-forest-700 text-white shadow-md'
                  : 'bg-cream-100 text-gray-600 hover:bg-cream-200'
              }`}
            >
              {formatDateLabel(date)}
            </button>
          );
        })}
      </div>

      {/* Card for selected date */}
      <div key={selectedDate} className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-lg font-bold text-forest-900">📅 {selectedDate || 'Unknown Date'}</p>
              <p className="text-sm text-gray-500 mt-0.5">📦 {dayOrders.length} orders &nbsp;·&nbsp; ⏳ {pending} Pending Payment &nbsp;·&nbsp; ✅ {paid} Paid</p>
            </div>
          </div>

          {/* Packing Summary */}
          <div className="border-t border-cream-200 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Packing Summary</p>
            <div className="space-y-2">
              {catOrder.map((cat) => {
                const catData = summary[cat];
                if (catData.total === 0) return null;
                const catKey = `${selectedDate}-${cat}`;
                const isCollapsed = collapsedCats[catKey];

                return (
                  <div key={cat} className="bg-cream-50 rounded-xl border border-cream-200 overflow-hidden">
                    <button onClick={() => toggleCat(catKey)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-cream-100/50 transition-colors">
                      <span className="font-semibold text-sm text-gray-800">{isCollapsed ? '▶' : '▼'} {catLabels[cat]} ({catData.total})</span>
                      <span className="text-xs text-gray-400">{isCollapsed ? 'Expand' : 'Collapse'}</span>
                    </button>

                    {!isCollapsed && (
                      <div className="px-4 pb-3 pt-1 space-y-2">
                        {cat === 'chicken' && Object.entries(catData.byPrep)
                          .sort(([a], [b]) => ['whole', 'cut4', 'cut12', 'cut16'].indexOf(a) - ['whole', 'cut4', 'cut12', 'cut16'].indexOf(b))
                          .map(([prep, qty]) => (
                            <div key={prep} className="flex items-center justify-between text-sm pl-2">
                              <span className="text-gray-700">{getPrepLabel(prep as PreparationOption)}</span>
                              <span className="font-semibold text-gray-900">x{qty}</span>
                            </div>
                          ))}

                        {cat === 'fish' && Object.entries(catData.byProduct).map(([prodId, prodData]) => {
                          const fishKey = `${catKey}-${prodId}`;
                          const isFishCollapsed = collapsedFish[fishKey];
                          const prodName = orders.flatMap((o) => o.items).find((i) => i.productId === prodId)?.name || prodId;
                          return (
                            <div key={prodId} className="bg-white rounded-lg border border-cream-200 overflow-hidden">
                              <button onClick={() => toggleFish(fishKey)} className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-cream-50/50 transition-colors">
                                <span className="font-medium text-sm text-gray-800">{isFishCollapsed ? '▶' : '▼'} {prodName}</span>
                                <span className="font-semibold text-sm text-gray-900">x{prodData.total}</span>
                              </button>
                              {!isFishCollapsed && (
                                <div className="px-3 pb-2 space-y-1">
                                  {Object.entries(prodData.byPrep)
                                    .sort(([a], [b]) => ['whole', 'cleaned', 'descaled', 'gutted'].indexOf(a) - ['whole', 'cleaned', 'descaled', 'gutted'].indexOf(b))
                                    .map(([prep, qty]) => (
                                      <div key={prep} className="flex items-center justify-between text-sm pl-3">
                                        <span className="text-gray-600">{getPrepLabel(prep as PreparationOption)}</span>
                                        <span className="font-medium text-gray-800">x{qty}</span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {(cat === 'prawns' || cat === 'squid') && Object.entries(catData.byProduct).map(([prodId, prodData]) => {
                          const prodName = orders.flatMap((o) => o.items).find((i) => i.productId === prodId)?.name || prodId;
                          return (
                            <div key={prodId} className="flex items-center justify-between text-sm pl-2">
                              <span className="text-gray-700">{prodName}</span>
                              <span className="font-semibold text-gray-900">x{prodData.total}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Packing Checklist */}
          <div className="border-t border-cream-200 mt-4 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">📦 Packing Checklist</p>
            <div className="space-y-2">
              {catOrder.map((cat) => {
                const catData = summary[cat];
                if (catData.total === 0) return null;
                const checkKey = `${selectedDate}-${cat}`;
                const checked = checkedCats[checkKey];
                return (
                  <div key={cat} className={`rounded-xl border ${checked ? 'bg-green-50 border-green-200' : 'bg-cream-50 border-cream-200'} overflow-hidden`}>
                    <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none">
                      <input type="checkbox" checked={!!checked} onChange={() => toggleCheck(checkKey)} className="w-4 h-4 rounded border-gray-300 text-forest-600 focus:ring-forest-500" />
                      <span className={`font-semibold text-sm ${checked ? 'text-green-800 line-through' : 'text-gray-800'}`}>{catLabels[cat]} — {catData.total} item{catData.total !== 1 ? 's' : ''}</span>
                    </label>
                    {!checked && (
                      <div className="px-4 pb-3 space-y-1">
                        {cat === 'chicken' && Object.entries(catData.byPrep)
                          .sort(([a], [b]) => ['whole', 'cut4', 'cut12', 'cut16'].indexOf(a) - ['whole', 'cut4', 'cut12', 'cut16'].indexOf(b))
                          .map(([prep, qty]) => (
                            <div key={prep} className="flex items-center justify-between text-sm pl-7">
                              <span className="text-gray-600">{getPrepLabel(prep as PreparationOption)}</span>
                              <span className="font-medium text-gray-800">x{qty}</span>
                            </div>
                          ))}
                        {(cat === 'fish' || cat === 'prawns' || cat === 'squid') && Object.entries(catData.byProduct).map(([prodId, prodData]) => {
                          const prodName = orders.flatMap((o) => o.items).find((i) => i.productId === prodId)?.name || prodId;
                          return (
                            <div key={prodId} className="flex items-center justify-between text-sm pl-7">
                              <span className="text-gray-600">{prodName}</span>
                              <span className="font-medium text-gray-800">x{prodData.total}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary counts */}
          <div className="border-t border-cream-200 mt-4 pt-4 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Orders</span>
              <span className="font-semibold text-gray-900">{dayOrders.length}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Pending Payment</span>
              <span className="font-semibold text-amber-700">{pending}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Paid</span>
              <span className="font-semibold text-green-700">{paid}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Open Orders button */}
      <div className="flex justify-end">
        <button onClick={onOpenOrders} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-forest-700 border border-forest-200 hover:bg-forest-50 transition-all">
          Open Orders <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ----------- Weight entry -----------

function WeightEntryView({
  order,
  onBack,
  onSaved,
}: {
  order: SupplierOrder;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const isLocked = order.paymentStatus === 'Paid';

  const [weights, setWeights] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    order.items.forEach((item, i) => {
      if (!isPerKg(item)) return;
      const existing = order.supplierWeights[String(i)];
      init[String(i)] = existing != null ? String(existing) : '';
    });
    return init;
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const lineTotal = (item: OrderItem, index: number): number => {
    if (!isPerKg(item)) return item.price * item.quantity;
    const kg = parseFloat(weights[String(index)]);
    if (!kg || kg <= 0) return 0;
    return kg * item.price;
  };

  const allWeightsEntered = order.items.every((item, i) => {
    if (!isPerKg(item)) return true;
    const kg = parseFloat(weights[String(i)]);
    return kg > 0;
  });

  const orderTotal =
    order.items.reduce((sum, item, i) => sum + lineTotal(item, i), 0) + order.deliveryFee;

  const handleWeightChange = (index: number, raw: string) => {
    if (raw.startsWith('-')) return;
    setWeights((prev) => ({ ...prev, [String(index)]: raw }));
    setError(null);
  };

  const validate = (): string | null => {
    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      if (!isPerKg(item)) continue;
      const val = weights[String(i)];
      if (!val || val.trim() === '') {
        return `Enter actual weight for "${item.name}".`;
      }
      const n = parseFloat(val);
      if (isNaN(n) || n <= 0) {
        return `Weight for "${item.name}" must be greater than zero.`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    const msg = validate();
    if (msg) { setError(msg); return; }

    setSaving(true);
    setError(null);

    try {
      const supplierWeights: Record<string, number> = {};
      order.items.forEach((item, i) => {
        if (!isPerKg(item)) return;
        supplierWeights[String(i)] = parseFloat(weights[String(i)]);
      });

      const newTotal =
        order.items.reduce((sum, item, i) => {
          if (!isPerKg(item)) return sum + item.price * item.quantity;
          return sum + (supplierWeights[String(i)] ?? 0) * item.price;
        }, 0) + order.deliveryFee;

      const { error: updateError } = await supabase
        .from('Orders')
        .update({
          supplier_weights: supplierWeights,
          total: Math.round(newTotal * 100) / 100,
          payment_status: 'Ready To Pay',
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        })
        .eq('id', order.dbId);

      if (updateError) throw updateError;

      setSaved(true);
      setTimeout(onSaved, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save weights');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-forest-700 mb-6 transition-colors"
      >
        <ChevronLeft size={16} /> Back to Orders
      </button>

      {/* Order header */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5 mb-4">
        <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Order Ref</p>
            <p className="font-mono font-semibold text-gray-900">{order.orderRef}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Customer</p>
            <p className="font-semibold text-gray-900">{order.customerName}</p>
            {order.customerPhone && (
              <p className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                <Phone size={11} /> {order.customerPhone}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Delivery Address</p>
            {order.apartment && <p className="text-gray-600 text-xs">{order.apartment}</p>}
            <p className="flex items-center gap-1 text-xs text-gray-700 font-medium">
              <Home size={11} /> Unit {order.houseUnit || '—'}
            </p>
            <p className="flex items-center gap-1 text-xs text-gray-600 mt-0.5">
              <MapPin size={11} /> {order.pickupLocation || '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Delivery</p>
            <p className="font-semibold text-gray-900">{order.deliveryDate}</p>
            {order.deliveryWindow && <p className="text-xs text-gray-500">{order.deliveryWindow}</p>}
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Payment</p>
            <div className="mt-0.5"><PaymentBadge status={order.paymentStatus} /></div>
          </div>
        </div>
        {order.orderNotes && (
          <div className="mt-3 pt-3 border-t border-cream-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Customer Remarks / Notes</p>
            <p className="text-sm text-gray-700">{order.orderNotes}</p>
          </div>
        )}
      </div>

      {/* Lock notice */}
      {isLocked && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm mb-4">
          <Lock size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Payment has been confirmed.</p>
            <p className="text-green-700 mt-0.5">Weight editing is locked.</p>
          </div>
        </div>
      )}

      {/* Items + weight inputs */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream-50 border-b border-cream-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Product</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Qty</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Price</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Actual Weight (kg)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Item Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {order.items.map((item, i) => {
                const perKg = isPerKg(item);
                const total = lineTotal(item, i);
                const hasComboItems = item.comboItems && item.comboItems.length > 0;
                return (
                  <tr key={`${item.productId}-${i}`} className={`hover:bg-cream-50/50 transition-colors ${hasComboItems ? 'bg-cream-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      {item.preparation && (
                        <p className="text-xs text-gray-400">{getPrepLabel(item.preparation as PreparationOption)}</p>
                      )}
                      {hasComboItems && (
                        <div className="mt-2 pt-2 border-t border-cream-200 space-y-1.5">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contains</p>
                          {item.comboItems!.map((ci) => (
                            <div key={ci.productId} className="flex items-center gap-2 text-xs">
                              <span className="text-gray-700">{ci.label}</span>
                              {ci.preparation && (
                                <span className="text-gray-400">({getPrepLabel(ci.preparation as PreparationOption)})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {!perKg && !hasComboItems && (
                        <p className="text-xs text-jade-600 font-medium mt-0.5">Fixed price</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.quantity}</td>
                    <td className="px-4 py-3 text-gray-600">
                      RM{item.price.toFixed(2)}{perKg ? '/kg' : ''}
                    </td>
                    <td className="px-4 py-3">
                      {perKg && !hasComboItems ? (
                        <div>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={weights[String(i)] ?? ''}
                            onChange={(e) => handleWeightChange(i, e.target.value)}
                            placeholder="e.g. 0.82"
                            readOnly={isLocked}
                            className={`input-field w-32 text-sm ${isLocked ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
                          />
                          {!weights[String(i)] && !isLocked && (
                            <p className="text-xs text-amber-600 mt-1">Final price will be confirmed after weighing.</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {perKg && !hasComboItems && !weights[String(i)] ? (
                        <span className="text-amber-600">≈ RM{(item.price * item.quantity).toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-900">
                          {total > 0 ? `RM${total.toFixed(2)}` : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-cream-200 px-4 py-3 space-y-1.5">
          {!allWeightsEntered && (
            <p className="text-xs text-amber-700 mb-2">
              Final total will be confirmed after all weights are entered.
            </p>
          )}
          <div className="flex justify-between text-sm text-gray-600">
            <span>Delivery Fee</span>
            <span>{order.deliveryFee === 0 ? 'FREE' : `RM${order.deliveryFee.toFixed(2)}`}</span>
          </div>
          <div className="flex justify-between font-bold text-base">
            <span>Order Total</span>
            <span className="text-forest-800">RM{orderTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm mb-4 animate-[fadeSlideUp_0.2s_ease-out]">
          <AlertCircle size={18} className="flex-shrink-0" /> {error}
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm mb-4 animate-[fadeSlideUp_0.2s_ease-out]">
          <CheckCircle2 size={18} /> Weights saved. Payment status updated to Ready To Pay.
        </div>
      )}

      {!isLocked && !saved && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {saving ? 'Saving...' : 'Save Weights'}
          </button>
        </div>
      )}
    </div>
  );
}
