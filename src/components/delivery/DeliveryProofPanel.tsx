import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Image,
  Loader2,
  PackageCheck,
  RefreshCcw,
} from 'lucide-react';

import {
  fetchCanonicalDeliveryProofs,
  markOrderDelivered,
  uploadCanonicalDeliveryProof,
  type DeliveryProof,
  type DeliveryProofType,
} from '../../data/deliveryRider';

interface DeliveryProofPanelProps {
  salesOrderId: string;
  onCompleted: () => Promise<void> | void;
}

function describeError(err: unknown): string {
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string'
  ) {
    return String((err as { message: string }).message);
  }

  return 'Something went wrong.';
}

function proofFor(
  proofs: DeliveryProof[],
  proofType: DeliveryProofType,
): DeliveryProof | null {
  return proofs.find((proof) => proof.proofType === proofType) ?? null;
}

export default function DeliveryProofPanel({
  salesOrderId,
  onCompleted,
}: DeliveryProofPanelProps) {
  const [proofs, setProofs] = useState<DeliveryProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<DeliveryProofType | null>(null);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProofs = useCallback(async () => {
    setError(null);

    try {
      const rows = await fetchCanonicalDeliveryProofs(salesOrderId);
      setProofs(rows);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [salesOrderId]);

  useEffect(() => {
    setLoading(true);
    void loadProofs();
  }, [loadProofs]);

  const closeup = useMemo(
    () => proofFor(proofs, 'closeup'),
    [proofs],
  );

  const placement = useMemo(
    () => proofFor(proofs, 'placement'),
    [proofs],
  );

  const readyToComplete = Boolean(closeup && placement);

  const upload = async (
    proofType: DeliveryProofType,
    file: File | undefined,
  ) => {
    if (!file) return;

    setUploading(proofType);
    setError(null);

    try {
      const uploaded = await uploadCanonicalDeliveryProof(
        salesOrderId,
        proofType,
        file,
      );

      setProofs((current) => [
        ...current.filter((proof) => proof.proofType !== proofType),
        uploaded,
      ]);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setUploading(null);
    }
  };

  const completeDelivery = async () => {
    if (!readyToComplete) {
      setError(
        'Both delivery proof photos are required before marking the order delivered.',
      );
      return;
    }

    setCompleting(true);
    setError(null);

    try {
      await markOrderDelivered(salesOrderId);
      await onCompleted();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-4 rounded-2xl border border-cream-200 bg-cream-50 p-5">
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 size={17} className="animate-spin" />
          Loading delivery proof...
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-amber-700" />

            <h3 className="font-semibold text-gray-900">
              Proof of Delivery
            </h3>
          </div>

          <p className="text-xs text-gray-600 mt-1">
            Take both photos before marking this order as delivered.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadProofs()}
          disabled={uploading !== null || completing}
          className="p-2 rounded-lg border border-amber-200 bg-white text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          aria-label="Refresh delivery proof"
        >
          <RefreshCcw size={15} />
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <ProofPhotoCard
          proofType="closeup"
          title="1. Close-up Photo"
          description="Take a close photo of the delivered bags. The writing or label on the plastic must be clearly visible."
          proof={closeup}
          uploading={uploading === 'closeup'}
          disabled={uploading !== null || completing}
          onFile={(file) => void upload('closeup', file)}
        />

        <ProofPhotoCard
          proofType="placement"
          title="2. Placement Photo"
          description="Take a wider photo showing clearly where the order was left for the customer."
          proof={placement}
          uploading={uploading === 'placement'}
          disabled={uploading !== null || completing}
          onFile={(file) => void upload('placement', file)}
        />
      </div>

      <div className="mt-4 rounded-xl bg-white border border-cream-200 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              Delivery proof
            </p>

            <p className="text-xs text-gray-500 mt-0.5">
              {(closeup ? 1 : 0) + (placement ? 1 : 0)} of 2 required photos completed
            </p>
          </div>

          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
              readyToComplete
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {readyToComplete && <CheckCircle2 size={13} />}
            {readyToComplete ? 'Complete' : 'Required'}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void completeDelivery()}
        disabled={
          !readyToComplete ||
          uploading !== null ||
          completing
        }
        className="mt-3 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {completing ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <PackageCheck size={18} />
        )}

        {completing
          ? 'Completing Delivery...'
          : 'Mark Delivered'}
      </button>

      {!readyToComplete && (
        <p className="text-center text-xs text-amber-700 mt-2">
          Both photos are mandatory.
        </p>
      )}
    </div>
  );
}

interface ProofPhotoCardProps {
  proofType: DeliveryProofType;
  title: string;
  description: string;
  proof: DeliveryProof | null;
  uploading: boolean;
  disabled: boolean;
  onFile: (file: File | undefined) => void;
}

function ProofPhotoCard({
  proofType,
  title,
  description,
  proof,
  uploading,
  disabled,
  onFile,
}: ProofPhotoCardProps) {
  const inputId = `delivery-proof-${proofType}`;

  return (
    <div
      className={`rounded-xl border p-3 ${
        proof
          ? 'border-green-200 bg-green-50/60'
          : 'border-amber-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {proof ? (
              <CheckCircle2
                size={17}
                className="text-green-600 flex-shrink-0"
              />
            ) : (
              <Image
                size={17}
                className="text-amber-600 flex-shrink-0"
              />
            )}

            <p className="text-sm font-semibold text-gray-900">
              {title}
            </p>
          </div>

          <p className="text-xs text-gray-500 mt-1">
            {description}
          </p>
        </div>

        {proof && (
          <span className="rounded-full bg-green-100 text-green-700 text-[11px] font-semibold px-2 py-1">
            Uploaded
          </span>
        )}
      </div>

      {proof?.signedUrl && (
        <div className="mt-3 overflow-hidden rounded-xl border border-green-200 bg-white">
          <img
            src={proof.signedUrl}
            alt={title}
            className="w-full max-h-64 object-cover"
          />
        </div>
      )}

      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          onFile(file);

          // Allow selecting the same image again after a failed attempt.
          event.target.value = '';
        }}
      />

      <label
        htmlFor={inputId}
        className={`mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
          disabled
            ? 'cursor-not-allowed opacity-50 border-gray-200 bg-gray-100 text-gray-400'
            : proof
              ? 'cursor-pointer border-green-200 bg-white text-green-700 hover:bg-green-50'
              : 'cursor-pointer border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
        }`}
      >
        {uploading ? (
          <Loader2 size={17} className="animate-spin" />
        ) : (
          <Camera size={17} />
        )}

        {uploading
          ? 'Uploading...'
          : proof
            ? 'Retake / Replace Photo'
            : 'Take Photo'}
      </label>
    </div>
  );
}
