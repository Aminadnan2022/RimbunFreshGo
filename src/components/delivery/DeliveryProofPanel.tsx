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

  const completedCount =
    (closeup ? 1 : 0) +
    (placement ? 1 : 0);

  const readyToComplete = completedCount === 2;

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
      <div className="mt-4 rounded-2xl border border-cream-200 bg-white p-5 shadow-soft">
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 size={18} className="animate-spin text-forest-600" />
          Loading delivery proof...
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/50 shadow-soft">
      <div className="border-b border-amber-100 bg-white/80 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Camera size={18} />
              </div>

              <div>
                <h3 className="font-semibold text-gray-900">
                  Proof of Delivery
                </h3>

                <p className="mt-0.5 text-xs text-gray-500">
                  2 photos are required before delivery can be completed.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadProofs()}
            disabled={uploading !== null || completing}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-cream-200 bg-white text-forest-700 transition-all hover:bg-cream-50 disabled:opacity-40"
            aria-label="Refresh delivery proof"
          >
            <RefreshCcw size={16} />
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-semibold">
              Unable to continue
            </p>

            <p className="mt-1 text-xs leading-relaxed">
              {error}
            </p>
          </div>
        )}

        <div className="space-y-4">
          <ProofPhotoCard
            proofType="closeup"
            step="1"
            title="Package Close-up"
            description="Take a close photo of the delivered bags. Make sure the writing or label on the plastic is clearly visible."
            proof={closeup}
            uploading={uploading === 'closeup'}
            disabled={uploading !== null || completing}
            onFile={(file) => void upload('closeup', file)}
          />

          <ProofPhotoCard
            proofType="placement"
            step="2"
            title="Delivery Placement"
            description="Take a wider photo showing clearly where the order has been left for the customer."
            proof={placement}
            uploading={uploading === 'placement'}
            disabled={uploading !== null || completing}
            onFile={(file) => void upload('placement', file)}
          />
        </div>

        <div
          className={`mt-4 rounded-xl border p-4 ${
            readyToComplete
              ? 'border-green-200 bg-green-50'
              : 'border-amber-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Delivery proof progress
              </p>

              <p className="mt-0.5 text-xs text-gray-500">
                {completedCount} of 2 required photos completed
              </p>
            </div>

            <span
              className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                readyToComplete
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {readyToComplete && <CheckCircle2 size={13} />}
              {readyToComplete ? 'Ready' : 'Required'}
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
          className={`mt-4 w-full inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-bold transition-all ${
            readyToComplete
              ? 'bg-green-600 text-white shadow-sm hover:bg-green-700'
              : 'cursor-not-allowed bg-gray-200 text-gray-400'
          } disabled:opacity-70`}
        >
          {completing ? (
            <Loader2 size={19} className="animate-spin" />
          ) : (
            <PackageCheck size={19} />
          )}

          {completing
            ? 'Completing Delivery...'
            : 'Mark Delivered'}
        </button>

        {!readyToComplete && (
          <p className="mt-2 text-center text-xs font-medium text-amber-700">
            Complete both photo steps to enable Mark Delivered.
          </p>
        )}
      </div>
    </div>
  );
}

interface ProofPhotoCardProps {
  proofType: DeliveryProofType;
  step: string;
  title: string;
  description: string;
  proof: DeliveryProof | null;
  uploading: boolean;
  disabled: boolean;
  onFile: (file: File | undefined) => void;
}

function ProofPhotoCard({
  proofType,
  step,
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
      className={`overflow-hidden rounded-2xl border ${
        proof
          ? 'border-green-200 bg-green-50/40'
          : 'border-cream-200 bg-white'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              proof
                ? 'bg-green-600 text-white'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {proof ? (
              <CheckCircle2 size={18} />
            ) : (
              step
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">
                {step}. {title}
              </p>

              {proof && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                  Uploaded
                </span>
              )}
            </div>

            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              {description}
            </p>
          </div>
        </div>

        {proof?.signedUrl && (
          <div className="mt-3 overflow-hidden rounded-xl border border-green-200 bg-black">
            <img
              src={proof.signedUrl}
              alt={title}
              className="h-44 w-full object-contain sm:h-52"
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

            // Allow choosing the same image again after failed upload.
            event.target.value = '';
          }}
        />

        <label
          htmlFor={inputId}
          className={`mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
            disabled
              ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 opacity-60'
              : proof
                ? 'cursor-pointer border-green-200 bg-white text-green-700 hover:bg-green-50 active:bg-green-100'
                : 'cursor-pointer border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200 active:bg-amber-300'
          }`}
        >
          {uploading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : proof ? (
            <RefreshCcw size={17} />
          ) : (
            <Camera size={18} />
          )}

          {uploading
            ? 'Uploading Photo...'
            : proof
              ? 'Retake / Replace Photo'
              : 'Take Photo'}
        </label>
      </div>
    </div>
  );
}
