import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Loader2, ChevronLeft, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Scale, Lock, Phone, Home, MapPin, PackageCheck, Package, Truck, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';
import { orderGrossProfit, orderCost, marginPercent } from '../lib/profit';
import { formatLocalDate } from '../data/delivery';
import SupplierDispatchSection from '../components/supplier/SupplierDispatchSection';
import {
  supplierStartPacking,
  supplierCompletePacking,
  supplierBookLalamoveForOrder,
} from '../data/deliveryBatches';
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
interface CanonicalLineUnit {
  id: string;
  unitNumber: number;
  actualWeightKg?: number;
}

interface OrderItem {
  productId: string;
  canonicalLineId?: string;
  canonicalUnits?: CanonicalLineUnit[];
  name: string;
  price: number;
  unit: string;
  quantity: number;
  preparation?: string;
  pricingType?: 'per_kg' | 'fixed' | 'slice';
  comboId?: string;
  comboItems?: ComboExpandedItem[];
  sliceQuantity?: number;
  sliceUnit?: string;
  orderingMode?: string;
  /** Supplier unit cost snapshot (RM per kg / per piece) frozen at checkout. */
  costPrice?: number;
  /** Supplier name snapshot for profit reports. */
  supplierName?: string;
}

interface OrderSummary {
  deliveryDate?: string;
  deliveryWindow?: string;
  statusTimeline?: { status: string; time: string; done: boolean }[];
  orderRef?: string;
}

interface SupplierOrder {
  source: 'legacy' | 'canonical';
  dbId: string;
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
  canonicalPriceStatus: 'estimated' | 'final' | null;
  orderNotes: string;
  paidAt: string | null;
  packingStartedAt: string | null;
  packingCompletedAt: string | null;
  supplierDispatchStartedAt: string | null;
  supplierDispatchCompletedAt: string | null;
  readyForRiderAt: string | null;
  lalamoveTrackingUrl: string | null;
  bookingReference: string | null;
  lalamoveBookedAt: string | null;
}

// ----------- Helpers -----------

const isPerKg = (item: OrderItem): boolean => {
  if (item.pricingType !== undefined) return item.pricingType === 'per_kg';
  if (item.unit === 'per kg') return true;
  if (item.unit === 'per bird' || item.comboId) return false;
  return true;
};

const isSliceItem = (item: OrderItem): boolean =>
  item.pricingType === 'slice' || item.sliceQuantity != null || item.orderingMode === 'slice';

const needsWeighing = (item: OrderItem): boolean => isPerKg(item) || isSliceItem(item);

const orderRequiresWeighing = (order: SupplierOrder): boolean => {
  return order.items.some(item => needsWeighing(item));
};

const canonicalPreparationCode = (code: string | null | undefined): string | undefined => {
  if (!code) return undefined;
  const aliases: Record<string, string> = {
    cut_4: 'cut4',
    cut_12: 'cut12',
    cut_16: 'cut16',
    cut_24: 'cut24',
  };
  return aliases[code] ?? code;
};

const canonicalPaymentStatus = (status: string | null | undefined): PaymentStatus =>
  status === 'paid' ? 'Paid' : 'Pending';

const canonicalPricingType = (
  orderingMode: string | null | undefined
): OrderItem['pricingType'] => {
  if (orderingMode === 'slice') return 'slice';
  if (orderingMode === 'weight_only' || orderingMode === 'whole_fish_by_weight') {
    return 'per_kg';
  }
  return 'fixed';
};

const hasAllWeightsSubmitted = (order: SupplierOrder): boolean => {
  const perKgIndices = order.items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => needsWeighing(item));

  if (perKgIndices.length === 0) return true;

  return perKgIndices.every(({ i }) => order.supplierWeights[String(i)] != null);
};

