import type { Language } from '../../context/LanguageContext';
import type { OnboardingStep } from '../../lib/onboarding';

const copy = (language: Language, ms: string, en: string) => language === 'ms' ? ms : en;

export function shopTour(language: Language): OnboardingStep[] {
  return [
    { target: '[data-onboarding="shop-search"]', body: copy(language, 'Cari ayam, ikan atau seafood di sini.', 'Search for chicken, fish or seafood here.') },
    { target: '[data-onboarding="shop-categories"]', body: copy(language, 'Tekan kategori untuk tapis produk.', 'Tap a category to filter products.') },
    { target: '[data-onboarding="family-combo"]', body: copy(language, 'Nak lebih jimat? Tengok Family Combo.', 'Want more value? Take a look at Family Combo.') },
    { target: '[data-onboarding="cart"]', body: copy(language, 'Barang yang dipilih akan masuk ke Cart di sini.', 'Items you choose will appear in your Cart here.') },
  ];
}

export function productDetailTour(language: Language, weighted: boolean): OnboardingStep[] {
  const weightedNote = weighted
    ? copy(language, ' Harga akhir akan dikemaskini selepas berat sebenar disahkan.', ' The final price will be updated after the actual weight is confirmed.')
    : '';
  return [
    { target: '[data-onboarding="product-price"]', body: copy(language, 'Semak harga dan unit jualan di sini.', 'Check the price and selling unit here.') + weightedNote },
    { target: '[data-onboarding="product-quantity"]', body: copy(language, 'Pilih kuantiti.', 'Choose the quantity.') },
    { target: '[data-onboarding="product-add-to-cart"]', body: copy(language, 'Tekan Add to Cart bila dah siap.', 'Tap Add to Cart when you are ready.') },
  ];
}

export function cartTour(language: Language): OnboardingStep[] {
  return [
    { target: '[data-onboarding="cart-items"]', body: copy(language, 'Semak semua barang sebelum checkout.', 'Check all your items before checkout.') },
    { target: '[data-onboarding="cart-edit"]', body: copy(language, 'Anda masih boleh ubah kuantiti atau buang item.', 'You can still change the quantity or remove an item.') },
    { target: '[data-onboarding="cart-checkout"]', body: copy(language, 'Tekan Proceed to Checkout untuk teruskan.', 'Tap Proceed to Checkout to continue.') },
  ];
}

export function checkoutTour(language: Language): OnboardingStep[] {
  return [
    { target: '[data-onboarding="checkout-address"]', body: copy(language, 'Pastikan alamat penghantaran betul.', 'Make sure the delivery address is correct.') },
    { target: '[data-onboarding="checkout-delivery-fee"]', body: copy(language, 'Caj penghantaran akan dipaparkan di sini.', 'The delivery fee will be shown here.') },
    { target: '[data-onboarding="checkout-summary"]', body: copy(language, 'Semak order sebelum confirm.', 'Check your order before confirming.') },
    { target: '[data-onboarding="checkout-next"]', body: copy(language, 'Tekan Continue to Preparation untuk teruskan ke langkah seterusnya.', 'Tap Continue to Preparation to move to the next step.') },
  ];
}

export function paymentReceiptTour(language: Language, submitAction: 'upload' | 'submit' = 'submit'): OnboardingStep[] {
  return [
    { target: '[data-onboarding="payment-amount"]', body: copy(language, 'Bayar jumlah yang dipaparkan.', 'Pay the amount shown here.') },
    { target: '[data-onboarding="payment-gallery"]', body: copy(language, 'Upload bukti pembayaran dari gallery.', 'Upload your proof of payment from the gallery.') },
    { target: '[data-onboarding="payment-camera"]', body: copy(language, 'Atau ambil gambar terus menggunakan camera.', 'Or take a photo directly with the camera.') },
    {
      target: '[data-onboarding="payment-submit"]',
      body: submitAction === 'upload'
        ? copy(language, 'Selepas pilih fail, tekan Upload Receipt.', 'After choosing a file, tap Upload Receipt.')
        : copy(language, 'Tekan Submit Payment Receipt selepas selesai.', 'Tap Submit Payment Receipt when you are done.'),
    },
  ];
}

export function orderTrackingTour(language: Language): OnboardingStep[] {
  return [
    { target: '[data-onboarding="tracking-timeline"]', body: copy(language, 'Ikuti perkembangan order anda di sini.', 'Follow your order progress here.') },
    { target: '[data-onboarding="tracking-preparing"]', body: copy(language, 'Preparing — order sedang disediakan.', 'Preparing — your order is being prepared.') },
    { target: '[data-onboarding="tracking-ready-for-rider"]', body: copy(language, 'Ready for Rider — barang dah siap untuk rider.', 'Ready for Rider — your order is ready for the rider.') },
    { target: '[data-onboarding="tracking-out-for-delivery"]', body: copy(language, 'Out for Delivery — rider sedang menghantar.', 'Out for Delivery — the rider is delivering your order.') },
    { target: '[data-onboarding="tracking-delivered"]', body: copy(language, 'Delivered — barang telah sampai.', 'Delivered — your order has arrived.') },
  ];
}
