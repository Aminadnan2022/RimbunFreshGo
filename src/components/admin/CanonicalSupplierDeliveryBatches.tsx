import { useCallback, useEffect, useState } from 'react';
import {
  Boxes,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Plus,
  Truck,
} from 'lucide-react';
import {
  addCanonicalOrderToBatch,
  confirmCanonicalSupplierBatchHubArrival,
  createCanonicalSupplierBatch,
  dispatchCanonicalSupplierBatch,
  fetchCanonicalSupplierBatches,
  fetchPackedCanonicalOrders,
  type CanonicalSupplierBatch,
  type PackedCanonicalOrder,
} from '../../data/canonicalSupplierDeliveryBatches';

function describeError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'Something went wrong.';
}

export default function CanonicalSupplierDeliveryBatches() {
  const [batches, setBatches] = useState<CanonicalSupplierBatch[]>([]);
  const [readyOrders, setReadyOrders] = useState<PackedCanonicalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [batchRows, orderRows] = await Promise.all([
        fetchCanonicalSupplierBatches(),
        fetchPackedCanonicalOrders(),
      ]);
      setBatches(batchRows);
      setReadyOrders(orderRows);
    } catch (err) {
      setMessage({ ok: false, text: describeError(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createAndAdd = async (order: PackedCanonicalOrder) => {
    const key = `add:${order.sales_order_id}:${order.supplier_id}`;
    setBusy(key);
    setMessage(null);

    try {
      const batchId = await createCanonicalSupplierBatch(
        order.supplier_id,
        order.delivery_date ?? new Date().toISOString().slice(0, 10),
      );

      await addCanonicalOrderToBatch(batchId, order.sales_order_id);

      setMessage({
        ok: true,
        text: `${order.order_number} added to a new supplier → hub batch.`,
      });

      await load();
    } catch (err) {
      setMessage({ ok: false, text: describeError(err) });
    } finally {
      setBusy(null);
    }
  };

  const dispatchBatch = async (batch: CanonicalSupplierBatch) => {
    const tracking = window.prompt(
      'Lalamove tracking URL (optional). Leave blank if not available yet.',
      batch.tracking_url ?? '',
    );

    if (tracking === null) return;

    const ref = window.prompt(
      'Booking reference (optional).',
      batch.booking_reference ?? '',
    );

    if (ref === null) return;

    const key = `dispatch:${batch.id}`;
    setBusy(key);
    setMessage(null);

    try {
      await dispatchCanonicalSupplierBatch(batch.id, tracking, ref);
      setMessage({
        ok: true,
        text: `${batch.batch_code} marked as dispatched to FreshGo Hub.`,
      });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: describeError(err) });
    } finally {
      setBusy(null);
    }
  };

  const confirmArrival = async (batch: CanonicalSupplierBatch) => {
    if (!window.confirm(`Confirm ${batch.batch_code} has arrived at FreshGo Hub?`)) {
      return;
    }

    const key = `arrival:${batch.id}`;
    setBusy(key);
    setMessage(null);

    try {
      await confirmCanonicalSupplierBatchHubArrival(batch.id);
      setMessage({
        ok: true,
        text: `${batch.batch_code} confirmed arrived at FreshGo Hub.`,
      });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: describeError(err) });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-forest-600" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            message.ok
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="rounded-2xl border border-cream-200 bg-white shadow-soft overflow-hidden">
        <div className="p-5 border-b border-cream-200">
          <div className="flex items-center gap-2">
            <PackageCheck size={20} className="text-forest-700" />
            <div>
              <h3 className="font-semibold text-forest-900">
                Packed Orders Ready for Supplier Dispatch
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Paid canonical orders with supplier packing completed and not yet assigned to a supplier → hub batch.
              </p>
            </div>
          </div>
        </div>

        {readyOrders.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No packed canonical orders are waiting for a supplier batch.
          </div>
        ) : (
          <div className="divide-y divide-cream-100">
            {readyOrders.map((order) => {
              const key = `add:${order.sales_order_id}:${order.supplier_id}`;
              return (
                <div
                  key={key}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-mono text-sm font-semibold text-forest-800">
                      {order.order_number}
                    </p>
                    <p className="text-sm text-gray-700 mt-1">
                      {order.customer_name} • {order.supplier_name}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Packing completed{' '}
                      {new Date(order.packing_completed_at).toLocaleString('en-MY')}
                    </p>
                  </div>

                  <button
                    onClick={() => createAndAdd(order)}
                    disabled={busy !== null}
                    className="btn-primary inline-flex items-center gap-2 self-start sm:self-auto disabled:opacity-50"
                  >
                    {busy === key ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Plus size={16} />
                    )}
                    Create Batch & Add
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-cream-200 bg-white shadow-soft overflow-hidden">
        <div className="p-5 border-b border-cream-200">
          <div className="flex items-center gap-2">
            <Boxes size={20} className="text-forest-700" />
            <div>
              <h3 className="font-semibold text-forest-900">
                Canonical Supplier → Hub Batches
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                One supplier transport may carry multiple customer orders to FreshGo Hub.
              </p>
            </div>
          </div>
        </div>

        {batches.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No canonical supplier delivery batches yet.
          </div>
        ) : (
          <div className="divide-y divide-cream-100">
            {batches.map((batch) => {
              const dispatchKey = `dispatch:${batch.id}`;
              const arrivalKey = `arrival:${batch.id}`;

              return (
                <div key={batch.id} className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-forest-800">
                          {batch.batch_code}
                        </p>
                        <span className="px-2 py-0.5 rounded-full bg-cream-100 text-xs font-semibold text-gray-600">
                          {batch.status}
                        </span>
                      </div>

                      <p className="text-sm text-gray-700 mt-2">
                        {batch.supplier_name} • {batch.order_count}{' '}
                        {batch.order_count === 1 ? 'order' : 'orders'}
                      </p>

                      <p className="text-xs text-gray-400 mt-1">
                        {batch.delivery_date} → {batch.hub_name}
                      </p>

                      {batch.dispatched_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Dispatched: {new Date(batch.dispatched_at).toLocaleString('en-MY')}
                        </p>
                      )}

                      {batch.arrived_hub_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Arrived hub: {new Date(batch.arrived_hub_at).toLocaleString('en-MY')}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {batch.status === 'draft' && (
                        <button
                          onClick={() => dispatchBatch(batch)}
                          disabled={busy !== null || batch.order_count === 0}
                          className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
                        >
                          {busy === dispatchKey ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Truck size={16} />
                          )}
                          Dispatch Batch
                        </button>
                      )}

                      {batch.status === 'dispatched' && (
                        <button
                          onClick={() => confirmArrival(batch)}
                          disabled={busy !== null}
                          className="px-4 py-2 rounded-xl text-sm font-semibold bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-50 inline-flex items-center gap-2"
                        >
                          {busy === arrivalKey ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={16} />
                          )}
                          Confirm Hub Arrival
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
