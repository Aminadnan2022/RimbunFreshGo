export type CanonicalPaymentStatus = 'pending' | 'receipt_submitted' | 'rejected' | 'paid';
export type CanonicalPriceStatus = 'estimated' | 'final';

export type CustomerPaymentPresentation = {
  label: 'Payment Pending' | 'Ready To Pay' | 'Receipt Submitted' | 'Payment Confirmed';
  tone: 'amber' | 'orange' | 'blue' | 'green';
  awaitingVerification: boolean;
  showPaymentQr: boolean;
  allowReceiptUpload: boolean;
};

export function resolveCustomerPaymentPresentation(input: {
  canonicalPaymentStatus?: CanonicalPaymentStatus | null;
  canonicalPriceStatus?: CanonicalPriceStatus | null;
  legacyPaymentStatus?: 'Pending' | 'Ready To Pay' | 'Paid';
}): CustomerPaymentPresentation {
  const { canonicalPaymentStatus, canonicalPriceStatus, legacyPaymentStatus } = input;

  if (canonicalPaymentStatus === 'paid') {
    return { label: 'Payment Confirmed', tone: 'green', awaitingVerification: false, showPaymentQr: false, allowReceiptUpload: false };
  }
  if (canonicalPaymentStatus === 'receipt_submitted') {
    return { label: 'Receipt Submitted', tone: 'blue', awaitingVerification: true, showPaymentQr: false, allowReceiptUpload: false };
  }
  if (canonicalPriceStatus === 'final' && (canonicalPaymentStatus === 'pending' || canonicalPaymentStatus === 'rejected')) {
    return { label: 'Ready To Pay', tone: 'orange', awaitingVerification: false, showPaymentQr: true, allowReceiptUpload: true };
  }
  if (canonicalPaymentStatus || canonicalPriceStatus) {
    return { label: 'Payment Pending', tone: 'amber', awaitingVerification: false, showPaymentQr: false, allowReceiptUpload: false };
  }
  if (legacyPaymentStatus === 'Paid') {
    return { label: 'Payment Confirmed', tone: 'green', awaitingVerification: false, showPaymentQr: false, allowReceiptUpload: false };
  }
  if (legacyPaymentStatus === 'Ready To Pay') {
    return { label: 'Ready To Pay', tone: 'orange', awaitingVerification: false, showPaymentQr: true, allowReceiptUpload: true };
  }
  return { label: 'Payment Pending', tone: 'amber', awaitingVerification: false, showPaymentQr: false, allowReceiptUpload: false };
}
