import { Download, Share2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

const DISMISS_KEY = 'freshgo-pwa-install-dismissed-at';
const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosSafari(): boolean {
  const userAgent = window.navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
}

function recentlyDismissed(): boolean {
  try {
    const timestamp = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(timestamp) && Date.now() - timestamp < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Install guidance is optional; unavailable storage should not change app behavior.
  }
}

export default function InstallPrompt() {
  const { language } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    if (isIosSafari()) {
      setVisible(true);
      return;
    }

    const onBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  const dismiss = () => {
    rememberDismissal();
    setVisible(false);
    setShowIosGuide(false);
  };

  const install = async () => {
    if (isIosSafari()) {
      setShowIosGuide(true);
      return;
    }
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome !== 'accepted') rememberDismissal();
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!visible) return null;

  const malay = language === 'ms';
  const title = malay ? 'Pasang FreshGo' : 'Install FreshGo';
  const description = malay
    ? 'Akses FreshGo dengan lebih pantas dari skrin utama anda.'
    : 'Open FreshGo faster from your home screen.';

  return (
    <aside className="fixed bottom-4 left-4 right-4 z-[70] mx-auto max-w-md rounded-2xl border border-forest-100 bg-white p-4 shadow-xl safe-area-bottom" aria-label={title}>
      <button type="button" onClick={dismiss} className="absolute right-2 top-2 touch-target inline-flex items-center justify-center rounded-xl text-gray-400 hover:bg-cream-100 hover:text-charcoal" aria-label={malay ? 'Tutup' : 'Dismiss'}>
        <X size={18} />
      </button>
      <div className="flex gap-3 pr-7">
        <img src="/icons/freshgo-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />
        <div>
          <h2 className="pr-4 text-sm font-bold text-forest-950">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-gray-600">{description}</p>
        </div>
      </div>
      {showIosGuide ? (
        <div className="mt-3 rounded-xl bg-cream-50 p-3 text-sm leading-5 text-gray-700">
          <Share2 size={16} className="mr-1 inline text-forest-700" aria-hidden="true" />
          {malay ? 'Dalam Safari, tekan Kongsi, kemudian pilih “Add to Home Screen”.' : 'In Safari, tap Share, then choose “Add to Home Screen”.'}
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={install} className="btn-primary flex min-h-11 flex-1 items-center justify-center gap-2 px-4 py-2 text-sm">
          <Download size={16} aria-hidden="true" />
          {malay ? 'Pasang' : 'Install'}
        </button>
        <button type="button" onClick={dismiss} className="btn-secondary min-h-11 px-4 py-2 text-sm">
          {malay ? 'Nanti' : 'Not now'}
        </button>
      </div>
    </aside>
  );
}
