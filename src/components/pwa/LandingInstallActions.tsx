import { Download, ExternalLink, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type InstallState = 'prompt' | 'installed' | 'ios' | 'manual';

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosSafari(): boolean {
  const { userAgent, platform, maxTouchPoints } = window.navigator;
  const ios = /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  return ios && /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
}

export default function LandingInstallActions() {
  const { t } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = useState<InstallState>(() => isStandalone() ? 'installed' : isIosSafari() ? 'ios' : 'manual');
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      event.preventDefault();
      setDeferredPrompt(promptEvent);
      setState('prompt');
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setState('installed');
      setShowGuide(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (state === 'installed') {
      window.location.assign('/');
      return;
    }
    if (state !== 'prompt' || !deferredPrompt) {
      setShowGuide((visible) => !visible);
      return;
    }
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setState(isStandalone() ? 'installed' : 'manual');
  };

  const installLabel = state === 'installed'
    ? t('homepage.install.open')
    : state === 'prompt'
      ? t('homepage.install.install')
      : t('homepage.install.instructions');
  const InstallIcon = state === 'installed' ? ExternalLink : state === 'ios' ? Share2 : Download;

  return (
    <div className="relative mt-7 flex max-w-xl flex-col gap-3 lg:mt-0 lg:items-end">
      <div className="flex flex-wrap gap-3 lg:justify-end">
        <button type="button" onClick={handleInstall} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-jade-400 px-6 py-3 font-bold text-forest-950 transition hover:bg-jade-300 focus:outline-none focus:ring-2 focus:ring-jade-300 focus:ring-offset-2 focus:ring-offset-forest-950">
          <InstallIcon size={17} aria-hidden="true" /> {installLabel}
        </button>
        <Link to="/shop" className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-forest-700 bg-white/10 px-6 py-3 font-bold text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-jade-300 focus:ring-offset-2 focus:ring-offset-forest-950">
          {t('homepage.install.shop')}
        </Link>
      </div>
      {showGuide && (
        <p role="status" className="max-w-md rounded-xl border border-forest-700 bg-forest-900/80 px-4 py-3 text-sm leading-6 text-forest-100">
          {state === 'ios' ? t('homepage.install.iosGuide') : t('homepage.install.manualGuide')}
        </p>
      )}
    </div>
  );
}