function formatDateFull(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw || 'Unknown Date';
  return d.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateShort(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Convert a human-readable Checkout delivery date (e.g. "Wednesday, 5 August 2026")
 * into ISO YYYY-MM-DD. If already ISO, returns it unchanged. Returns '' when unparseable.
 */
function toISODate(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^.*?,\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return '';
  const day = Number(m[1]);
  const monthStr = m[2];
  const year = Number(m[3]);
  const monthIdx = ['January','February','March','April','May','June','July','August','September','October','November','December'].indexOf(monthStr);
  if (monthIdx === -1) return '';
  const mm = String(monthIdx + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Delivery day for an order, always ISO YYYY-MM-DD.
 * Source of truth: the checkout's order_summary.deliveryDate converted to ISO.
 * Delivery batches NEVER determine an order's delivery day.
 */
function getOrderDeliveryDate(order: SupplierOrder): string {
  return order.deliveryDate;
}

// ----------- Main page -----------

export default function SupplierDashboardPage() {
  const { t } = useLanguage();
  const { isSupplier, loading: authLoading, user } = useAuth();
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const [view, setView] = useState<'working' | 'schedule'>('working');
  const [selectedDate, setSelectedDate] = useState(dateParam ?? formatLocalDate(new Date()));
  const [selected, setSelected] = useState<SupplierOrder | null>(null);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [completionTimes, setCompletionTimes] = useState<Record<string, string>>({});
  const [viewDetailsOrder, setViewDetailsOrder] = useState<SupplierOrder | null>(null);
  const [editMode, setEditMode] = useState(false);

  const handleWeightsSaved = (dbId: string, weights: Record<string, number>) => {
    setOrders(prev => prev.map(o => {
      if (o.dbId !== dbId) return o;

      if (o.source === 'canonical') {
        return { ...o, supplierWeights: weights };
      }

      const perKgIndices = o.items.map((item, i) => ({ item, i })).filter(({ item }) => needsWeighing(item));
      const allSaved = perKgIndices.length > 0 && perKgIndices.every(({ i }) => weights[String(i)] != null);

      return {
        ...o,
        supplierWeights: weights,
        paymentStatus: allSaved ? 'Ready To Pay' : o.paymentStatus,
      };
    }));
  };

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const [
        legacyOrderRes,
        canonicalOrderRes,
        canonicalLineRes,
        canonicalUnitRes,
        canonicalAnswerRes,
        canonicalFulfilmentRes,
      ] = await Promise.all([
        supabase
          .from('Orders')
          .select('id, full_name, phone_number, apartment, house_unit, pickup_location, order_notes, order_items, order_summary, supplier_weights, delivery_fee, payment_status, paid_at, packing_started_at, packing_completed_at, supplier_dispatch_started_at, supplier_dispatch_completed_at, ready_for_rider_at, lalamove_tracking_url, booking_reference, lalamove_booked_at, created_at')
          .order('created_at', { ascending: false }),

        supabase
          .from('sales_orders')
          .select('id, order_number, customer_snapshot, delivery_snapshot, delivery_fee, payment_status, price_status, paid_at, created_at')
          .order('created_at', { ascending: false }),

        supabase
          .from('sales_order_lines')
          .select('id, sales_order_id, line_number, product_id, product_snapshot, quantity, selling_unit, unit_selling_price, unit_cost_price, supplier_snapshot, ordering_mode, actual_weight_kg, item_kind')
          .order('line_number', { ascending: true }),

        supabase
          .from('sales_order_line_units')
          .select('id, sales_order_line_id, unit_number, actual_weight_kg')
          .order('unit_number', { ascending: true }),

        supabase
          .from('sales_order_preparation_answers')
          .select('sales_order_line_id, sales_order_line_component_id, option_code, question_code'),

        supabase
          .from('sales_order_supplier_fulfilments')
          .select('sales_order_id, supplier_id, status, packing_started_at, packing_completed_at'),
      ]);

      if (legacyOrderRes.error) throw legacyOrderRes.error;
      if (canonicalOrderRes.error) throw canonicalOrderRes.error;
      if (canonicalLineRes.error) throw canonicalLineRes.error;
      if (canonicalUnitRes.error) throw canonicalUnitRes.error;
      if (canonicalAnswerRes.error) throw canonicalAnswerRes.error;
      if (canonicalFulfilmentRes.error) throw canonicalFulfilmentRes.error;

      const legacyMapped: SupplierOrder[] = (legacyOrderRes.data ?? []).map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = row as any;
        const summary: OrderSummary = r.order_summary ?? {};
        const deliveryDate = toISODate(summary.deliveryDate ?? '');

        return {
          source: 'legacy',
          dbId: String(r.id),
          orderRef: summary.orderRef ?? String(r.id),
          customerName: r.full_name,
          customerPhone: r.phone_number ?? '',
          apartment: r.apartment ?? '',
          houseUnit: r.house_unit ?? '',
          pickupLocation: r.pickup_location ?? '',
          deliveryDate,
          deliveryWindow: summary.deliveryWindow ?? '',
          items: (r.order_items as OrderItem[]) ?? [],
          summary,
          supplierWeights: (r.supplier_weights as Record<string, number>) ?? {},
          deliveryFee: Number(r.delivery_fee ?? 0),
          paymentStatus: (r.payment_status as PaymentStatus) ?? 'Pending',
          canonicalPriceStatus: null,
          orderNotes: r.order_notes ?? '',
          paidAt: r.paid_at ?? null,
          packingStartedAt: r.packing_started_at ?? null,
          packingCompletedAt: r.packing_completed_at ?? null,
          supplierDispatchStartedAt: r.supplier_dispatch_started_at ?? null,
          supplierDispatchCompletedAt: r.supplier_dispatch_completed_at ?? null,
          readyForRiderAt: r.ready_for_rider_at ?? null,
          lalamoveTrackingUrl: r.lalamove_tracking_url ?? null,
          bookingReference: r.booking_reference ?? null,
          lalamoveBookedAt: r.lalamove_booked_at ?? null,
        };
      });

      // Canonical child tables are already supplier-scoped by Phase 4C.1 RLS.
      // Do not client-filter all suppliers' rows.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canonicalLines = (canonicalLineRes.data ?? []) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canonicalUnits = (canonicalUnitRes.data ?? []) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canonicalAnswers = (canonicalAnswerRes.data ?? []) as any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canonicalFulfilments = (canonicalFulfilmentRes.data ?? []) as any[];

      const fulfilmentsByOrder = new Map<string, any[]>();
      canonicalFulfilments.forEach((fulfilment) => {
        const key = String(fulfilment.sales_order_id);
        const list = fulfilmentsByOrder.get(key) ?? [];
        list.push(fulfilment);
        fulfilmentsByOrder.set(key, list);
      });

      const answersByLine = new Map<string, string>();
      canonicalAnswers.forEach((answer) => {
        if (answer.sales_order_line_component_id != null) return;
        if (!answer.sales_order_line_id || !answer.option_code) return;
        if (!answersByLine.has(String(answer.sales_order_line_id))) {
          answersByLine.set(
            String(answer.sales_order_line_id),
            canonicalPreparationCode(String(answer.option_code)) ?? String(answer.option_code),
          );
        }
      });

      const unitsByLine = new Map<string, any[]>();
      canonicalUnits.forEach((unit) => {
        const key = String(unit.sales_order_line_id);
        const list = unitsByLine.get(key) ?? [];
        list.push(unit);
        unitsByLine.set(key, list);
      });

      const linesByOrder = new Map<string, any[]>();
      canonicalLines.forEach((line) => {
        // Phase 4C.1 read bridge currently maps direct product lines only.
        // Combo parent/component mapping will be added from a real canonical
        // combo test row rather than inferred from legacy vendor structures.
        if (line.item_kind !== 'product') return;

        const key = String(line.sales_order_id);
        const list = linesByOrder.get(key) ?? [];
        list.push(line);
        linesByOrder.set(key, list);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canonicalMapped: SupplierOrder[] = ((canonicalOrderRes.data ?? []) as any[])
        .map((row) => {
          const ownedLines = linesByOrder.get(String(row.id)) ?? [];

          // A combo-only order may be visible at order level due component
          // ownership, but Phase 4C.1 does not fabricate its UI item mapping.
          if (ownedLines.length === 0) return null;

          const customer = row.customer_snapshot ?? {};
          const delivery = row.delivery_snapshot ?? {};
          const supplierWeights: Record<string, number> = {};

          const fulfilments = fulfilmentsByOrder.get(String(row.id)) ?? [];

          const startedTimes = fulfilments
            .map((f) => f.packing_started_at)
            .filter(Boolean)
            .map(String);

          const completedTimes = fulfilments
            .map((f) => f.packing_completed_at)
            .filter(Boolean)
            .map(String);

          const packingStartedAt =
            startedTimes.length > 0
              ? startedTimes.sort()[0]
              : null;

          const packingCompletedAt =
            fulfilments.length > 0 &&
            fulfilments.every((f) => f.status === 'packed' && f.packing_completed_at)
              ? completedTimes.sort().at(-1) ?? null
              : null;

          const items: OrderItem[] = ownedLines
            .sort((a, b) => Number(a.line_number) - Number(b.line_number))
            .map((line, index) => {
              let actualWeight: number | undefined;

              if (line.actual_weight_kg != null) {
                actualWeight = Number(line.actual_weight_kg);
              } else {
                const units = unitsByLine.get(String(line.id)) ?? [];
                const weights = units
                  .map((unit) => unit.actual_weight_kg)
                  .filter((value) => value != null)
                  .map(Number);

                if (weights.length > 0 && weights.length === units.length) {
                  actualWeight = weights.reduce((sum, value) => sum + value, 0);
                }
              }

              if (actualWeight != null && Number.isFinite(actualWeight) && actualWeight > 0) {
                supplierWeights[String(index)] = actualWeight;
              }

              const snapshot = line.product_snapshot ?? {};
              const canonicalUnits: CanonicalLineUnit[] = (
                unitsByLine.get(String(line.id)) ?? []
              ).map((unit) => ({
                id: String(unit.id),
                unitNumber: Number(unit.unit_number),
                actualWeightKg:
                  unit.actual_weight_kg != null
                    ? Number(unit.actual_weight_kg)
                    : undefined,
              }));

              return {
                productId: String(line.product_id ?? ''),
                canonicalLineId: String(line.id),
                canonicalUnits,
                name: String(snapshot.name ?? line.product_id ?? 'Product'),
                price: Number(line.unit_selling_price ?? 0),
                unit:
                  line.ordering_mode === 'fixed_quantity'
                    ? (snapshot.category === 'chicken' ? 'per bird' : String(line.selling_unit ?? 'piece'))
                    : 'per kg',
                quantity: Number(line.quantity ?? 0),
                preparation: answersByLine.get(String(line.id)),
                pricingType: canonicalPricingType(line.ordering_mode),
                orderingMode: String(line.ordering_mode ?? ''),
                costPrice: Number(line.unit_cost_price ?? 0),
              };
            });

          const summary: OrderSummary = {
            orderRef: String(row.order_number),
            deliveryDate: String(delivery.requested_date ?? ''),
            deliveryWindow: '',
          };

          return {
            source: 'canonical' as const,
            dbId: String(row.id),
            orderRef: String(row.order_number),
            customerName: String(customer.name ?? ''),
            customerPhone: String(customer.phone ?? ''),
            apartment: String(delivery.apartment ?? delivery.zone_name ?? ''),
            houseUnit: String(delivery.house_unit ?? ''),
            pickupLocation: String(
              delivery.pickup_location ??
              delivery.delivery_point_name ??
              delivery.zone_name ??
              ''
            ),
            deliveryDate: toISODate(String(delivery.requested_date ?? '')),
            deliveryWindow: '',
            items,
            summary,
            supplierWeights,
            deliveryFee: Number(row.delivery_fee ?? delivery.fee_amount ?? 0),
            paymentStatus: canonicalPaymentStatus(row.payment_status),
            canonicalPriceStatus: row.price_status === 'final' ? 'final' : 'estimated',
            orderNotes: String(customer.notes ?? ''),
            paidAt: row.paid_at ?? null,

            // Canonical packing state is supplier-scoped. Dispatch remains
            // separate from the legacy per-order Lalamove workflow.
            packingStartedAt,
            packingCompletedAt,
            supplierDispatchStartedAt: null,
            supplierDispatchCompletedAt: null,
            readyForRiderAt: null,
            lalamoveTrackingUrl: null,
            bookingReference: null,
            lalamoveBookedAt: null,
          };
        })
        .filter((order): order is SupplierOrder => order !== null);

      const merged = [...canonicalMapped, ...legacyMapped];

      setOrders(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Refresh orders on the same interval so packing state updates appear after
  // a supplier action without a full page reload.
  useEffect(() => {
    const id = setInterval(() => { loadOrders(true); }, 30000);
    return () => clearInterval(id);
  }, [loadOrders]);

  const handleStartOrder = async (order: SupplierOrder) => {
    if (order.source === 'canonical') {
      setEditMode(false);
      setSelected(order);
      return;
    }
    if (order.paymentStatus === 'Paid') return;
    setEditMode(false);

    if (!orderRequiresWeighing(order)) {
      // Order has only fixed-price items - no weighing needed
      // Immediately update payment_status to 'Ready To Pay'
      const { error: updateError } = await supabase
        .from("Orders")
        .update({
          payment_status: "Ready To Pay",
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        }, { count: "exact" })
        .eq("id", order.dbId);

      if (updateError) {
        alert(t("weightEntry.messages.saveFailed"));
        return;
      }
      // Refresh orders to reflect the change
      loadOrders();
      return;
    }

    // Order has per-kg items - go to weight entry
    setSelected(order);
  };

  const handleSaveAndNext = () => {
    if (!selected) return;
    const now = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
    setCompletionTimes(prev => ({ ...prev, [selected.dbId]: now }));
    // No local status update - status is derived from DB
    setEditMode(false);
    setSelected(null);
  };

  const handleEditWeight = (order: SupplierOrder) => {
    if (order.source === 'canonical') {
      setSelected(order);
      setEditMode(true);
      return;
    }
    if (order.paymentStatus === 'Paid') return;
    // No local status update - status is derived from DB
    setSelected(order);
    setEditMode(true);
  };

  const handleViewDetails = (order: SupplierOrder | null) => {
    setViewDetailsOrder(order);
  };

  const handlePrepareOrder = async (order: SupplierOrder) => {
    try {
      if (order.source === 'canonical') {
        const { error: rpcError } = await supabase.rpc(
          'supplier_start_canonical_packing',
          { p_sales_order_id: order.dbId }
        );

        if (rpcError) throw rpcError;
      } else {
        await supplierStartPacking(String(order.dbId));
      }

      await loadOrders(true);
    } catch (err) {
      console.error('[SupplierDashboard:startPacking]', err);

      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message ?? '')
          : t("weightEntry.messages.saveFailed");

      alert(message || t("weightEntry.messages.saveFailed"));
    }
  };

  const handleCompletePacking = async (order: SupplierOrder) => {
    try {
      if (order.source === 'canonical') {
        const { error: rpcError } = await supabase.rpc(
          'supplier_complete_canonical_packing',
          { p_sales_order_id: order.dbId }
        );

        if (rpcError) throw rpcError;
      } else {
        await supplierCompletePacking(String(order.dbId));
      }

      await loadOrders(true);
    } catch (err) {
      console.error('[SupplierDashboard:completePacking]', err);

      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message ?? '')
          : t("weightEntry.messages.saveFailed");

      alert(message || t("weightEntry.messages.saveFailed"));
    }
  };

  const handleStartDispatch = async (order: SupplierOrder, trackingUrl: string, bookingReference: string) => {
    if (order.source === 'canonical') {
      alert('Canonical supplier dispatch actions are not enabled yet.');
      return;
    }
    try {
      await supplierBookLalamoveForOrder(String(order.dbId), trackingUrl, bookingReference);
      await Promise.all([loadOrders(true)]);
    } catch (err) {
      console.error('[SupplierDashboard:startDispatch]', err);
      alert(t("weightEntry.messages.saveFailed"));
    }
  };

  const availableDates = useMemo(() => {
    return Array.from(new Set(orders.map((o) => getOrderDeliveryDate(o)).filter((d) => d)))
      .sort((a, b) => {
        const da = new Date(a).getTime();
        const db = new Date(b).getTime();
        if (!isNaN(da) && !isNaN(db)) return da - db;
        return a.localeCompare(b);
      });
  }, [orders]);

  // Default the Working Dashboard to a delivery date that actually has orders:
  // 1. URL date param is honored (applied in useState init)
  // 2. Otherwise, once orders load, pick the first available delivery date
  //    (past or future — never today's calendar date unless it has orders).
  useEffect(() => {
    if (orders.length === 0) return;
    if (dateParam) return;
    if (availableDates.includes(selectedDate)) return;
    if (availableDates.length > 0) setSelectedDate(availableDates[0]);
  }, [availableDates, dateParam, orders.length, selectedDate]);

  if (authLoading) {
    return (
      <main className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </main>
    );
  }

  if (!isSupplier) return <Navigate to="/" replace />;
console.log("========== DEBUG ==========");
console.log("selectedDate =", JSON.stringify(selectedDate));
console.log("availableDates =", availableDates);

orders.forEach((o) => {
  console.log({
    ref: o.orderRef,
    deliveryDate: JSON.stringify(o.deliveryDate),
    paymentStatus: o.paymentStatus,
    packingStartedAt: o.packingStartedAt,
    packingCompletedAt: o.packingCompletedAt,
    match: o.deliveryDate === selectedDate
  });
});
  const dayOrders = orders.filter((o) => getOrderDeliveryDate(o) === selectedDate);
  const filteredDayOrders = dayOrders.filter((o) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return o.customerName.toLowerCase().includes(q) || o.orderRef.toLowerCase().includes(q) || o.customerPhone.toLowerCase().includes(q);
  });

  // eslint-disable-next-line no-console
  console.log("selectedDate", selectedDate);
  // eslint-disable-next-line no-console
  console.log("dayOrders", dayOrders.map(o => ({ ref: o.orderRef, deliveryDate: getOrderDeliveryDate(o) })));
  dayOrders.forEach((o) => {
    if (!(getOrderDeliveryDate(o) === selectedDate)) {
      // eslint-disable-next-line no-console
      console.log(`Order ${o.orderRef} excluded from dayOrders because: selectedDate=${selectedDate} orderDeliveryDate=${getOrderDeliveryDate(o)}`);
    }
  });

  const toggleBtn = (active: boolean) =>
    `px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
      active ? 'bg-forest-700 text-white shadow-md' : 'bg-cream-100 text-gray-600 hover:bg-cream-200'
    }`;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header + view toggle */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-forest-900 text-[28px]">{t("supplierDashboard.packingDashboard")}</h1>
          <p className="text-gray-500 text-[16px] mt-1">{t("supplierDashboard.prepareProducts")}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('working')} className={toggleBtn(view === 'working')}>{t("supplierDashboard.dashboardTab")}</button>
          <button onClick={() => setView('schedule')} className={toggleBtn(view === 'schedule')}>{t("supplierDashboard.scheduleTab")}</button>
        </div>
      </div>

      {view === 'schedule' ? (
        <DeliveryScheduleView
          orders={orders}
          loading={loading}
          error={error}
          defaultDate={selectedDate}
          onOpenOrders={(date) => { setSelectedDate(date); setSelected(null); setView('working'); }}
          onOpenOrder={(o) => { setSelected(o); setSelected(null); setView('working'); }}
        />
      ) : (
        <>
          {/* Date chips */}
          {availableDates.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-1 px-1">
              {availableDates.map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`flex-shrink-0 px-5 py-3 rounded-xl text-[16px] font-semibold transition-all whitespace-nowrap min-h-[56px] ${
                    d === selectedDate ? 'bg-forest-700 text-white shadow-md' : 'bg-cream-100 text-gray-600 hover:bg-cream-200 active:scale-95'
                  }`}
                >
                  {formatDateShort(d)}
                </button>
              ))}
            </div>
          )}

          {/* Today's Delivery Batch */}
          <div className="mb-8">
            <h2 className="font-display font-bold text-forest-900 text-xl">{t("supplierDashboard.deliveryBatchTitle")}</h2>
            <p className="text-gray-500 text-sm mt-0.5">{t("supplierDashboard.deliveryBatchSubtitle", { date: formatDateFull(selectedDate) })}</p>
            <div className="mt-3">
              <SupplierDispatchSection date={selectedDate} showHeader={false} />
            </div>
          </div>

          {selected && !viewDetailsOrder ? (
            /* Weighing workspace */
            <div>
              <button onClick={() => { setEditMode(false); setSelected(null); }} className="inline-flex items-center gap-1.5 text-[16px] text-gray-500 hover:text-forest-700 mb-6 transition-colors">
                <ChevronLeft size={20} /> {t("supplierDashboard.backToQueues")}
              </button>
              <WeightEntryView
                key={selected.dbId}
                order={selected}
                editMode={editMode}
                onBack={() => { setEditMode(false); setSelected(null); }}
                onComplete={handleSaveAndNext}
                onNext={handleSaveAndNext}
                onWeightsSaved={handleWeightsSaved}
              />
            </div>
          ) : (
            <>
              {/* Queue search */}
              <div className="mb-6">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("customerQueue.messages.searchPlaceholder")}
                  className="w-full rounded-xl border-2 border-cream-200 p-4 text-[18px] focus:outline-none focus:border-forest-400 transition-colors"
                />
              </div>

              <WaitingForWeighing
                orders={filteredDayOrders}
                onStart={handleStartOrder}
                onEditWeight={handleEditWeight}
                onViewDetails={handleViewDetails}
              />
              <ReadyToPrepare
                orders={filteredDayOrders}
                onPrepare={handlePrepareOrder}
                onViewDetails={handleViewDetails}
              />
              <Preparing
                orders={filteredDayOrders}
                onComplete={handleCompletePacking}
                onViewDetails={handleViewDetails}
              />
              <ReadyForSupplierDispatch
                orders={filteredDayOrders}
                onStartDispatch={handleStartDispatch}
                onViewDetails={handleViewDetails}
              />
              <SupplierDispatch
                orders={filteredDayOrders}
                onViewDetails={handleViewDetails}
              />
            </>
          )}
        </>
      )}

      {/* View Details modal */}
      {viewDetailsOrder && (
        <OrderDetailsView
          order={viewDetailsOrder}
          completionTimes={completionTimes}
          onClose={() => setViewDetailsOrder(null)}
        />
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

// ----------- Waiting For Weighing queue -----------

function WaitingForWeighing({ orders, onStart, onEditWeight, onViewDetails }: {
  orders: SupplierOrder[];
  onStart: (o: SupplierOrder) => void;
  onEditWeight: (o: SupplierOrder) => void;
  onViewDetails: (o: SupplierOrder) => void;
}) {
  const { t } = useLanguage();

  // Queue 1: orders that require weighing but don't have all weights submitted yet.
  const needsWeighing = orders.filter((o) => orderRequiresWeighing(o) && !hasAllWeightsSubmitted(o));
  // Queue 2: orders that have all weights submitted (or don't require weighing) but payment not yet Paid.
  const awaitingPayment = orders.filter((o) =>
    (!orderRequiresWeighing(o) || hasAllWeightsSubmitted(o)) &&
    o.paymentStatus !== 'Paid' &&
    (o.source !== 'canonical' || o.canonicalPriceStatus === 'final')
  );

  // eslint-disable-next-line no-console
  console.log("waitingForWeighing", needsWeighing.map(o => ({ ref: o.orderRef })));
  // eslint-disable-next-line no-console
  console.log("awaitingPayment", awaitingPayment.map(o => ({ ref: o.orderRef })));
  orders.forEach((o) => {
    const requiresWeighing = orderRequiresWeighing(o);
    const allSubmitted = hasAllWeightsSubmitted(o);
    const inNeeds = requiresWeighing && !allSubmitted;
    const inAwaiting = (!requiresWeighing || allSubmitted) && o.paymentStatus !== 'Paid';
    if (!inNeeds) {
      // eslint-disable-next-line no-console
      console.log(`Order ${o.orderRef} excluded from waitingForWeighing because: orderRequiresWeighing=${requiresWeighing} hasAllWeightsSubmitted=${allSubmitted}`);
    }
    if (!inAwaiting) {
      // eslint-disable-next-line no-console
      console.log(`Order ${o.orderRef} excluded from awaitingPayment because: orderRequiresWeighing=${requiresWeighing} hasAllWeightsSubmitted=${allSubmitted} payment_status=${o.paymentStatus}`);
    }
  });

  const productCount = (o: SupplierOrder) => o.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-1">
        <Scale size={22} className="text-amber-600" />
        <p className="text-[22px] font-bold text-amber-700">{t("supplierQueues.waitingTitle")} ({needsWeighing.length})</p>
      </div>
      <p className="text-[15px] text-gray-500 mb-4">{t("supplierQueues.waitingSubtitle")}</p>

      {needsWeighing.length === 0 ? (
        <p className="text-gray-400 text-[18px]">{t("supplierQueues.noWaiting")}</p>
      ) : (
        <div className="space-y-4">
          {needsWeighing.map((order, i) => (
            <div key={order.dbId} className="bg-white rounded-2xl border-2 border-cream-200 p-6 hover:shadow-lg transition-shadow active:scale-[0.97]">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-[24px] font-bold text-gray-300 tabular-nums">#{i + 1}</span>
                  <div>
                    <p className="text-[20px] font-bold text-gray-900">{order.customerName}</p>
                    <p className="text-[13px] text-gray-500 font-mono mt-0.5">{order.orderRef}</p>
                  </div>
                </div>
                <PaymentBadge status={order.paymentStatus} />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[16px] text-gray-600 mb-4">
                <span>📍 {order.pickupLocation || '—'}</span>
                {order.houseUnit && <span>🏠 {t("supplierCard.unit")} {order.houseUnit}</span>}
                <span>📦 {productCount(order)} {t("supplierCard.products")}</span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => onStart(order)} className="flex-1 bg-forest-700 hover:bg-forest-800 text-white rounded-xl py-3 text-[16px] font-bold min-h-[56px] transition-all active:scale-[0.97]">
                  {orderRequiresWeighing(order) ? t("supplierQueues.weighButton") : t("supplierQueues.startButton")}
                </button>
                <button onClick={() => onViewDetails(order)} className="border-2 border-cream-200 rounded-xl px-5 py-3 text-[16px] font-semibold text-gray-600 min-h-[56px] hover:bg-cream-50 transition-all active:scale-[0.97]">
                  {t("supplierQueues.viewButton")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {awaitingPayment.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-1">
            <Package size={20} className="text-sky-600" />
            <p className="text-[20px] font-bold text-sky-700">{t("supplierQueues.awaitingPaymentTitle")} ({awaitingPayment.length})</p>
          </div>
          <p className="text-[15px] text-gray-500 mb-4">{t("supplierQueues.awaitingPaymentSubtitle")}</p>
          <div className="space-y-4">
            {awaitingPayment.map((order, i) => (
              <div key={order.dbId} className="bg-white rounded-2xl border-2 border-sky-200 p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[24px] font-bold text-sky-300 tabular-nums">#{i + 1}</span>
                    <div>
                      <p className="text-[20px] font-bold text-gray-900">{order.customerName}</p>
                      <p className="text-[13px] text-gray-500 font-mono mt-0.5">{order.orderRef}</p>
                    </div>
                  </div>
                  <PaymentBadge status={order.paymentStatus} />
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[16px] text-gray-600 mb-4">
                  <span>📍 {order.pickupLocation || '—'}</span>
                  {order.houseUnit && <span>🏠 {t("supplierCard.unit")} {order.houseUnit}</span>}
                  <span>📦 {productCount(order)} {t("supplierCard.products")}</span>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => onViewDetails(order)} className="flex-1 border-2 border-cream-200 rounded-xl py-3 text-[16px] font-semibold text-gray-600 min-h-[52px] hover:bg-cream-50 transition-all active:scale-[0.97]">
                    {t("supplierQueues.viewButton")}
                  </button>
                  {orderRequiresWeighing(order) && (
                    <button onClick={() => onEditWeight(order)} className="flex-1 border-2 border-amber-300 rounded-xl py-3 text-[16px] font-semibold text-amber-700 min-h-[52px] hover:bg-amber-50 transition-all active:scale-[0.97]">
                      {t("supplierQueues.editWeightButton")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------- Ready To Prepare queue -----------

function ReadyToPrepare({ orders, onPrepare, onViewDetails }: {
  orders: SupplierOrder[];
  onPrepare: (o: SupplierOrder) => void;
  onViewDetails: (o: SupplierOrder) => void;
}) {
  const { t } = useLanguage();

  // Queue: payment_status='Paid' AND packing_started_at IS NULL.
  const readyOrders = orders.filter((o) => {
    if (o.paymentStatus !== 'Paid') return false;
    return o.packingStartedAt == null;
  });

  // eslint-disable-next-line no-console
  console.log("readyToPrepare", readyOrders.map(o => ({ ref: o.orderRef })));
  orders.forEach((o) => {
    const inReady = o.paymentStatus === 'Paid' && o.packingStartedAt == null;
    if (!inReady) {
      // eslint-disable-next-line no-console
      console.log(`Order ${o.orderRef} excluded from readyToPrepare because: payment_status=${o.paymentStatus} packingStartedAt=${o.packingStartedAt}`);
    }
  });

  const productCount = (o: SupplierOrder) => o.items.reduce((sum, item) => sum + item.quantity, 0);
  const orderTotal = (o: SupplierOrder): number => {
    const itemsTotal = o.items.reduce((sum, item, i) => {
      if (!needsWeighing(item)) return sum + item.price * item.quantity;
      const kg = o.supplierWeights[String(i)];
      if (!kg || kg <= 0) return sum;
      return sum + kg * item.price;
    }, 0);
    return itemsTotal + o.deliveryFee;
  };

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-1">
        <PackageCheck size={22} className="text-green-600" />
        <p className="text-[22px] font-bold text-green-700">{t("supplierQueues.readyTitle")} ({readyOrders.length})</p>
      </div>
      <p className="text-[15px] text-gray-500 mb-4">{t("supplierQueues.readySubtitle")}</p>

      {readyOrders.length === 0 ? (
        <p className="text-gray-400 text-[18px]">{t("supplierQueues.noReady")}</p>
      ) : (
        <div className="space-y-4">
          {readyOrders.map((order, i) => (
            <div key={order.dbId} className="bg-white rounded-2xl border-2 border-green-200 p-6 hover:shadow-lg transition-shadow active:scale-[0.97]">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-[24px] font-bold text-green-300 tabular-nums">#{i + 1}</span>
                  <div>
                    <p className="text-[20px] font-bold text-gray-900">{order.customerName}</p>
                    <p className="text-[13px] text-gray-500 font-mono mt-0.5">{order.orderRef}</p>
                  </div>
                </div>
                <PaymentBadge status={order.paymentStatus} />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[16px] text-gray-600 mb-4">
                <span>📍 {order.pickupLocation || '—'}</span>
                {order.houseUnit && <span>🏠 {t("supplierCard.unit")} {order.houseUnit}</span>}
                <span>📦 {productCount(order)} {t("supplierCard.products")}</span>
                <span className="font-semibold text-green-700">RM{formatCurrency(orderTotal(order))}</span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => onPrepare(order)} className="flex-1 bg-forest-700 hover:bg-forest-800 text-white rounded-xl py-3 text-[16px] font-bold min-h-[56px] transition-all active:scale-[0.97]">
                  {t("supplierQueues.prepareButton")}
                </button>
                <button onClick={() => onViewDetails(order)} className="border-2 border-cream-200 rounded-xl px-5 py-3 text-[16px] font-semibold text-gray-600 min-h-[56px] hover:bg-cream-50 transition-all active:scale-[0.97]">
                  {t("supplierQueues.viewButton")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------- Preparing queue -----------

function Preparing({ orders, onComplete, onViewDetails }: {
  orders: SupplierOrder[];
  onComplete: (o: SupplierOrder) => void;
  onViewDetails: (o: SupplierOrder) => void;
}) {
  const { t } = useLanguage();

  // Queue: packing_started_at IS NOT NULL AND packing_completed_at IS NULL.
  const preparingOrders = orders.filter((o) => {
    return o.packingStartedAt != null && o.packingCompletedAt == null;
  });

  // eslint-disable-next-line no-console
  console.log("preparing", preparingOrders.map(o => ({ ref: o.orderRef })));
  orders.forEach((o) => {
    const inPreparing = o.packingStartedAt != null && o.packingCompletedAt == null;
    if (!inPreparing) {
      // eslint-disable-next-line no-console
      console.log(`Order ${o.orderRef} excluded from preparing because: packingStartedAt=${o.packingStartedAt} packingCompletedAt=${o.packingCompletedAt}`);
    }
  });

  // Localized fallbacks for keys that are not yet in the locale files.
  const q = (key: string, fallback: string) => {
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  const productCount = (o: SupplierOrder) => o.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-1">
        <Package size={22} className="text-amber-600" />
        <p className="text-[22px] font-bold text-amber-700">{q("supplierQueues.preparingTitle", "Preparing")} ({preparingOrders.length})</p>
      </div>
      <p className="text-[15px] text-gray-500 mb-4">{q("supplierQueues.preparingSubtitle", "Packing started. Complete all items.")}</p>

      {preparingOrders.length === 0 ? (
        <p className="text-gray-400 text-[18px]">{q("supplierQueues.noPreparing", "No orders being prepared.")}</p>
      ) : (
        <div className="space-y-4">
          {preparingOrders.map((order, i) => (
            <div key={order.dbId} className="bg-white rounded-2xl border-2 border-amber-200 p-6 hover:shadow-lg transition-shadow active:scale-[0.97]">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-[24px] font-bold text-amber-300 tabular-nums">#{i + 1}</span>
                  <div>
                    <p className="text-[20px] font-bold text-gray-900">{order.customerName}</p>
                    <p className="text-[13px] text-gray-500 font-mono mt-0.5">{order.orderRef}</p>
                  </div>
                </div>
                <PaymentBadge status={order.paymentStatus} />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[16px] text-gray-600 mb-4">
                <span>📍 {order.pickupLocation || '—'}</span>
                {order.houseUnit && <span>🏠 {t("supplierCard.unit")} {order.houseUnit}</span>}
                <span>📦 {productCount(order)} {t("supplierCard.products")}</span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => onComplete(order)} className="flex-1 bg-forest-700 hover:bg-forest-800 text-white rounded-xl py-3 text-[16px] font-bold min-h-[56px] transition-all active:scale-[0.97]">
                  {q("supplierQueues.completeButton", "Preparation Completed")}
                </button>
                <button onClick={() => onViewDetails(order)} className="border-2 border-cream-200 rounded-xl px-5 py-3 text-[16px] font-semibold text-gray-600 min-h-[56px] hover:bg-cream-50 transition-all active:scale-[0.97]">
                  {t("supplierQueues.viewButton")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------- Ready For Supplier Dispatch queue -----------

function ReadyForSupplierDispatch({ orders, onStartDispatch, onViewDetails }: {
  orders: SupplierOrder[];
  onStartDispatch: (o: SupplierOrder, trackingUrl: string, bookingReference: string) => void;
  onViewDetails: (o: SupplierOrder) => void;
}) {
  const { t } = useLanguage();
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({});
  const [refInputs, setRefInputs] = useState<Record<string, string>>({});

  // Queue: payment_status='Paid' AND packing_started_at IS NOT NULL
  // AND packing_completed_at IS NOT NULL AND supplier_dispatch_started_at IS NULL.
  const readyOrders = orders.filter((o) => {
    return o.paymentStatus === 'Paid'
      && o.packingStartedAt != null
      && o.packingCompletedAt != null
      && o.supplierDispatchStartedAt == null;
  });

  const q = (key: string, fallback: string) => {
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  const productCount = (o: SupplierOrder) => o.items.reduce((sum, item) => sum + item.quantity, 0);

  const trackingUrl = (o: SupplierOrder) => trackingInputs[o.dbId] ?? o.lalamoveTrackingUrl ?? '';

  const handleStart = (o: SupplierOrder) => {
    const url = trackingUrl(o).trim();
    if (!url) {
      alert(q("supplierQueues.errorTrackingRequired", "Lalamove Tracking URL is required."));
      return;
    }
    if (!/^https:\/\//i.test(url)) {
      alert(q("supplierQueues.errorTrackingInvalid", "Tracking URL must start with https://"));
      return;
    }
    onStartDispatch(o, url, (refInputs[o.dbId] ?? '').trim());
  };

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-1">
        <Truck size={22} className="text-purple-600" />
        <p className="text-[22px] font-bold text-purple-700">{q("supplierQueues.readyDispatchTitle", "Ready For Supplier Dispatch")} ({readyOrders.length})</p>
      </div>
      <p className="text-[15px] text-gray-500 mb-4">{q("supplierQueues.readyDispatchSubtitle", "Packing completed. Enter Lalamove details to dispatch.")}</p>

      {readyOrders.length === 0 ? (
        <p className="text-gray-400 text-[18px]">{q("supplierQueues.noReadyDispatch", "No orders ready for supplier dispatch.")}</p>
      ) : (
        <div className="space-y-4">
          {readyOrders.map((order, i) => (
            <div key={order.dbId} className="bg-white rounded-2xl border-2 border-purple-200 p-6 hover:shadow-lg transition-shadow active:scale-[0.97]">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-[24px] font-bold text-purple-300 tabular-nums">#{i + 1}</span>
                  <div>
                    <p className="text-[20px] font-bold text-gray-900">{order.customerName}</p>
                    <p className="text-[13px] text-gray-500 font-mono mt-0.5">{order.orderRef}</p>
                  </div>
                </div>
                <PaymentBadge status={order.paymentStatus} />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[16px] text-gray-600 mb-3">
                <span>📍 {order.pickupLocation || '—'}</span>
                {order.houseUnit && <span>🏠 {t("supplierCard.unit")} {order.houseUnit}</span>}
                <span>📦 {productCount(order)} {t("supplierCard.products")}</span>
              </div>
              <p className="text-[14px] text-gray-500 mb-4">
                {q("supplierQueues.packingCompletedAt", "Packing completed")} {order.packingCompletedAt ? formatTime(order.packingCompletedAt) : '—'}
              </p>
              {order.source === 'canonical' ? (
                <>
                  <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                    <p className="text-[15px] font-semibold text-green-800">
                      Packing completed
                    </p>
                    <p className="text-[13px] text-green-700 mt-1">
                      Waiting for FreshGo canonical delivery batch / hub dispatch.
                    </p>
                  </div>

                  <button
                    onClick={() => onViewDetails(order)}
                    className="w-full border-2 border-cream-200 rounded-xl px-5 py-3 text-[16px] font-semibold text-gray-600 min-h-[56px] hover:bg-cream-50 transition-all active:scale-[0.97]"
                  >
                    {t("supplierQueues.viewButton")}
                  </button>
                </>
              ) : (
                <>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">{q("supplierQueues.trackingUrlLabel", "Lalamove Tracking URL")} *</label>
                      <input
                        type="url"
                        value={trackingUrl(order)}
                        onChange={(e) => setTrackingInputs(prev => ({ ...prev, [order.dbId]: e.target.value }))}
                        placeholder={q("supplierQueues.trackingUrlPlaceholder", "https://track.lalamove.com/...")}
                        className="w-full bg-cream-50 border border-cream-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">{q("supplierQueues.bookingRefLabel", "Booking Reference")}</label>
                      <input
                        type="text"
                        value={refInputs[order.dbId] ?? ''}
                        onChange={(e) => setRefInputs(prev => ({ ...prev, [order.dbId]: e.target.value }))}
                        placeholder={q("supplierQueues.bookingRefPlaceholder", "Optional booking reference")}
                        className="w-full bg-cream-50 border border-cream-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => handleStart(order)} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-3 text-[16px] font-bold min-h-[56px] transition-all active:scale-[0.97]">
                      {q("supplierQueues.startDispatchButton", "Start Supplier Dispatch")}
                    </button>
                    <button onClick={() => onViewDetails(order)} className="border-2 border-cream-200 rounded-xl px-5 py-3 text-[16px] font-semibold text-gray-600 min-h-[56px] hover:bg-cream-50 transition-all active:scale-[0.97]">
                      {t("supplierQueues.viewButton")}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------- Supplier Dispatch queue -----------

function SupplierDispatch({ orders, onViewDetails }: {
  orders: SupplierOrder[];
  onViewDetails: (o: SupplierOrder) => void;
}) {
  const { t } = useLanguage();

  // Queue: supplier_dispatch_started_at IS NOT NULL AND supplier_dispatch_completed_at IS NULL.
  const dispatchOrders = orders.filter((o) => {
    return o.supplierDispatchStartedAt != null && o.supplierDispatchCompletedAt == null;
  });

  const productCount = (o: SupplierOrder) => o.items.reduce((sum, item) => sum + item.quantity, 0);
  const q = (key: string, fallback: string) => {
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-1">
        <Truck size={22} className="text-sky-600" />
        <p className="text-[22px] font-bold text-sky-700">{q("supplierQueues.supplierDispatchTitle", "Supplier Dispatch")} ({dispatchOrders.length})</p>
      </div>
      <p className="text-[15px] text-gray-500 mb-4">{q("supplierQueues.supplierDispatchSubtitle", "Dispatched to Lalamove. Awaiting arrival at the FreshGo hub.")}</p>

      {dispatchOrders.length === 0 ? (
        <p className="text-gray-400 text-[18px]">{q("supplierQueues.noSupplierDispatch", "No orders currently being dispatched.")}</p>
      ) : (
        <div className="space-y-4">
          {dispatchOrders.map((order, i) => (
            <div key={order.dbId} className="bg-white rounded-2xl border-2 border-sky-200 p-6 hover:shadow-lg transition-shadow active:scale-[0.97]">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-[24px] font-bold text-sky-300 tabular-nums">#{i + 1}</span>
                  <div>
                    <p className="text-[20px] font-bold text-gray-900">{order.customerName}</p>
                    <p className="text-[13px] text-gray-500 font-mono mt-0.5">{order.orderRef}</p>
                  </div>
                </div>
                <PaymentBadge status={order.paymentStatus} />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[16px] text-gray-600 mb-4">
                <span>📍 {order.pickupLocation || '—'}</span>
                {order.houseUnit && <span>🏠 {t("supplierCard.unit")} {order.houseUnit}</span>}
                <span>📦 {productCount(order)} {t("supplierCard.products")}</span>
                {order.lalamoveTrackingUrl && (
                  <a href={order.lalamoveTrackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-semibold">
                    <ExternalLink size={14} /> {q("supplierQueues.trackingLink", "Track Lalamove")}
                  </a>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => onViewDetails(order)} className="flex-1 border-2 border-cream-200 rounded-xl py-3 text-[16px] font-semibold text-gray-600 min-h-[56px] hover:bg-cream-50 transition-all active:scale-[0.97]">
                  {t("supplierQueues.viewButton")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleCard = (dbId: string) => {
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
      if (!needsWeighing(item)) return sum + item.price * item.quantity;
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
                            const perKg = needsWeighing(item);
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
                                  <p className="text-[16px] font-bold text-gray-900 whitespace-nowrap ml-4">RM{formatCurrency(subtotal)}</p>
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
                          <span className="font-semibold">{order.deliveryFee === 0 ? t("deliverySchedule.messages.free") : `RM${formatCurrency(order.deliveryFee)}`}</span>
                        </div>
                        <div className="flex justify-between text-[18px] font-bold">
                          <span>{t("deliverySchedule.labels.actualTotal")}</span>
                          <span className="text-forest-800">RM{formatCurrency(actualTotal)}</span>
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
  onWeightsSaved?: (dbId: string, weights: Record<string, number>) => void;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isLocked = order.paymentStatus === 'Paid';
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const perKgItems = order.items.map((item, i) => ({ item, index: i, perKg: needsWeighing(item) }));

  const [weights, setWeights] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    order.items.forEach((item, i) => {
      if (!needsWeighing(item)) return;
      const existing = order.supplierWeights[String(i)];
      init[String(i)] = existing != null ? String(existing) : '';
    });
    return init;
  });

  const [unitWeights, setUnitWeights] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};

    order.items.forEach((item) => {
      item.canonicalUnits?.forEach((unit) => {
        init[unit.id] =
          unit.actualWeightKg != null
            ? String(unit.actualWeightKg)
            : '';
      });
    });

    return init;
  });

  // A typed value is not a saved value. Keep this separate so that saving one
  // unit cannot accidentally mark another, merely typed, unit as weighed.
  const initiallySavedUnitIds = new Set(
    order.items.flatMap((item) =>
      (item.canonicalUnits ?? [])
        .filter((unit) => unit.actualWeightKg != null && unit.actualWeightKg > 0)
        .map((unit) => unit.id),
    ),
  );
  const [savedUnitIds, setSavedUnitIds] = useState<Set<string>>(
    initiallySavedUnitIds,
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initiallySaved = new Set(order.items.map((_, i) => i).filter((i) => !needsWeighing(order.items[i]) || order.supplierWeights[String(i)] != null));
  const [savedProducts, setSavedProducts] = useState<Set<number>>(initiallySaved);
  const [completed, setCompleted] = useState(() => {
    if (editMode) return false;
    return order.items.every((item, i) => !needsWeighing(item) || order.supplierWeights[String(i)] != null);
  });
  const [lastSavedIndex, setLastSavedIndex] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (editMode) {
      return order.items.findIndex((item) => needsWeighing(item));
    }
    return order.items.findIndex((item, i) => needsWeighing(item) && order.supplierWeights[String(i)] == null);
  });

  // BUG 3 fix: reset completed when editMode changes without remount
  useEffect(() => {
    if (editMode) {
      setCompleted(false);
    }
  }, [editMode]);

  const lineTotal = (item: OrderItem, index: number): number => {
    if (!needsWeighing(item)) return item.price * item.quantity;

    if (
      order.source === 'canonical' &&
      item.orderingMode === 'whole_fish_by_weight'
    ) {
      const totalKg = (item.canonicalUnits ?? []).reduce((sum, unit) => {
        const value = parseFloat(unitWeights[unit.id] ?? '');
        return sum + (Number.isFinite(value) && value > 0 ? value : 0);
      }, 0);

      return totalKg * item.price;
    }

    const kg = parseFloat(weights[String(index)]);
    if (!kg || kg <= 0) return 0;
    return kg * item.price;
  };

  const orderTotal =
    order.items.reduce((sum, item, i) => sum + lineTotal(item, i), 0) + order.deliveryFee;

  // Live weights -> money for the accounting rows below (auto recompute).
  const liveWeights = order.items.reduce((acc, item, i) => {
    if (!needsWeighing(item)) return acc;

    if (
      order.source === 'canonical' &&
      item.orderingMode === 'whole_fish_by_weight'
    ) {
      const totalKg = (item.canonicalUnits ?? []).reduce((sum, unit) => {
        const value = parseFloat(unitWeights[unit.id] ?? '');
        return sum + (Number.isFinite(value) && value > 0 ? value : 0);
      }, 0);

      acc[String(i)] = totalKg;
      return acc;
    }

    const v = weights[String(i)];
    const n = v != null && v.trim() !== '' ? parseFloat(v) : (order.supplierWeights[String(i)] ?? 0);
    acc[String(i)] = Number.isFinite(n) && n > 0 ? n : 0;
    return acc;
  }, {} as Record<string, number>);
  const costTotal = orderCost(order.items, liveWeights);
  const grossProfit = orderGrossProfit(order.items, liveWeights);

  const handleWeightChange = (index: number, raw: string) => {
    if (raw.startsWith('-')) return;
    setWeights((prev) => ({ ...prev, [String(index)]: raw }));
    setError(null);
  };

  const handleUnitWeightChange = (unitId: string, raw: string) => {
    if (raw.startsWith('-')) return;

    setUnitWeights((prev) => ({
      ...prev,
      [unitId]: raw,
    }));

    setError(null);
  };

  const saveCanonicalUnitWeight = async (
    itemIndex: number,
    unit: CanonicalLineUnit,
  ) => {
    if (isLocked) {
      setError(t("weightEntry.messages.orderLocked"));
      return;
    }

    const item = order.items[itemIndex];

    if (
      order.source !== 'canonical' ||
      item.orderingMode !== 'whole_fish_by_weight'
    ) {
      setError('Per-unit weight entry is only available for canonical whole fish.');
      return;
    }

    const raw = unitWeights[unit.id];

    if (!raw || raw.trim() === '') {
      setError('Weight is required for ' + item.name + ' #' + unit.unitNumber + '.');
      return;
    }

    const n = parseFloat(raw);

    if (!Number.isFinite(n) || n <= 0) {
      setError('Weight must be greater than 0 for ' + item.name + ' #' + unit.unitNumber + '.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: weightError } = await supabase.rpc(
        'record_sales_order_line_unit_actual_weight',
        {
          p_sales_order_line_unit_id: unit.id,
          p_actual_weight_kg: n,
        },
      );

      if (weightError) throw weightError;

      const canonicalUnits = item.canonicalUnits ?? [];

      const nextSavedUnitIds = new Set(savedUnitIds);
      nextSavedUnitIds.add(unit.id);
      setSavedUnitIds(nextSavedUnitIds);

      const allUnitsSaved =
        canonicalUnits.length > 0 &&
        canonicalUnits.every((candidate) => nextSavedUnitIds.has(candidate.id));

      if (!allUnitsSaved) {
        return;
      }

      const totalWeight = canonicalUnits.reduce((sum, candidate) => {
        const value = parseFloat(unitWeights[candidate.id] ?? '');
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);

      const allWeights = {
        ...order.supplierWeights,
        [String(itemIndex)]: totalWeight,
      };

      const newSaved = new Set(savedProducts);
      newSaved.add(itemIndex);

      setSavedProducts(newSaved);
      setLastSavedIndex(itemIndex);
      onWeightsSaved?.(order.dbId, allWeights);

      setTimeout(() => setLastSavedIndex(null), 1500);

      const allItemsSaved = order.items.every(
        (candidate, candidateIndex) =>
          !needsWeighing(candidate) ||
          newSaved.has(candidateIndex) ||
          allWeights[String(candidateIndex)] != null,
      );

      if (allItemsSaved) {
        setCompleted(true);
      } else {
        const next = order.items.findIndex(
          (candidate, candidateIndex) =>
            needsWeighing(candidate) &&
            !newSaved.has(candidateIndex) &&
            allWeights[String(candidateIndex)] == null,
        );

        if (next >= 0) {
          setCurrentIndex(next);

          setTimeout(() => {
            inputRefs.current[next]?.focus();
            inputRefs.current[next]?.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
          }, 100);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("weightEntry.messages.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const saveCurrentProduct = async (index: number) => {
    if (isLocked) {
      setError(t("weightEntry.messages.orderLocked"));
      return;
    }
    const item = order.items[index];
    if (!needsWeighing(item)) {
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
      if (order.source === 'canonical') {
        if (!item.canonicalLineId) {
          throw new Error('Canonical sales order line ID is missing.');
        }

        if (!['weight_only', 'slice'].includes(item.orderingMode ?? '')) {
          throw new Error('This canonical item requires per-unit weight entry.');
        }

        const { error: weightError } = await supabase.rpc(
          'record_sales_order_line_actual_weight',
          {
            p_sales_order_line_id: item.canonicalLineId,
            p_actual_weight_kg: n,
          },
        );

        if (weightError) throw weightError;

        const allWeights = {
          ...order.supplierWeights,
          [String(index)]: n,
        };

        const newSaved = new Set(savedProducts);
        newSaved.add(index);

        setSavedProducts(newSaved);
        setLastSavedIndex(index);
        onWeightsSaved?.(order.dbId, allWeights);

        setTimeout(() => setLastSavedIndex(null), 1500);

        const allSaved = order.items.every(
          (candidate, candidateIndex) =>
            !needsWeighing(candidate) ||
            newSaved.has(candidateIndex) ||
            allWeights[String(candidateIndex)] != null,
        );

        if (allSaved) {
          setCompleted(true);
        } else {
          const next = order.items.findIndex(
            (candidate, candidateIndex) =>
              needsWeighing(candidate) &&
              !newSaved.has(candidateIndex) &&
              allWeights[String(candidateIndex)] == null,
          );

          if (next >= 0) {
            setCurrentIndex(next);
            setTimeout(() => {
              inputRefs.current[next]?.focus();
              inputRefs.current[next]?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
            }, 100);
          }
        }

        return;
      }
      const allWeights: Record<string, number> = {};
      order.items.forEach((item, i) => {
        if (!needsWeighing(item)) return;
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
          if (!needsWeighing(item)) return sum + item.price * item.quantity;
          return sum + (allWeights[String(i)] ?? 0) * item.price;
        }, 0) + order.deliveryFee;

      const allSaved = order.items.every((item, i) => {
        if (!needsWeighing(item)) return true;
        return savedProducts.has(i) || i === index;
      });

      // Stamp each item's gross profit (selling - supplier cost, scaled by the
      // actual weight) back into the order snapshot, plus the order total cost
      // and gross profit. Historical orders are never rewritten at checkout —
      // this only corrects the current in-progress order once goods are weighed.
      const updatedItems = order.items.map((item, i) => ({
        ...item,
        grossProfit: Math.round(
          ((item.price - (item.costPrice ?? 0)) *
            (needsWeighing(item)
              ? (allWeights[String(i)] ?? 0)
              : item.quantity ?? 0)) *
            100,
        ) / 100,
      }));
      const grossProfit = order.items.reduce((sum, item, i) => {
        if (!needsWeighing(item)) return sum + (updatedItems[i].grossProfit ?? 0);
        const w = allWeights[String(i)];
        if (!w || w <= 0) return sum;
        return sum + (item.price - (item.costPrice ?? 0)) * w;
      }, 0);

      const { error: updateError } = await supabase
        .from('Orders')
        .update({
          supplier_weights: allWeights,
          total: Math.round(newTotal * 100) / 100,
          order_items: updatedItems,
          gross_profit: Math.round(grossProfit * 100) / 100,
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
        const next = order.items.findIndex((item, i) => needsWeighing(item) && !newSaved.has(i));
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
          const perKgFlag = needsWeighing(item);
          const isActive = currentIndex === i;
          const isDone = savedProducts.has(i);
          const hasComboItems = item.comboItems && item.comboItems.length > 0;
          const total = lineTotal(item, i);
          const weight = weights[String(i)];
        const isWholeFishByWeight =
          order.source === 'canonical' &&
          item.orderingMode === 'whole_fish_by_weight';
        const canonicalUnits = item.canonicalUnits ?? [];
        const hasCanonicalUnits = canonicalUnits.length > 0;
        const wholeFishTotalWeight = canonicalUnits.reduce((sum, unit) => {
          const value = parseFloat(unitWeights[unit.id] ?? '');
          return sum + (Number.isFinite(value) && value > 0 ? value : 0);
        }, 0);

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
                  {isSliceItem(item) && (
                    <p className="text-[16px] text-purple-700 font-semibold mt-1">
                      {t("supplierDashboard.slicesRequested", { count: item.sliceQuantity ?? item.quantity })}
                    </p>
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
                  RM{formatCurrency(item.price)}{perKgFlag ? '/kg' : ''}
                </span>

                {isWholeFishByWeight ? (
                  <div className="w-full mt-4 space-y-3">
                  {!hasCanonicalUnits && (
                    <p className="text-[14px] text-red-600">
                      This whole-fish order has no physical units to weigh. Please contact an administrator.
                    </p>
                  )}
                  {canonicalUnits.map((unit) => (
                    <div key={unit.id} className="flex items-center gap-3 rounded-xl border border-cream-200 bg-cream-50 p-3">
                      <span className="min-w-[80px] text-[15px] font-semibold text-gray-700">
                        Ikan #{unit.unitNumber}
                      </span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={unitWeights[unit.id] ?? ''}
                        onChange={(e) => handleUnitWeightChange(unit.id, e.target.value)}
                        placeholder="kg"
                        readOnly={isLocked || (savedUnitIds.has(unit.id) && !editMode)}
                        className="ml-auto w-24 rounded-xl border-2 p-3 text-[18px] text-center focus:outline-none focus:border-forest-400"
                      />
                      <span className="text-[15px] text-gray-500">kg</span>
                      {!isLocked && (editMode || !savedUnitIds.has(unit.id)) && (
                        <button
                          onClick={() => saveCanonicalUnitWeight(i, unit)}
                          disabled={saving}
                          className="bg-forest-700 hover:bg-forest-800 text-white rounded-xl px-4 py-3 text-[15px] font-bold disabled:opacity-50"
                        >
                          {saving ? <Loader2 size={18} className="animate-spin" /> : t("weightEntry.buttons.save")}
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 text-[16px] font-semibold">
                    <span>Jumlah berat: {wholeFishTotalWeight.toFixed(2)} kg</span>
                    <span className="text-green-700">RM{formatCurrency(total)}</span>
                  </div>
                </div>
              ) : perKgFlag && !hasComboItems ? (
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
                          RM{formatCurrency(total)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-[16px] font-semibold text-green-600 whitespace-nowrap">{t("weightEntry.helper.fixedPrice")}</span>
                    <span className="text-[18px] font-bold text-green-700">
                      RM{formatCurrency(total)}
                    </span>
                  </div>
                )}
              </div>

              {perKgFlag && !isWholeFishByWeight && !hasComboItems && !weight && !isDone && !isLocked && (
                <p className="text-[14px] text-amber-600 mt-2">{t("weightEntry.helper.autoCalculation")}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="bg-white rounded-2xl border-2 border-cream-200 p-5 mb-6 space-y-2">
        <div className="flex justify-between text-[18px] text-amber-700">
          <span>{t("weightEntry.labels.supplierCost")}</span>
          <span className="font-semibold">RM{formatCurrency(costTotal)}</span>
        </div>
        <div className="flex justify-between text-[18px] text-green-700">
          <span>{t("weightEntry.labels.grossProfit")} <span className="text-[13px] text-gray-400">({marginPercent(orderTotal - order.deliveryFee, costTotal).toFixed(1)}%)</span></span>
          <span className="font-semibold">+RM{formatCurrency(grossProfit)}</span>
        </div>
        <div className="flex justify-between text-[18px] text-gray-600">
          <span>{t("weightEntry.labels.deliveryFee")}</span>
          <span className="font-semibold">{order.deliveryFee === 0 ? t("weightEntry.labels.free") : `RM${formatCurrency(order.deliveryFee)}`}</span>
        </div>
        <div className="flex justify-between text-[22px] font-bold">
          <span>{t("weightEntry.labels.grandTotal")}</span>
          <span className="text-forest-800">RM{formatCurrency(orderTotal)}</span>
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

function OrderDetailsView({ order, completionTimes, onClose }: { order: SupplierOrder; completionTimes: Record<string, string>; onClose: () => void }) {
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
                const perKg = needsWeighing(item);
                const weight = order.supplierWeights[String(i)];
                const total = perKg
                  ? (weight ? weight * item.price : 0)
                  : item.price * item.quantity;

                return (
                  <div key={`${item.productId}-${i}`} className="bg-cream-50 rounded-2xl p-4 border border-cream-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[18px] font-bold text-gray-900">{item.name}</p>
                        {isSliceItem(item) && (
                          <p className="text-[14px] font-semibold text-purple-700 mt-1">
                            {t("supplierOrder.labels.slices", { count: item.sliceQuantity ?? item.quantity })}
                          </p>
                        )}
                        <p className="text-[14px] text-gray-500">{t("supplierOrder.labels.qtyLine", { qty: item.quantity, price: formatCurrency(item.price), suffix: perKg ? t("supplierOrder.labels.perKg") : '' })}</p>
                      </div>
                      <p className="text-[18px] font-bold text-gray-900">RM{formatCurrency(total)}</p>
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
            <div className="flex justify-between text-[16px] text-amber-700">
              <span>{t("supplierOrder.labels.supplierCost")}</span>
              <span className="font-semibold">RM{formatCurrency(orderCost(order.items, order.supplierWeights))}</span>
            </div>
            <div className="flex justify-between text-[16px] text-green-700">
              <span>{t("supplierOrder.labels.grossProfit")}</span>
              <span className="font-semibold">+RM{formatCurrency(orderGrossProfit(order.items, order.supplierWeights))}</span>
            </div>
            <div className="flex justify-between text-[16px] text-gray-600">
            <span>{t("supplierOrder.labels.deliveryFee")}</span>
            <span>{order.deliveryFee === 0 ? t("supplierOrder.messages.free") : `RM${formatCurrency(order.deliveryFee)}`}</span>
          </div>
          <div className="flex justify-between text-[22px] font-bold">
            <span>{t("supplierOrder.labels.grandTotal")}</span>
              <span className="text-forest-800">RM{formatCurrency(orderTotal)}</span>
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
