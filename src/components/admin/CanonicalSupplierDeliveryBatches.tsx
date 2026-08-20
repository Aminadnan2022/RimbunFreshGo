import { useCallback, useEffect, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  ExternalLink,
  Loader2,
  PackageCheck,
  Plus,
  Trash2,
  Truck,
} from "lucide-react";
import {
  addCanonicalOrderToBatch,
  confirmCanonicalSupplierBatchHubArrival,
  createCanonicalSupplierBatch,
  dispatchCanonicalSupplierBatch,
  fetchCanonicalSupplierBatches,
  fetchPackedCanonicalOrders,
  fetchCanonicalHubOrders,
  removeCanonicalOrderFromBatch,
  assignCanonicalSalesOrderRider,
  type CanonicalSupplierBatch,
  type PackedCanonicalOrder,
  type CanonicalHubOrder,
} from "../../data/canonicalSupplierDeliveryBatches";
import {
  fetchAssignments,
  fetchRiders,
  type RiderInfo,
  type DeliveryAssignment,
} from "../../data/delivery";

function describeError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong.";
}

function formatBatchStatus(status: CanonicalSupplierBatch["status"]): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "dispatched":
      return "Dispatched";
    case "arrived_hub":
      return "Arrived Hub";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export default function CanonicalSupplierDeliveryBatches() {
  const [batches, setBatches] = useState<CanonicalSupplierBatch[]>([]);
  const [readyOrders, setReadyOrders] = useState<PackedCanonicalOrder[]>([]);
  const [hubOrders, setHubOrders] = useState<CanonicalHubOrder[]>([]);
  const [riders, setRiders] = useState<RiderInfo[]>([]);
  const [assignmentsByDate, setAssignmentsByDate] = useState<
    Record<string, DeliveryAssignment[]>
  >({});
  const [selectedRiders, setSelectedRiders] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [batchRows, orderRows, riderRows] = await Promise.all([
        fetchCanonicalSupplierBatches(),
        fetchPackedCanonicalOrders(),
        fetchRiders(),
      ]);

      const arrivedBatchIds = batchRows
        .filter((batch) => batch.status === "arrived_hub")
        .map((batch) => batch.id);

      const visibleBatchIds = batchRows
        .filter(
          (batch) =>
            batch.status === "draft" ||
            batch.status === "dispatched" ||
            batch.status === "arrived_hub",
        )
        .map((batch) => batch.id);

      const hubOrderRows = await fetchCanonicalHubOrders(visibleBatchIds);
      const arrivedBatchIdSet = new Set(arrivedBatchIds);

      const arrivedHubOrderRows = hubOrderRows.filter((order) =>
        arrivedBatchIdSet.has(order.batch_id),
      );

      const deliveryDates = [
        ...new Set(
          arrivedHubOrderRows
            .map((order) => order.delivery_date)
            .filter((date): date is string => Boolean(date)),
        ),
      ];

      const assignmentEntries = await Promise.all(
        deliveryDates.map(
          async (date) => [date, await fetchAssignments(date)] as const,
        ),
      );

      setBatches(batchRows);
      setReadyOrders(orderRows);
      setHubOrders(hubOrderRows);
      setRiders(riderRows);
      setAssignmentsByDate(Object.fromEntries(assignmentEntries));

      setSelectedRiders((current) => {
        const next = { ...current };

        for (const order of hubOrderRows) {
          if (order.assigned_rider_id) {
            next[order.sales_order_id] = order.assigned_rider_id;
            continue;
          }

          const dateAssignments = order.delivery_date
            ? (Object.fromEntries(assignmentEntries)[order.delivery_date] ?? [])
            : [];

          if (dateAssignments.length === 1) {
            next[order.sales_order_id] = dateAssignments[0].rider_id;
          }
        }

        return next;
      });
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
      const deliveryDate =
        order.delivery_date ??
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kuala_Lumpur",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

      const existingDraftBatch = batches.find(
        (batch) =>
          batch.status === "draft" &&
          batch.supplier_id === order.supplier_id &&
          batch.delivery_date === deliveryDate,
      );

      let batchId: string;
      let batchCode: string | null = null;

      if (existingDraftBatch) {
        batchId = existingDraftBatch.id;
        batchCode = existingDraftBatch.batch_code;
      } else {
        batchId = await createCanonicalSupplierBatch(
          order.supplier_id,
          deliveryDate,
        );
      }

      await addCanonicalOrderToBatch(batchId, order.sales_order_id);

      setMessage({
        ok: true,
        text: existingDraftBatch
          ? `${order.order_number} added to existing batch ${batchCode}.`
          : `${order.order_number} added to a new supplier → hub batch.`,
      });

      await load();
    } catch (err) {
      setMessage({ ok: false, text: describeError(err) });
    } finally {
      setBusy(null);
    }
  };

  const removeFromBatch = async (
    batch: CanonicalSupplierBatch,
    order: CanonicalHubOrder,
  ) => {
    if (
      !window.confirm(`Remove ${order.order_number} from ${batch.batch_code}?`)
    ) {
      return;
    }

    const key = `remove:${batch.id}:${order.sales_order_id}`;
    setBusy(key);
    setMessage(null);

    try {
      await removeCanonicalOrderFromBatch(batch.id, order.sales_order_id);

      setMessage({
        ok: true,
        text: `${order.order_number} removed from ${batch.batch_code}.`,
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
      "Lalamove tracking URL (optional). Leave blank if not available yet.",
      batch.tracking_url ?? "",
    );

    if (tracking === null) return;

    const ref = window.prompt(
      "Booking reference (optional).",
      batch.booking_reference ?? "",
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

  const assignRider = async (order: CanonicalHubOrder) => {
    const riderId = selectedRiders[order.sales_order_id];

    if (!riderId) {
      setMessage({
        ok: false,
        text: "Please select a rider first.",
      });
      return;
    }

    const key = `rider:${order.sales_order_id}`;
    setBusy(key);
    setMessage(null);

    try {
      await assignCanonicalSalesOrderRider(order.sales_order_id, riderId);

      setMessage({
        ok: true,
        text: `${order.order_number} is now Ready For Rider.`,
      });

      await load();
    } catch (err) {
      setMessage({ ok: false, text: describeError(err) });
    } finally {
      setBusy(null);
    }
  };

  const confirmArrival = async (batch: CanonicalSupplierBatch) => {
    if (
      !window.confirm(`Confirm ${batch.batch_code} has arrived at FreshGo Hub?`)
    ) {
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
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
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
                Paid canonical orders with supplier packing completed and not
                yet assigned to a supplier → hub batch.
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

              const deliveryDate =
                order.delivery_date ??
                new Intl.DateTimeFormat("en-CA", {
                  timeZone: "Asia/Kuala_Lumpur",
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                }).format(new Date());

              const existingDraftBatch = batches.find(
                (batch) =>
                  batch.status === "draft" &&
                  batch.supplier_id === order.supplier_id &&
                  batch.delivery_date === deliveryDate,
              );
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
                      Packing completed{" "}
                      {new Date(order.packing_completed_at).toLocaleString(
                        "en-MY",
                      )}
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
                    {existingDraftBatch
                      ? `Add to ${existingDraftBatch.batch_code}`
                      : "Create Batch & Add"}
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
                One supplier transport may carry multiple customer orders to
                FreshGo Hub.
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
              const ordersInBatch = hubOrders.filter(
                (order) => order.batch_id === batch.id,
              );

              return (
                <div key={batch.id} className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-forest-800">
                          {batch.batch_code}
                        </p>
                        <span className="px-2 py-0.5 rounded-full bg-cream-100 text-xs font-semibold text-gray-600">
                          {formatBatchStatus(batch.status)}
                        </span>
                      </div>

                      <p className="text-sm text-gray-700 mt-2">
                        {batch.supplier_name} • {batch.order_count}{" "}
                        {batch.order_count === 1 ? "order" : "orders"}
                      </p>

                      <p className="text-xs text-gray-400 mt-1">
                        {batch.delivery_date} → {batch.hub_name}
                      </p>

                      {batch.status !== "draft" && batch.transport_provider && (
                        <p className="text-xs text-gray-500 mt-1">
                          Transport: {batch.transport_provider}
                        </p>
                      )}

                      {batch.status !== "draft" && batch.booking_reference && (
                        <p className="text-xs text-gray-500 mt-1">
                          Booking: {batch.booking_reference}
                        </p>
                      )}

                      {batch.status !== "draft" && batch.tracking_url && (
                        <a
                          href={batch.tracking_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 mt-1 inline-flex items-center gap-1"
                        >
                          View Lalamove Tracking
                          <ExternalLink size={12} />
                        </a>
                      )}

                      {batch.dispatched_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Dispatched:{" "}
                          {new Date(batch.dispatched_at).toLocaleString(
                            "en-MY",
                          )}
                        </p>
                      )}

                      {batch.arrived_hub_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Arrived hub:{" "}
                          {new Date(batch.arrived_hub_at).toLocaleString(
                            "en-MY",
                          )}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {batch.status === "draft" && (
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

                      {batch.status === "dispatched" && (
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
                  {ordersInBatch.length > 0 &&
                    batch.status !== "arrived_hub" && (
                      <div className="mt-5 border-t border-cream-100 pt-4 space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-forest-900">
                            Batch Orders
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {batch.status === 'draft'
                              ? 'Review the packed orders before dispatching this supplier batch.'
                              : 'This manifest is locked because the batch has already been dispatched.'}
                          </p>
                        </div>

                        {ordersInBatch.map((order) => {
                          const removeKey = `remove:${batch.id}:${order.sales_order_id}`;

                          return (
                            <div
                              key={order.sales_order_id}
                              className="rounded-xl border border-cream-200 bg-cream-50/40 p-4"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <p className="font-mono text-sm font-semibold text-forest-800">
                                    {order.order_number}
                                  </p>

                                  <p className="text-sm text-gray-700 mt-1">
                                    {order.customer_name}
                                  </p>

                                  <p className="text-xs text-gray-500 mt-1">
                                    Delivery date:{" "}
                                    {order.delivery_date ?? "Not available"}
                                  </p>
                                </div>

                                {batch.status === "draft" && (
                                  <button
                                    onClick={() =>
                                      removeFromBatch(batch, order)
                                    }
                                    disabled={busy !== null}
                                    className="px-3 py-2 rounded-xl text-sm font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 inline-flex items-center justify-center gap-2 self-start sm:self-auto"
                                  >
                                    {busy === removeKey ? (
                                      <Loader2
                                        size={15}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <Trash2 size={15} />
                                    )}
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  {batch.status === "arrived_hub" &&
                    ordersInBatch.length > 0 && (
                      <div className="mt-5 border-t border-cream-100 pt-4 space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-forest-900">
                            Hub → Customer Delivery
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Assign each canonical order to a rider rostered for
                            its delivery date.
                          </p>
                        </div>

                        {ordersInBatch.map((order) => {
                          const riderKey = `rider:${order.sales_order_id}`;
                          const dateAssignments = order.delivery_date
                            ? (assignmentsByDate[order.delivery_date] ?? [])
                            : [];

                          const eligibleRiderIds = new Set(
                            dateAssignments.map(
                              (assignment) => assignment.rider_id,
                            ),
                          );

                          const eligibleRiders = riders.filter((rider) =>
                            eligibleRiderIds.has(rider.id),
                          );

                          const assignedRider = order.assigned_rider_id
                            ? riders.find(
                                (rider) => rider.id === order.assigned_rider_id,
                              )
                            : null;

                          return (
                            <div
                              key={order.sales_order_id}
                              className="rounded-xl border border-cream-200 bg-cream-50/40 p-4"
                            >
                              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                <div>
                                  <p className="font-mono text-sm font-semibold text-forest-800">
                                    {order.order_number}
                                  </p>
                                  <p className="text-sm text-gray-700 mt-1">
                                    {order.customer_name}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    Delivery date:{" "}
                                    {order.delivery_date ?? "Not available"}
                                  </p>

                                  {order.delivery_status && (
                                    <p className="text-xs font-semibold text-green-700 mt-1">
                                      Status: {order.delivery_status}
                                      {assignedRider
                                        ? ` • ${assignedRider.email}`
                                        : ""}
                                    </p>
                                  )}
                                </div>

                                <div className="flex flex-col sm:flex-row gap-2 lg:min-w-[420px]">
                                  <select
                                    value={
                                      selectedRiders[order.sales_order_id] ?? ""
                                    }
                                    onChange={(event) =>
                                      setSelectedRiders((current) => ({
                                        ...current,
                                        [order.sales_order_id]:
                                          event.target.value,
                                      }))
                                    }
                                    disabled={
                                      busy !== null ||
                                      order.delivery_status ===
                                        "out_for_delivery" ||
                                      order.delivery_status === "delivered"
                                    }
                                    className="input-field flex-1"
                                  >
                                    <option value="">
                                      {eligibleRiders.length > 0
                                        ? "Select rider"
                                        : "No rider rostered for this date"}
                                    </option>

                                    {eligibleRiders.map((rider) => (
                                      <option key={rider.id} value={rider.id}>
                                        {rider.email}
                                      </option>
                                    ))}
                                  </select>

                                  <button
                                    onClick={() => assignRider(order)}
                                    disabled={
                                      busy !== null ||
                                      !selectedRiders[order.sales_order_id] ||
                                      eligibleRiders.length === 0 ||
                                      order.delivery_status ===
                                        "out_for_delivery" ||
                                      order.delivery_status === "delivered"
                                    }
                                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-forest-700 text-white hover:bg-forest-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                                  >
                                    {busy === riderKey ? (
                                      <Loader2
                                        size={16}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <Truck size={16} />
                                    )}

                                    {order.delivery_status === "ready_for_rider"
                                      ? "Reassign Rider"
                                      : "Assign & Ready For Rider"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
