import CanonicalSupplierDeliveryBatches from './CanonicalSupplierDeliveryBatches';

/**
 * Canonical delivery operations.
 *
 * Legacy delivery batches remain in the database for historical compatibility,
 * but are intentionally no longer exposed in the active Admin UI.
 */
export default function DeliveryBatchesManager() {
  return (
    <div className="space-y-8">
      <CanonicalSupplierDeliveryBatches />
    </div>
  );
}
