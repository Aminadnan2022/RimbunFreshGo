import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, ChevronLeft, AlertCircle, CheckCircle2, Scale, Lock, Phone, Home, MapPin } from 'lucide-react';
import { getPrepLabel } from '../lib/preparationOptions';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { PaymentStatus, PreparationOption } from '../types';

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
  const [selected, setSelected] = useState<SupplierOrder | null>(null);

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
        <h1 className="font-display font-bold text-forest-900 text-2xl">Supplier Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Orders and weight entry</p>
      </div>

      {selected ? (
        <WeightEntryView
          order={selected}
          onBack={() => setSelected(null)}
          onSaved={() => setSelected(null)}
        />
      ) : (
        <OrderListView onOpen={setSelected} />
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

function OrderListView({ onOpen }: { onOpen: (o: SupplierOrder) => void }) {
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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

      // Sort: deliveryDate → pickupLocation → customerName
      mapped.sort((a, b) => {
        const dateA = new Date(a.deliveryDate).getTime();
        const dateB = new Date(b.deliveryDate).getTime();
        if (!isNaN(dateA) && !isNaN(dateB) && dateA !== dateB) return dateA - dateB;
        const locCmp = a.pickupLocation.localeCompare(b.pickupLocation);
        if (locCmp !== 0) return locCmp;
        return a.customerName.localeCompare(b.customerName);
      });

      setOrders(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  if (orders.length === 0) {
    return (
      <div className="text-center py-20">
        <Scale size={48} className="mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">No orders found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-cream-50 border-b border-cream-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Order Ref</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Customer</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">Pickup Location</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Delivery Date</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Payment</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100">
            {orders.map((order) => (
              <tr key={order.dbId} className="hover:bg-cream-50/50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-900">{order.orderRef}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{order.customerName}</p>
                  {order.customerPhone && <p className="text-xs text-gray-400">{order.customerPhone}</p>}
                  {order.houseUnit && <p className="text-xs text-gray-400">Unit {order.houseUnit}</p>}
                </td>
                <td className="px-4 py-3 text-gray-600 hidden sm:table-cell text-xs">{order.pickupLocation || '—'}</td>
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{order.deliveryDate}</td>
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
                return (
                  <tr key={`${item.productId}-${i}`} className="hover:bg-cream-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      {item.preparation && (
                        <p className="text-xs text-gray-400">{getPrepLabel(item.preparation as PreparationOption)}</p>
                      )}
                      {!perKg && (
                        <p className="text-xs text-jade-600 font-medium mt-0.5">Fixed price</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.quantity}</td>
                    <td className="px-4 py-3 text-gray-600">
                      RM{item.price.toFixed(2)}{perKg ? '/kg' : ''}
                    </td>
                    <td className="px-4 py-3">
                      {perKg ? (
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
                      {perKg && !weights[String(i)] ? (
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
