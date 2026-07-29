import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Loader2, ChevronLeft, ChevronUp, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Scale, Lock, Phone, Home, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { supabase } from '../lib/supabase';
import type { PaymentStatus, ComboExpandedItem } from '../types';

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
  paidAt: string | null;
}

// ----------- Helpers -----------

const isPerKg = (item: OrderItem): boolean => {
  if (item.pricingType !== undefined) return item.pricingType === 'per_kg';
  if (item.unit === 'per kg') return true;
  if (item.unit === 'per bird' || item.comboId) return false;
  return true;
};

const orderRequiresWeighing = (order: SupplierOrder): boolean => {
  return order.items.some(item => isPerKg(item));
};

// Derive workflow status from database fields (not local state)
function getOrderStatus(order: SupplierOrder): 'pending' | 'in_progress' | 'completed' {
  if (order.paymentStatus === 'Paid' || order.paymentStatus === 'Ready To Pay') return 'completed';
  // If supplier has started weighing (has some weights) but not all per-kg items are weighed
  const perKgIndices = order.items
    .map((item, i) => ({ item, index: i }))
    .filter(({ item }) => isPerKg(item))
    .map(({ index }) => index);
  if (perKgIndices.length > 0) {
    const weighedCount = perKgIndices.filter(i => order.supplierWeights[String(i)] != null).length;
    if (weighedCount > 0 && weighedCount < perKgIndices.length) return 'in_progress';
    if (weighedCount === perKgIndices.length) return 'completed';
  }
  return 'pending';
}

function formatDateFull(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw || 'Unknown Date';
  return d.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

// ----------- Main page -----------

export default function SupplierDashboardPage() {
  const { t } = useLanguage();
  const { isSupplier, loading: authLoading, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const [view, setView] = useState<'schedule' | 'orders'>(dateParam ? 'orders' : 'schedule');
  const [selected, setSelected] = useState<SupplierOrder | null>(null);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [completionTimes, setCompletionTimes] = useState<Record<number, string>>({});
  const [viewDetailsOrder, setViewDetailsOrder] = useState<SupplierOrder | null>(null);
  const [editMode, setEditMode] = useState(false);

  const handleWeightsSaved = (dbId: number, weights: Record<string, number>) => {
    setOrders(prev => prev.map(o => o.dbId === dbId ? { ...o, supplierWeights: weights } : o));
  };

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('Orders')
        .select('id, full_name, phone_number, apartment, house_unit, pickup_location, order_notes, order_items, order_summary, supplier_weights, delivery_fee, payment_status, paid_at')
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
          paidAt: r.paid_at ?? null,
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

  const [showQueue, setShowQueue] = useState(false);

  const handleStartOrder = async (order: SupplierOrder) => {
    if (order.paymentStatus === 'Paid') return;
    
    if (!orderRequiresWeighing(order)) {
      // Order has only fixed-price items - no weighing needed
      // Immediately update payment_status to 'Ready To Pay'
      const { data, error, count } = await supabase
        .from("Orders")
        .update({
          payment_status: "Ready To Pay",
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        }, { count: "exact" })
        .eq("id", order.dbId)
        .select();

      console.log("Order dbId:", order.dbId);
      console.log("Updated rows:", data);
      console.log("Updated count:", count);
      console.log("Supabase error:", error);

      if (error) {
        alert(t("weightEntry.messages.saveFailed"));
        return;
      }
      // Refresh orders to reflect the change
      loadOrders();
      return;
    }
    
    // Order has per-kg items - go to weight entry
    setSelected(order);
    setShowQueue(false);
  };

  const handleStartPacking = (date: string) => {
    setSearchParams({ date });
    const filtered = orders.filter((o) => o.deliveryDate === date);
    // Find first order that needs weighing (pending or in_progress, not completed/paid)
    const firstPending = filtered.find(
      (o) => getOrderStatus(o) !== 'completed'
    );
    if (firstPending) {
      setSelected(firstPending);
    } else {
      setSelected(null);
    }
    setShowQueue(false);
    setView('orders');
  };

  const handleSaveAndNext = () => {
    if (!selected) return;
    const now = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
    setCompletionTimes(prev => ({ ...prev, [selected.dbId]: now }));
    // No local status update - status is derived from DB
    setEditMode(false);
    setSelected(null);
    setShowQueue(true);
  };

  const handleEditWeight = (order: SupplierOrder) => {
    if (order.paymentStatus === 'Paid') return;
    // No local status update - status is derived from DB
    setSelected(order);
    setEditMode(true);
    setShowQueue(false);
  };

  const handleViewDetails = (order: SupplierOrder | null) => {
    setViewDetailsOrder(order);
  };

  const handleBackToSchedule = () => {
    setSearchParams({});
    setSelected(null);
    setShowQueue(false);
    setView('schedule');
  };

  if (authLoading) {
    return (
      <main className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </main>
    );
  }

  if (!isSupplier) return <Navigate to="/" replace />;

  const baseOrders = dateParam ? orders.filter((o) => o.deliveryDate === dateParam) : orders;
  const totalOrders = baseOrders.length;
  const completedCount = baseOrders.filter(
    (o) => getOrderStatus(o) === 'completed' || o.paymentStatus === 'Ready To Pay' || o.paymentStatus === 'Paid'
  ).length;
  const allDone = totalOrders > 0 && completedCount >= totalOrders;
  const progressPct = totalOrders > 0 ? Math.round((completedCount / totalOrders) * 100) : 0;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {view === 'schedule' ? (
        <>
          <div className="mb-6">
            <h1 className="font-display font-bold text-forest-900 text-[28px]">{t("supplierDashboard.packingDashboard")}</h1>
            <p className="text-gray-500 text-[16px] mt-1">{t("supplierDashboard.prepareProducts")}</p>
          </div>
          <DeliveryScheduleView orders={orders} loading={loading} error={error} defaultDate={dateParam ?? undefined} onOpenOrders={handleStartPacking} onOpenOrder={handleStartOrder} />
        </>
      ) : (
        <>
          {/* Progress bar */}
          {totalOrders > 0 && (
            <div className="mb-6">
              <p className="text-[20px] font-bold text-gray-800 mb-3">{t("supplierDashboard.todaysProgress")}</p>
              <div className="w-full bg-cream-200 rounded-full h-5 overflow-hidden">
                <div className="bg-forest-600 h-5 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="text-[16px] text-gray-500 mt-2 font-medium">{t("supplierDashboard.customersCompleted", { completed: completedCount, total: totalOrders })}</p>
              <div className="flex gap-6 mt-4 text-[15px] font-semibold">
                <span className="text-amber-600">🟡 {t("supplierDashboard.pendingCount", { count: baseOrders.filter((o) => o.status === 'pending' && o.paymentStatus !== 'Ready To Pay' && o.paymentStatus !== 'Paid').length })}</span>
                <span className="text-blue-600">🔵 {t("supplierDashboard.inProgressCount", { count: baseOrders.filter((o) => o.status === 'in_progress').length })}</span>
                <span className="text-green-600">🟢 {t("supplierDashboard.completedCount", { count: completedCount })}</span>
              </div>
            </div>
          )}

          {/* All done screen */}
          {allDone && !selected && !showQueue ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-6xl mb-6">🎉</p>
              <p className="text-[32px] font-bold text-forest-900 mb-3">{t("supplierDashboard.todaysPackingCompleted")}</p>
              <p className="text-[20px] text-gray-500 mb-2">{t("supplierDashboard.ordersCompleted", { completed: completedCount, total: totalOrders })}</p>
              <p className="text-[18px] text-gray-400 mb-10">{t("supplierDashboard.readyForDelivery")}</p>
              <div className="flex flex-col gap-4 w-full max-w-sm">
                <button onClick={() => setShowQueue(true)} className="bg-forest-700 hover:bg-forest-800 text-white rounded-2xl px-10 py-5 text-[18px] font-bold min-h-[60px] transition-all active:scale-[0.97] shadow-lg">
                  {t("supplierDashboard.viewCompletedOrders")}
                </button>
                <button onClick={handleBackToSchedule} className="border-2 border-cream-200 hover:bg-cream-50 text-gray-600 rounded-2xl px-10 py-5 text-[18px] font-bold min-h-[60px] transition-all active:scale-[0.97]">
                  {t("supplierDashboard.backToPackingDashboard")}
                </button>
              </div>
            </div>
          ) : showQueue || (!selected && !allDone) ? (
            /* Queue screen */
            <CustomerQueue
              orders={baseOrders}
              completionTimes={completionTimes}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onStart={handleStartOrder}
              onEditWeight={handleEditWeight}
              onViewDetails={handleViewDetails}
              onBack={handleBackToSchedule}
              onBackToWorkspace={selected ? () => setShowQueue(false) : undefined}
            />
          ) : (
            /* Continuous packing workspace */
            selected && !viewDetailsOrder && (
              <div>
                {/* Queue button */}
                <div className="flex items-center justify-between mb-4">
                  <button onClick={handleBackToSchedule} className="inline-flex items-center gap-1.5 text-[16px] text-gray-500 hover:text-forest-700 transition-colors">
                    <ChevronLeft size={20} /> {t("supplierDashboard.backToSchedule")}
                  </button>
                  <button onClick={() => setShowQueue(true)} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-cream-200 text-[16px] font-semibold text-gray-600 hover:bg-cream-50 transition-all active:scale-[0.97] min-h-[60px]">
                    {t("customerQueue.title")}
                  </button>
                </div>
                <WeightEntryView
                  key={selected.dbId}
                  order={selected}
                  editMode={editMode}
                  onBack={() => { setEditMode(false); setShowQueue(true); }}
                  onComplete={() => handleSaveAndNext()}
                  onNext={handleSaveAndNext}
                  onQueue={() => setShowQueue(true)}
                  onWeightsSaved={handleWeightsSaved}
                />
              </div>
            )
          )}

          {/* View Details modal */}
          {viewDetailsOrder && (
            <OrderDetailsView
              order={viewDetailsOrder}
              completionTimes={completionTimes}
              onClose={() => setViewDetailsOrder(null)}
            />
          )}
        </>
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

// ----------- Customer Queue -----------

function CustomerQueue({
  orders,
  completionTimes,
  searchQuery,
  onSearchChange,
  onStart,
  onEditWeight,
  onViewDetails,
  onBack,
  onBackToWorkspace,
}: {
  orders: SupplierOrder[];
  completionTimes: Record<number, string>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onStart: (o: SupplierOrder) => void;
  onEditWeight: (o: SupplierOrder) => void;
  onViewDetails: (o: SupplierOrder) => void;
  onBack: () => void;
  onBackToWorkspace?: () => void;
}) {
  const { t } = useLanguage();
  const [completedOpen, setCompletedOpen] = useState(true);

  const filtered = orders.filter((o) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return o.customerName.toLowerCase().includes(q) || o.orderRef.toLowerCase().includes(q) || o.customerPhone.toLowerCase().includes(q);
  });

  const pendingOrders = filtered.filter((o) => getOrderStatus(o) === 'pending' && o.paymentStatus !== 'Ready To Pay' && o.paymentStatus !== 'Paid');
  const inProgressOrders = filtered.filter((o) => getOrderStatus(o) === 'in_progress');
  const completedOrders = filtered.filter((o) => getOrderStatus(o) === 'completed' || o.paymentStatus === 'Ready To Pay' || o.paymentStatus === 'Paid');

  const statusStyle = (status: string) => {
    const map: Record<string, string> = {
      'Pending': 'bg-red-100 text-red-700',
      'Ready To Pay': 'bg-blue-100 text-blue-700',
      'Paid': 'bg-green-100 text-green-700',
    };
    return map[status] || 'bg-gray-100 text-gray-600';
  };

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      'Pending': t("customerQueue.status.awaitingPacking"),
      'Ready To Pay': t("customerQueue.status.readyToPay"),
      'Paid': t("customerQueue.status.paid"),
    };
    return map[status] || status;
  };

  function renderCard(order: SupplierOrder, index: number, isInProgress?: boolean) {
    const productCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    return (
      <div key={order.dbId} className={`bg-white rounded-2xl border-2 p-6 hover:shadow-lg transition-shadow active:scale-[0.97] ${isInProgress ? 'border-forest-400 shadow-lg' : 'border-cream-200'}`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-[28px] font-bold text-gray-300 tabular-nums">#{index + 1}</span>
            <div>
              <p className="text-[22px] font-bold text-gray-900">{order.customerName}</p>
              <p className="text-[14px] text-gray-500 font-mono mt-0.5">{order.orderRef}</p>
            </div>
          </div>
          <span className={`text-[14px] font-semibold px-3 py-1.5 rounded-full ${statusStyle(order.paymentStatus)}`}>
            {statusLabel(order.paymentStatus)}
          </span>
        </div>

        <div className="space-y-2 mb-5">
          <p className="text-[18px] text-gray-700">📍 {order.pickupLocation || '—'}</p>
          {order.houseUnit && <p className="text-[18px] text-gray-700">🏠 {t("supplierCard.unit")} {order.houseUnit}</p>}
          <p className="text-[18px] font-semibold text-gray-800">{productCount} {t("supplierCard.products")}</p>
        </div>

        {isInProgress ? (
          <div className="w-full bg-amber-100 text-amber-800 rounded-xl py-4 px-5 text-[18px] font-bold text-center min-h-[60px] flex items-center justify-center">
            {t("customerQueue.messages.weighingInProgress")}
          </div>
        ) : (
          <button onClick={() => onStart(order)} className="w-full bg-forest-700 hover:bg-forest-800 text-white rounded-xl py-4 text-[18px] font-bold min-h-[60px] transition-all active:scale-[0.97]">
            {t("supplierCard.buttons.start")}
          </button>
        )}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <>
        {onBackToWorkspace ? (
          <button onClick={onBackToWorkspace} className="inline-flex items-center gap-1.5 text-[16px] text-gray-500 hover:text-forest-700 mb-6 transition-colors">
            <ChevronLeft size={20} /> {t("customerQueue.buttons.back")}
          </button>
        ) : (
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[16px] text-gray-500 hover:text-forest-700 mb-6 transition-colors">
            <ChevronLeft size={20} /> {t("customerQueue.buttons.back")}
          </button>
        )}
        <div className="text-center py-20">
          <Scale size={56} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-[20px]">{t("customerQueue.messages.noOrders")}</p>
        </div>
      </>
    );
  }

  return (
    <>
      {onBackToWorkspace ? (
        <button onClick={onBackToWorkspace} className="inline-flex items-center gap-1.5 text-[16px] text-gray-500 hover:text-forest-700 mb-6 transition-colors">
            <ChevronLeft size={20} /> {t("customerQueue.buttons.back")}
          </button>
        ) : (
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[16px] text-gray-500 hover:text-forest-700 mb-6 transition-colors">
            <ChevronLeft size={20} /> {t("customerQueue.buttons.back")}
          </button>
        )}

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("customerQueue.messages.searchPlaceholder")}
          className="w-full rounded-xl border-2 border-cream-200 p-4 text-[18px] focus:outline-none focus:border-forest-400 transition-colors"
        />
      </div>

      {/* 🔵 In Progress section */}
      {inProgressOrders.length > 0 && (
        <div className="mb-8">
          <p className="text-[20px] font-bold text-blue-700 mb-4 flex items-center gap-2">🔵 {t("customerQueue.inProgress")} ({inProgressOrders.length})</p>
          <div className="space-y-4">
            {inProgressOrders.map((order) => renderCard(order, 0, true))}
          </div>
        </div>
      )}

      {/* 🟡 Pending section */}
      <div className="mb-8">
        <p className="text-[20px] font-bold text-amber-600 mb-4">🟡 {t("customerQueue.pending")} ({pendingOrders.length})</p>
        {pendingOrders.length === 0 ? (
          <p className="text-gray-400 text-[18px]">{t("customerQueue.messages.noPending")}</p>
        ) : (
          <div className="space-y-4">
            {pendingOrders.map((order, i) => renderCard(order, i))}
          </div>
        )}
      </div>

      {/* 🟢 Completed section */}
      {completedOrders.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setCompletedOpen(!completedOpen)}
            className="w-full flex items-center justify-between text-[20px] font-bold text-green-700 mb-4"
          >
            <span>🟢 {t("customerQueue.completed")} ({completedOrders.length})</span>
            {completedOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </button>
          {completedOpen && (
            <div className="space-y-4">
              {completedOrders.map((order, i) => (
                <div key={order.dbId} className="bg-white rounded-2xl border-2 border-green-200 p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      <span className="text-[28px] font-bold text-green-300 tabular-nums">#{i + 1}</span>
                      <div>
                        <p className="text-[22px] font-bold text-gray-900">{order.customerName}</p>
                        <p className="text-[14px] text-gray-500 font-mono mt-0.5">{order.orderRef}</p>
                      </div>
                    </div>
                    <span className="text-[14px] font-semibold px-3 py-1.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
                      ✅ {order.paymentStatus === 'Paid' ? t("customerQueue.status.paid") : t("customerQueue.status.readyToPay")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-[16px] text-gray-600 ml-1 mb-4">
                    <span>📍 {order.pickupLocation || '—'}</span>
                    {order.houseUnit && <span>🏠 Unit {order.houseUnit}</span>}
                    {completionTimes[order.dbId] && <span>⏰ {t("customerQueue.messages.completedAt", { time: completionTimes[order.dbId] })}</span>}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => onViewDetails(order)} className="flex-1 border-2 border-cream-200 rounded-xl py-3 text-[16px] font-semibold text-gray-600 min-h-[50px] hover:bg-cream-50 transition-all active:scale-[0.97]">
                      {t("customerQueue.buttons.viewCustomer")}
                    </button>
                    {order.paymentStatus === 'Paid' ? (
                      <button disabled className="flex-1 border-2 border-green-200 rounded-xl py-3 text-[16px] font-semibold text-green-600 min-h-[50px] bg-green-50 cursor-not-allowed">
                        {t("customerQueue.buttons.locked")}
                      </button>
                    ) : (
                      <button onClick={() => onEditWeight(order)} className="flex-1 border-2 border-amber-300 rounded-xl py-3 text-[16px] font-semibold text-amber-700 min-h-[50px] hover:bg-amber-50 transition-all active:scale-[0.97]">
                        {t("customerQueue.buttons.editWeight")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ----------- Delivery Schedule View -----------

function DeliveryScheduleView({ orders, loading, error, defaultDate, onOpenOrders, onOpenOrder }: { orders: SupplierOrder[]; loading: boolean; error: string | null; defaultDate?: string; onOpenOrders: (date: string) => void; onOpenOrder: (o: SupplierOrder) => void }) {
  const { t } = useLanguage();
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const toggleCheckItem = (id: string) => setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));

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

  const [selectedDate, setSelectedDate] = useState('');
  const sliderRef = useRef<HTMLDivElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'Pending' | 'Ready To Pay' | 'Paid' | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (selectedDate && sliderRef.current && activeBtnRef.current) {
      const container = sliderRef.current;
      const btn = activeBtnRef.current;
      const scrollLeft = btn.offsetLeft - container.offsetLeft - container.clientWidth / 2 + btn.clientWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
    }
  }, [selectedDate]);

  useEffect(() => {
    if (sortedDates.length === 0) {
      setSelectedDate('');
      return;
    }
    if (defaultDate && sortedDates.includes(defaultDate)) {
      setSelectedDate(defaultDate);
      return;
    }
    if (selectedDate && sortedDates.includes(selectedDate)) {
      return;
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const upcoming = sortedDates.find((d) => new Date(d).getTime() >= now.getTime());
    setSelectedDate(upcoming ?? sortedDates[sortedDates.length - 1]);
  }, [sortedDates, defaultDate, selectedDate]);

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

  if (sortedDates.length === 0) {
    return (
      <div className="text-center py-20">
        <Scale size={48} className="mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">{t("deliverySchedule.messages.noDeliveries")}</p>
      </div>
    );
  }

  const dayOrders = dateGroups[selectedDate] ?? [];
  const pendingCount = dayOrders.filter((o) => o.paymentStatus === 'Pending').length;
  const readyToPayCount = dayOrders.filter((o) => o.paymentStatus === 'Ready To Pay').length;
  const paidCount = dayOrders.filter((o) => o.paymentStatus === 'Paid').length;
  const summary = buildPackingSummary(dayOrders);
  const catOrder = ['chicken', 'fish', 'prawns', 'squid'] as const;
  const catLabels: Record<string, string> = { chicken: t("packingSummary.categories.chicken"), fish: t("packingSummary.categories.fish"), prawns: t("packingSummary.categories.prawns"), squid: t("packingSummary.categories.squid") };

  function buildChecklistItems() {
    const items: { id: string; label: string; quantity: number }[] = [];
    const prepOrder = ['whole', 'cut4', 'cut12', 'cut16'] as const;
    const fishPrepOrder = ['whole', 'cleaned', 'descaled', 'gutted'] as const;
    for (const cat of catOrder) {
      const catData = summary[cat];
      if (catData.total === 0) continue;
      if (cat === 'chicken') {
        for (const prep of prepOrder) {
          const qty = catData.byPrep[prep];
          if (qty) items.push({ id: `${selectedDate}-${cat}-${prep}`, label: `${t("cartItem.preparation." + prep)} ${catLabels[cat]}`, quantity: qty });
        }
      } else if (cat === 'fish') {
        for (const [prodId, prodData] of Object.entries(catData.byProduct)) {
          const prodName = orders.flatMap((o) => o.items).find((i) => i.productId === prodId)?.name || prodId;
          for (const prep of fishPrepOrder) {
            const qty = prodData.byPrep[prep];
            if (qty) items.push({ id: `${selectedDate}-${cat}-${prodId}-${prep}`, label: `${t("cartItem.preparation." + prep)} ${prodName}`, quantity: qty });
          }
        }
      } else {
        for (const [prodId, prodData] of Object.entries(catData.byProduct)) {
          const prodName = orders.flatMap((o) => o.items).find((i) => i.productId === prodId)?.name || prodId;
          items.push({ id: `${selectedDate}-${cat}-${prodId}`, label: prodName, quantity: prodData.total });
        }
      }
    }
    return items;
  }
  const checklistItems = buildChecklistItems();
  const uniqueCustomers = new Set(dayOrders.map((o) => o.customerName)).size;
  const locationGroups = dayOrders.reduce<Record<string, number>>((acc, o) => {
    const loc = o.pickupLocation || 'Unknown';
    acc[loc] = (acc[loc] || 0) + 1;
    return acc;
  }, {});

  function formatDateLabel(raw: string): string {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
  }

  return (
    <div className="space-y-10 max-w-3xl mx-auto lg:max-w-6xl">
      {/* Date slider */}
      <div ref={sliderRef} className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-cream-300 scrollbar-track-transparent -mx-1 px-1">
        {sortedDates.map((date) => {
          const isActive = date === selectedDate;
          return (
            <button
              key={date}
              ref={isActive ? activeBtnRef : null}
              onClick={() => setSelectedDate(date)}
              className={`flex-shrink-0 px-5 py-3 rounded-xl text-[18px] font-semibold transition-all whitespace-nowrap min-h-[60px] ${
                isActive
                  ? 'bg-forest-700 text-white shadow-md'
                  : 'bg-cream-100 text-gray-600 hover:bg-cream-200 active:scale-95'
              }`}
            >
              {formatDateLabel(date)}
            </button>
          );
        })}
      </div>

      {/* Header */}
      <div className="text-center">
        <p className="text-[34px] font-bold text-forest-900">{t("deliverySchedule.title")}</p>
        <p className="text-[24px] font-bold text-gray-700 mt-1">
          {(() => { try { return new Date(selectedDate).toLocaleDateString('en-MY', { weekday: 'long' }); } catch { return ''; } })()}
        </p>
        <p className="text-[22px] text-gray-500 font-medium">{formatDateFull(selectedDate)}</p>
        <p className="text-[20px] text-gray-700 font-semibold mt-3">{t("deliverySchedule.labels.ordersToday", { count: dayOrders.length })}</p>
      </div>

      {/* Section 1: Today's Overview */}
      <div>
        <p className="text-[24px] font-bold text-gray-800 mb-5">{t("deliverySchedule.sections.summary")}</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: t("deliverySchedule.summary.orders"), value: dayOrders.length, emoji: '📦', color: 'text-forest-700', filter: 'all' as const },
            { label: t("deliverySchedule.summary.pending"), value: pendingCount, emoji: '⏳', color: 'text-orange-600', filter: 'Pending' as const },
            { label: t("deliverySchedule.summary.ready"), value: readyToPayCount, emoji: '💬', color: 'text-sky-600', filter: 'Ready To Pay' as const },
            { label: t("deliverySchedule.summary.completed"), value: paidCount, emoji: '✅', color: 'text-green-600', filter: 'Paid' as const },
          ].map((s) => (
            <button
              key={s.label}
              onClick={() => { setFilterStatus(s.filter); setModalOpen(true); }}
              className="bg-white rounded-2xl border-2 border-cream-200 p-6 text-center hover:shadow-lg transition-all active:scale-[0.97] hover:border-forest-300 cursor-pointer"
            >
              <p className="text-4xl mb-1">{s.emoji}</p>
              <p className={`text-[32px] font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[16px] text-gray-500 font-medium mt-1">{s.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Sections 2+3: Packing Summary + Checklist — side by side on desktop */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-8 space-y-8 lg:space-y-0">
        {/* Packing Summary */}
        <div>
          <p className="text-[24px] font-bold text-gray-800 mb-5">{t("packingSummary.title")}</p>
          <div className="grid gap-5">
            {catOrder.map((cat) => {
              const catData = summary[cat];
              if (catData.total === 0) return null;
              const colorMap: Record<string, string> = {
                chicken: 'bg-amber-50 border-amber-300',
                fish: 'bg-sky-50 border-sky-300',
                prawns: 'bg-orange-50 border-orange-300',
                squid: 'bg-purple-50 border-purple-300',
              };
              const badgeMap: Record<string, string> = {
                chicken: 'bg-amber-200 text-amber-800',
                fish: 'bg-sky-200 text-sky-800',
                prawns: 'bg-orange-200 text-orange-800',
                squid: 'bg-purple-200 text-purple-800',
              };
              return (
                <div key={cat} className={`rounded-2xl border-2 p-6 hover:shadow-lg transition-shadow active:scale-[0.97] ${colorMap[cat]}`}>
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-[22px] font-bold text-gray-900">{catLabels[cat]}</span>
                    <span className={`text-[16px] font-bold px-3 py-1.5 rounded-full ${badgeMap[cat]}`}>{catData.total} {catData.total === 1 ? t("packingSummary.labels.item") : t("packingSummary.labels.items")}</span>
                  </div>
                  <div className="space-y-3">
                    {cat === 'chicken' && Object.entries(catData.byPrep)
                      .sort(([a], [b]) => ['whole', 'cut4', 'cut12', 'cut16'].indexOf(a) - ['whole', 'cut4', 'cut12', 'cut16'].indexOf(b))
                      .map(([prep, qty]) => (
                        <div key={prep} className="flex items-center justify-between">
                          <span className="text-[18px] font-medium text-gray-800">{t("packingSummary.preparation." + prep)}</span>
                          <span className="text-[24px] font-bold text-gray-900">x{qty}</span>
                        </div>
                      ))}
                    {cat === 'fish' && Object.entries(catData.byProduct).map(([prodId, prodData]) => {
                      const prodName = orders.flatMap((o) => o.items).find((i) => i.productId === prodId)?.name || prodId;
                      return (
                        <div key={prodId}>
                          <p className="text-[18px] font-bold text-gray-900 mb-2">{prodName}</p>
                          <div className="ml-4 space-y-2">
                            {Object.entries(prodData.byPrep)
                              .sort(([a], [b]) => ['whole', 'cleaned', 'descaled', 'gutted'].indexOf(a) - ['whole', 'cleaned', 'descaled', 'gutted'].indexOf(b))
                              .map(([prep, qty]) => (
                                <div key={prep} className="flex items-center justify-between">
                                  <span className="text-[16px] text-gray-700">{t("packingSummary.preparation." + prep)}</span>
                                  <span className="text-[20px] font-bold text-gray-900">x{qty}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      );
                    })}
                    {(cat === 'prawns' || cat === 'squid') && Object.entries(catData.byProduct).map(([prodId, prodData]) => {
                      const prodName = orders.flatMap((o) => o.items).find((i) => i.productId === prodId)?.name || prodId;
                      return (
                        <div key={prodId} className="flex items-center justify-between">
                          <span className="text-[18px] font-medium text-gray-800">{prodName}</span>
                          <span className="text-[24px] font-bold text-gray-900">x{prodData.total}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Packing Checklist */}
        <div>
          <p className="text-[24px] font-bold text-gray-800 mb-5">{t("packingChecklist.title")}</p>
          <div className="bg-white rounded-2xl border-2 border-cream-200 p-6 space-y-1">
            {checklistItems.length === 0 ? (
              <p className="text-gray-400 text-[18px]">{t("packingChecklist.messages.noProducts")}</p>
            ) : (
              checklistItems.map((item) => (
                <label key={item.id} className="flex items-center gap-4 cursor-pointer select-none min-h-[60px] hover:bg-cream-50 rounded-xl px-3 -mx-3 transition-colors active:scale-[0.97]">
                  <input type="checkbox" checked={!!checkedItems[item.id]} onChange={() => toggleCheckItem(item.id)} className="w-6 h-6 rounded border-gray-300 text-forest-600 focus:ring-forest-500" />
                  <span className={`text-[18px] font-medium ${checkedItems[item.id] ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.label}</span>
                  <span className={`ml-auto text-[24px] font-bold ${checkedItems[item.id] ? 'text-gray-400 line-through' : 'text-gray-900'}`}>x{item.quantity}</span>
                </label>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Section 4: Delivery Location Summary */}
      <div>
        <p className="text-[24px] font-bold text-gray-800 mb-5">{t("deliverySchedule.sections.locations")}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(locationGroups)
            .sort(([, a], [, b]) => b - a)
            .map(([loc, count]) => (
              <div key={loc} className="bg-white rounded-2xl border-2 border-cream-200 p-6 hover:shadow-lg transition-shadow active:scale-[0.97]">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">📍</span>
                  <div>
                    <p className="text-[18px] font-bold text-gray-900">{loc}</p>
                    <p className="text-[16px] text-gray-500 font-medium">{t("deliverySchedule.labels.orderCount", { count })}</p>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Section 5: Start Packing */}
      <button onClick={() => onOpenOrders(selectedDate)} className="w-full bg-forest-700 hover:bg-forest-800 text-white rounded-2xl p-7 text-left transition-all shadow-lg hover:shadow-xl min-h-[72px] active:scale-[0.97] group">
        <div className="flex items-center gap-5">
          <span className="text-4xl">📦</span>
          <div>
            <p className="text-[22px] font-bold group-hover:translate-x-1 transition-transform">{t("deliverySchedule.buttons.startPacking")}</p>
            <p className="text-forest-200 text-[18px] mt-1.5 font-medium">{t("deliverySchedule.messages.readyToProcess", { count: uniqueCustomers })}</p>
          </div>
          <ChevronRight size={32} className="ml-auto text-forest-200 group-hover:translate-x-1 transition-transform" />
        </div>
      </button>

      {/* Order filter modal */}
      {modalOpen && (
        <OrderFilterModal
          orders={dayOrders}
          filterStatus={filterStatus ?? 'all'}
          selectedDate={selectedDate}
          onClose={() => setModalOpen(false)}
          onOpenOrder={onOpenOrder}
        />
      )}
    </div>
  );
}

// ----------- Order Filter Modal -----------

function OrderFilterModal({ orders, filterStatus, selectedDate, onClose, onOpenOrder }: {
  orders: SupplierOrder[];
  filterStatus: 'all' | 'Pending' | 'Ready To Pay' | 'Paid';
  selectedDate: string;
  onClose: () => void;
  onOpenOrder: (o: SupplierOrder) => void;
}) {
  const { t } = useLanguage();
  const filteredOrders = orders.filter((o) => filterStatus === 'all' || o.paymentStatus === filterStatus);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleCard = (dbId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(dbId)) next.delete(dbId); else next.add(dbId);
      return next;
    });
  };

  const titleMap: Record<string, string> = {
    all: t("deliverySchedule.filters.all"),
    Pending: t("deliverySchedule.filters.pending"),
    'Ready To Pay': t("deliverySchedule.filters.ready"),
    Paid: t("deliverySchedule.filters.paid"),
  };

  const formatTime = (raw: string | null): string => {
    if (!raw) return '—';
    try {
      return new Date(raw).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  };

  const calcTotal = (order: SupplierOrder): number => {
    const itemsTotal = order.items.reduce((sum, item, i) => {
      if (!isPerKg(item)) return sum + item.price * item.quantity;
      const kg = order.supplierWeights[String(i)];
      if (!kg || kg <= 0) return sum;
      return sum + kg * item.price;
    }, 0);
    return itemsTotal + order.deliveryFee;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-6 pb-12 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-cream-200 flex items-start justify-between sticky top-0 bg-white z-10">
          <div>
            <p className="text-[24px] font-bold text-forest-900">{titleMap[filterStatus]}</p>
            <p className="text-[16px] text-gray-500 font-medium mt-1">{formatDateFull(selectedDate)}</p>
            <p className="text-[14px] text-gray-400 mt-0.5">{t("deliverySchedule.labels.filterOrderCount", { count: filteredOrders.length })}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-cream-50 rounded-xl transition-colors text-gray-400 hover:text-gray-700 text-[24px] leading-none">✕</button>
        </div>

        {/* Order list */}
        <div className="p-4 space-y-3">
          {filteredOrders.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-[18px]">{t("deliverySchedule.messages.noOrders")}</p>
          ) : (
            filteredOrders.map((order) => {
              const open = expandedIds.has(order.dbId);
              const actualTotal = calcTotal(order);
              return (
                <div key={order.dbId} className="bg-cream-50 rounded-2xl border border-cream-200 overflow-hidden transition-all">
                  {/* Collapsed header */}
                  <button onClick={() => toggleCard(order.dbId)} className="w-full text-left p-5 hover:bg-cream-100 transition-colors active:scale-[0.99]">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <span className="text-[24px] font-bold text-gray-300 tabular-nums mt-0.5">#</span>
                        <div>
                          <p className="text-[20px] font-bold text-gray-900">{order.customerName}</p>
                          <p className="text-[13px] text-gray-500 font-mono mt-0.5">{order.orderRef}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <PaymentBadge status={order.paymentStatus} />
                        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>
                          <ChevronDown size={20} className="text-gray-400" />
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-gray-600 mt-3 ml-1">
                      <span>📍 {order.pickupLocation || '—'}</span>
                      {order.houseUnit && <span>🏠 Unit {order.houseUnit}</span>}
                      {order.paymentStatus === 'Paid' && <span>✅ Paid at {formatTime(order.paidAt)}</span>}
                    </div>
                  </button>

                  {/* Expanded content */}
                  {open && (
                    <div className="px-5 pb-5 space-y-4 border-t border-cream-200 pt-4">
                      {/* Products */}
                      <div>
                        <p className="text-[15px] font-bold text-gray-700 mb-3">{t("deliverySchedule.labels.products")}</p>
                        <div className="space-y-3">
                          {order.items.map((item, i) => {
                            const perKg = isPerKg(item);
                            const weight = order.supplierWeights[String(i)];
                            const subtotal = perKg
                              ? (weight ? weight * item.price : item.price * item.quantity)
                              : item.price * item.quantity;
                            const hasComboItems = item.comboItems && item.comboItems.length > 0;

                            return (
                              <div key={`${item.productId}-${i}`} className="bg-white rounded-xl border border-cream-200 p-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-baseline gap-2">
                                      <p className="text-[16px] font-bold text-gray-900">{item.name}</p>
                                      <span className="text-[14px] text-gray-500">x{item.quantity}</span>
                                    </div>
                                    {item.preparation && (
                                      <p className="text-[13px] text-gray-500 mt-0.5">{t("cartItem.preparation." + item.preparation)}</p>
                                    )}
                                    {perKg && weight != null && (
                                      <p className="text-[13px] text-forest-700 font-semibold mt-0.5">Weight: {weight.toFixed(2)} kg</p>
                                    )}
                                    {perKg && weight == null && (
                                      <p className="text-[13px] text-amber-600 mt-0.5">{t("deliverySchedule.messages.weightNotEntered")}</p>
                                    )}
                                  </div>
                                  <p className="text-[16px] font-bold text-gray-900 whitespace-nowrap ml-4">RM{subtotal.toFixed(2)}</p>
                                </div>

                                {/* Combo items */}
                                {hasComboItems && (
                                  <div className="mt-3 ml-2 pl-3 border-l-2 border-forest-200 space-y-2">
                                    <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">{t("deliverySchedule.labels.contains")}</p>
                                    {item.comboItems!.map((ci) => (
                                      <div key={ci.productId}>
                                        <p className="text-[14px] font-semibold text-gray-800">• {ci.label}</p>
                                        {ci.preparation && (
                                          <p className="text-[13px] text-gray-500 ml-3">{t("cartItem.preparation." + ci.preparation)}</p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Totals */}
                      <div className="bg-white rounded-xl border border-cream-200 p-4 space-y-1.5">
                        <div className="flex justify-between text-[14px] text-gray-600">
                          <span>{t("deliverySchedule.labels.deliveryFee")}</span>
                          <span className="font-semibold">{order.deliveryFee === 0 ? t("deliverySchedule.messages.free") : `RM${order.deliveryFee.toFixed(2)}`}</span>
                        </div>
                        <div className="flex justify-between text-[18px] font-bold">
                          <span>{t("deliverySchedule.labels.actualTotal")}</span>
                          <span className="text-forest-800">RM{actualTotal.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Buttons */}
                      <div className="flex gap-3">
                        <button onClick={() => onOpenOrder(order)} className="flex-1 bg-forest-700 hover:bg-forest-800 text-white rounded-xl py-3 text-[15px] font-bold min-h-[50px] transition-all active:scale-[0.97]">
                          {t("deliverySchedule.buttons.viewOrder")}
                        </button>
                        <button disabled className="flex-1 border-2 border-cream-200 rounded-xl py-3 text-[15px] font-semibold text-gray-400 min-h-[50px] cursor-not-allowed">
                          {t("deliverySchedule.buttons.viewReceipt")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ----------- Weight entry -----------

function WeightEntryView({
  order,
  onBack,
  onComplete,
  onNext,
  onQueue,
  editMode,
  onWeightsSaved,
}: {
  order: SupplierOrder;
  onBack: () => void;
  onComplete: () => void;
  onNext: () => void;
  onQueue?: () => void;
  editMode?: boolean;
  onWeightsSaved?: (dbId: number, weights: Record<string, number>) => void;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isLocked = order.paymentStatus === 'Paid';
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const perKgItems = order.items.map((item, i) => ({ item, index: i, perKg: isPerKg(item) }));

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
  const initiallySaved = new Set(order.items.map((_, i) => i).filter((i) => !isPerKg(order.items[i]) || order.supplierWeights[String(i)] != null));
  const [savedProducts, setSavedProducts] = useState<Set<number>>(initiallySaved);
  const [completed, setCompleted] = useState(() => {
    if (editMode) return false;
    return order.items.every((item, i) => !isPerKg(item) || order.supplierWeights[String(i)] != null);
  });
  const [lastSavedIndex, setLastSavedIndex] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (editMode) {
      return order.items.findIndex((item, i) => isPerKg(item));
    }
    return order.items.findIndex((item, i) => isPerKg(item) && order.supplierWeights[String(i)] == null);
  });

  // BUG 3 fix: reset completed when editMode changes without remount
  useEffect(() => {
    if (editMode) {
      setCompleted(false);
    }
  }, [editMode]);

  const lineTotal = (item: OrderItem, index: number): number => {
    if (!isPerKg(item)) return item.price * item.quantity;
    const kg = parseFloat(weights[String(index)]);
    if (!kg || kg <= 0) return 0;
    return kg * item.price;
  };

  const orderTotal =
    order.items.reduce((sum, item, i) => sum + lineTotal(item, i), 0) + order.deliveryFee;

  const handleWeightChange = (index: number, raw: string) => {
    if (raw.startsWith('-')) return;
    setWeights((prev) => ({ ...prev, [String(index)]: raw }));
    setError(null);
  };

  const saveCurrentProduct = async (index: number) => {
    if (isLocked) {
      setError(t("weightEntry.messages.orderLocked"));
      return;
    }
    const item = order.items[index];
    if (!isPerKg(item)) {
      setSavedProducts((prev) => new Set(prev).add(index));
      return;
    }

    const val = weights[String(index)];
    if (!val || val.trim() === '') {
      setError(t("weightEntry.validation.required", { name: item.name }));
      return;
    }
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) {
      setError(t("weightEntry.validation.zero", { name: item.name }));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const allWeights: Record<string, number> = {};
      order.items.forEach((item, i) => {
        if (!isPerKg(item)) return;
        if (i === index) {
          allWeights[String(i)] = n;
        } else if (savedProducts.has(i)) {
          const w = parseFloat(weights[String(i)]);
          allWeights[String(i)] = !isNaN(w) && w > 0 ? w : (order.supplierWeights[String(i)] ?? 0);
        } else if (order.supplierWeights[String(i)] != null) {
          allWeights[String(i)] = order.supplierWeights[String(i)];
        }
      });

      const newTotal =
        order.items.reduce((sum, item, i) => {
          if (!isPerKg(item)) return sum + item.price * item.quantity;
          return sum + (allWeights[String(i)] ?? 0) * item.price;
        }, 0) + order.deliveryFee;

      const allSaved = order.items.every((item, i) => {
        if (!isPerKg(item)) return true;
        return savedProducts.has(i) || i === index;
      });

      const { error: updateError } = await supabase
        .from('Orders')
        .update({
          supplier_weights: allWeights,
          total: Math.round(newTotal * 100) / 100,
          ...(editMode ? {} : { payment_status: allSaved ? 'Ready To Pay' : 'Pending' }),
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        })
        .eq('id', order.dbId);

      if (updateError) throw updateError;

      onWeightsSaved?.(order.dbId, allWeights);

      if (editMode && allSaved) {
        onComplete?.();
        return;
      }

      const newSaved = new Set(savedProducts).add(index);
      setSavedProducts(newSaved);
      setLastSavedIndex(index);
      setTimeout(() => setLastSavedIndex(null), 1500);

      if (allSaved) {
        setCompleted(true);
      } else {
        const next = order.items.findIndex((item, i) => isPerKg(item) && !newSaved.has(i));
        if (next >= 0) {
          setCurrentIndex(next);
          setTimeout(() => {
            inputRefs.current[next]?.focus();
            inputRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("weightEntry.messages.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  // Completed screen
  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
          <CheckCircle2 size={48} className="text-green-600" />
        </div>
        <p className="text-[28px] font-bold text-green-700 mb-2">{editMode ? t("weightEntry.buttons.completed") : t("weightEntry.messages.saved")}</p>
        <p className="text-[18px] text-gray-500 mb-2">{order.customerName}</p>
        <p className="text-[16px] text-gray-400 mb-10">{editMode ? t("weightEntry.messages.weightSavedMsg") : t("weightEntry.messages.allSavedMsg")}</p>
        <div className="flex flex-col gap-4 w-full max-w-md">
          <button onClick={onNext} className="w-full bg-forest-700 hover:bg-forest-800 text-white rounded-xl py-5 text-[20px] font-bold min-h-[60px] transition-all active:scale-[0.97] shadow-lg">
            {editMode ? t("weightEntry.buttons.back") + " ➡" : t("weightEntry.buttons.continue") + " ➡"}
          </button>
          <div className="flex gap-4">
            {onQueue && (
              <button onClick={onQueue} className="flex-1 border-2 border-cream-200 rounded-xl py-4 text-[18px] font-bold text-gray-600 min-h-[60px] hover:bg-cream-50 transition-all active:scale-[0.97]">
                {t("weightEntry.buttons.queue")}
              </button>
            )}
            <button onClick={onBack} className="flex-1 border-2 border-cream-200 rounded-xl py-4 text-[18px] font-bold text-gray-600 min-h-[60px] hover:bg-cream-50 transition-all active:scale-[0.97]">
              {t("weightEntry.buttons.back")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[16px] text-gray-500 hover:text-forest-700 mb-6 transition-colors">
        <ChevronLeft size={20} /> {t("weightEntry.buttons.back")}
      </button>

      {/* Customer header card */}
      <div className="bg-white rounded-2xl border-2 border-forest-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[22px] font-bold text-gray-900">{order.customerName}</p>
            <p className="text-[14px] text-gray-500 font-mono mt-1">{order.orderRef}</p>
          </div>
          <span className={`text-[14px] font-semibold px-3 py-1.5 rounded-full whitespace-nowrap ${completed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {completed ? t("weightEntry.messages.saved") : t("weightEntry.summary.pending", { count: perKgItems.filter((p) => p.perKg && !savedProducts.has(p.index)).length })}
          </span>
        </div>
        <div className="flex flex-wrap gap-4 mt-4 text-[16px] text-gray-600">
          <span>📍 {order.pickupLocation || '—'}</span>
          {order.houseUnit && <span>🏠 {t("supplierCard.unit")} {order.houseUnit}</span>}
          <span>📦 {order.orderRef}</span>
        </div>
        {order.orderNotes && (
          <div className="mt-4 pt-4 border-t border-cream-200">
            <p className="text-[14px] font-semibold text-gray-500 mb-1">{t("supplierCard.orderNotes")}</p>
            <p className="text-[16px] text-gray-700">{order.orderNotes}</p>
          </div>
        )}
      </div>

      {/* Lock notice */}
      {isLocked && (
        <div className="flex items-start gap-3 p-5 bg-green-50 border-2 border-green-200 rounded-2xl text-green-800 text-[16px] mb-6">
          <Lock size={24} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">{t("weightEntry.messages.orderLockedTitle")}</p>
            <p className="text-green-700 mt-1">{t("weightEntry.messages.orderLockedMsg")}</p>
          </div>
        </div>
      )}

      {/* Progress indicator */}
      <div className="flex items-center gap-3 mb-6">
        {perKgItems.filter((p) => p.perKg).map((p, i, arr) => {
          const done = savedProducts.has(p.index);
          const active = currentIndex === p.index;
          return (
            <div key={p.index} className="flex items-center gap-1">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-bold ${
                done ? 'bg-green-500 text-white' : active ? 'bg-forest-600 text-white' : 'bg-cream-200 text-gray-500'
              }`}>
                {done ? '✓' : i + 1}
              </span>
              {i < arr.length - 1 && <div className={`h-1 w-6 rounded ${done ? 'bg-green-400' : 'bg-cream-200'}`} />}
            </div>
          );
        })}
      </div>

      {/* Product cards */}
      <div className="space-y-4 mb-6">
        {order.items.map((item, i) => {
          const perKgFlag = isPerKg(item);
          const isActive = currentIndex === i;
          const isDone = savedProducts.has(i);
          const hasComboItems = item.comboItems && item.comboItems.length > 0;
          const total = lineTotal(item, i);
          const weight = weights[String(i)];

          return (
            <div
              key={`${item.productId}-${i}`}
              className={`rounded-2xl border-2 p-5 transition-all ${
                isDone ? 'bg-green-50 border-green-300' : isActive ? 'bg-white border-forest-400 shadow-md' : 'bg-white border-cream-200'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-[20px] font-bold text-gray-900">{item.name}</p>
                  {item.preparation && (
                    <p className="text-[16px] text-gray-500 mt-0.5">{t("cartItem.preparation." + item.preparation)}</p>
                  )}
                  {hasComboItems && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[13px] font-semibold text-gray-500 uppercase">{t("supplierDashboard.contains")}</p>
                      {item.comboItems!.map((ci) => (
                        <p key={ci.productId} className="text-[14px] text-gray-600">
                          {ci.label}{ci.preparation ? ` (${t("cartItem.preparation." + ci.preparation)})` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                {isDone && <CheckCircle2 size={28} className="text-green-500 flex-shrink-0" />}
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-[16px] text-gray-600">x{item.quantity}</span>
                <span className="text-[16px] text-gray-600">
                  RM{item.price.toFixed(2)}{perKgFlag ? '/kg' : ''}
                </span>

                {perKgFlag && !hasComboItems ? (
                  <div className="flex items-center gap-3 ml-auto">
                    <input
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={weight ?? ''}
                      onChange={(e) => handleWeightChange(i, e.target.value)}
                      placeholder={t("weightEntry.input.placeholder")}
                      readOnly={isLocked || (isDone && !editMode)}
                      className={`w-24 rounded-xl border-2 p-3 text-[18px] text-center focus:outline-none focus:border-forest-400 transition-colors ${
                        isLocked || (isDone && !editMode) ? 'bg-gray-50 text-gray-400' : 'bg-white'
                      }`}
                    />
                        {isActive && !isLocked && (editMode || !isDone) && (
                      <button
                        onClick={() => saveCurrentProduct(i)}
                        disabled={saving}
                        className="bg-forest-700 hover:bg-forest-800 text-white rounded-xl px-6 py-3 text-[16px] font-bold min-h-[60px] transition-all active:scale-[0.97] disabled:opacity-50 whitespace-nowrap"
                      >
                        {saving ? <Loader2 size={20} className="animate-spin" /> : t("weightEntry.buttons.save")}
                      </button>
                    )}
                    {isDone && (
                      <div className="flex items-center gap-3">
                        {lastSavedIndex === i && (
                          <span className="text-[16px] text-green-600 font-semibold animate-[fadeSlideUp_0.3s_ease-out]">{t("weightEntry.messages.saved")}</span>
                        )}
                        <span className="text-[18px] font-bold text-green-700">
                          RM{total.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-[16px] font-semibold text-green-600 whitespace-nowrap">{t("weightEntry.helper.fixedPrice")}</span>
                    <span className="text-[18px] font-bold text-green-700">
                      RM{total.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {perKgFlag && !hasComboItems && !weight && !isDone && !isLocked && (
                <p className="text-[14px] text-amber-600 mt-2">{t("weightEntry.helper.autoCalculation")}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="bg-white rounded-2xl border-2 border-cream-200 p-5 mb-6 space-y-2">
        <div className="flex justify-between text-[18px] text-gray-600">
          <span>{t("weightEntry.labels.deliveryFee")}</span>
          <span className="font-semibold">{order.deliveryFee === 0 ? t("weightEntry.labels.free") : `RM${order.deliveryFee.toFixed(2)}`}</span>
        </div>
        <div className="flex justify-between text-[22px] font-bold">
          <span>{t("weightEntry.labels.grandTotal")}</span>
          <span className="text-forest-800">RM{orderTotal.toFixed(2)}</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-5 bg-red-50 border-2 border-red-200 rounded-2xl text-red-600 text-[16px] mb-6">
          <AlertCircle size={24} className="flex-shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}

// ----------- Order Details View (read-only) -----------

function OrderDetailsView({ order, completionTimes, onClose }: { order: SupplierOrder; completionTimes: Record<number, string>; onClose: () => void }) {
  const { t } = useLanguage();
  const lineTotal = (item: OrderItem, weights: Record<string, number>): number => {
    if (item.pricingType === 'fixed' || item.unit === 'per bird' || item.comboId) {
      return item.price * item.quantity;
    }
    const kg = weights[String(order.items.indexOf(item))];
    if (!kg || kg <= 0) return 0;
    return kg * item.price;
  };

  const orderTotal = order.items.reduce((sum, item) => sum + lineTotal(item, order.supplierWeights), 0) + order.deliveryFee;

  const completionTime = completionTimes[order.dbId];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-6 pb-12 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-cream-200 flex items-start justify-between">
          <div>
            <p className="text-[24px] font-bold text-gray-900">{order.customerName}</p>
            <p className="text-[14px] text-gray-500 font-mono mt-0.5">{order.orderRef}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-cream-50 rounded-xl transition-colors text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Customer Information */}
          <div>
            <p className="text-[18px] font-bold text-gray-800 mb-3">{t("supplierOrder.sections.customerInfo")}</p>
            <div className="grid grid-cols-2 gap-3 text-[16px]">
              {order.customerPhone && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone size={18} /> {order.customerPhone}
                </div>
              )}
              {order.apartment && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Home size={18} /> {order.apartment}
                </div>
              )}
              {order.houseUnit && (
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPin size={18} /> {t("supplierOrder.labels.unit", { unit: order.houseUnit })}
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-600 col-span-2">
                <MapPin size={18} /> {t("supplierOrder.labels.pickupLocation", { location: order.pickupLocation || '—' })}
              </div>
            </div>
          </div>

          {/* Order Notes */}
          {order.orderNotes && (
            <div>
              <p className="text-[18px] font-bold text-gray-800 mb-2">{t("supplierOrder.sections.orderNotes")}</p>
              <p className="text-[16px] text-gray-600 bg-cream-50 rounded-xl p-4">{order.orderNotes}</p>
            </div>
          )}

          {/* Products */}
          <div>
            <p className="text-[18px] font-bold text-gray-800 mb-3">{t("supplierOrder.sections.products")}</p>
            <div className="space-y-3">
              {order.items.map((item, i) => {
                const perKg = isPerKg(item);
                const weight = order.supplierWeights[String(i)];
                const total = perKg
                  ? (weight ? weight * item.price : 0)
                  : item.price * item.quantity;

                return (
                  <div key={`${item.productId}-${i}`} className="bg-cream-50 rounded-2xl p-4 border border-cream-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[18px] font-bold text-gray-900">{item.name}</p>
                        <p className="text-[14px] text-gray-500">{t("supplierOrder.labels.qtyLine", { qty: item.quantity, price: item.price.toFixed(2), suffix: perKg ? t("supplierOrder.labels.perKg") : '' })}</p>
                      </div>
                      <p className="text-[18px] font-bold text-gray-900">RM{total.toFixed(2)}</p>
                    </div>
                    {item.preparation && (
                      <p className="text-[14px] text-gray-500 mt-1">{t("supplierOrder.labels.preparation", { prep: t("cartItem.preparation." + item.preparation) })}</p>
                    )}
                    {perKg && (
                      <p className="text-[16px] font-semibold text-forest-700 mt-1">
                        {t("supplierOrder.labels.actualWeight", { weight: weight != null ? `${weight.toFixed(2)} kg` : '—' })}
                      </p>
                    )}
                    {!perKg && (
                      <p className="text-[14px] text-green-600 mt-1">{t("supplierOrder.labels.fixedPrice")}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals & Payment */}
          <div className="bg-white rounded-2xl border-2 border-cream-200 p-5 space-y-2">
            <div className="flex justify-between text-[16px] text-gray-600">
            <span>{t("supplierOrder.labels.deliveryFee")}</span>
            <span>{order.deliveryFee === 0 ? t("supplierOrder.messages.free") : `RM${order.deliveryFee.toFixed(2)}`}</span>
          </div>
          <div className="flex justify-between text-[22px] font-bold">
            <span>{t("supplierOrder.labels.grandTotal")}</span>
              <span className="text-forest-800">RM{orderTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Status & Completion Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[14px] font-semibold text-gray-500 mb-1">{t("supplierOrder.labels.paymentStatus")}</p>
              <PaymentBadge status={order.paymentStatus} />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-gray-500 mb-1">{t("supplierOrder.labels.completionTime")}</p>
              <p className="text-[16px] text-gray-800 font-semibold">{completionTime || '—'}</p>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-cream-200 flex justify-end">
          <button onClick={onClose} className="px-8 py-3 bg-forest-700 hover:bg-forest-800 text-white rounded-xl text-[16px] font-bold min-h-[50px] transition-all active:scale-[0.97]">
            {t("supplierOrder.buttons.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
