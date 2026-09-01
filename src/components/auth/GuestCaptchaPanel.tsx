import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { ensureGuestAuthIdentity, guestCaptchaConfigured, guestCaptchaSiteKey } from '../../lib/guestCheckout';

type TurnstileApi = {
  ready: (callback: () => void) => void;
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-freshgo-turnstile]');
    const script = existing ?? document.createElement('script');
    const finish = () => {
      if (!window.turnstile) return reject(new Error('Security check did not load.'));
      window.turnstile.ready(() => resolve(window.turnstile!));
    };
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('Security check is unavailable.')), { once: true });
    if (!existing) {
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.freshgoTurnstile = 'true';
      document.head.appendChild(script);
    }
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise!;
}

export type TurnstileChallengeHandle = { reset: () => void };

export const TurnstileChallenge = forwardRef<TurnstileChallengeHandle, {
  action: string;
  onToken: (token: string) => void;
  busy?: boolean;
  errorMessage?: string | null;
  onReset?: () => void;
  title?: string;
  description?: string;
}>(function TurnstileChallenge({ action, onToken, busy = false, errorMessage, onReset, title = 'Quick security check', description = 'This protects FreshGo from automated abuse.' }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onResetRef = useRef(onReset);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  onTokenRef.current = onToken;
  onResetRef.current = onReset;

  const reset = () => {
    setError(null);
    onResetRef.current?.();
    if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
  };
  useImperativeHandle(ref, () => ({ reset }));

  useEffect(() => {
    if (!guestCaptchaConfigured || !containerRef.current) return;
    let cancelled = false;
    void loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetId.current = turnstile.render(containerRef.current, {
          sitekey: guestCaptchaSiteKey,
          theme: 'auto',
          size: 'flexible',
          action,
          callback: (token: string) => { if (!cancelled) { setError(null); onTokenRef.current(token); } },
          'error-callback': () => {
            onResetRef.current?.();
            setError('Security check is unavailable. Check your connection and retry.');
          },
          'expired-callback': () => {
            onResetRef.current?.();
            setError('Security check expired. Please retry.');
          },
          'timeout-callback': () => {
            onResetRef.current?.();
            setError('Security check timed out. Please retry.');
          },
        });
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setLoading(false); setError('Security check is unavailable. Check your connection and retry.'); } });
    return () => {
      cancelled = true;
      if (window.turnstile && widgetId.current) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action]);

  if (!guestCaptchaConfigured) return null;
  return <section className="rounded-xl border border-forest-200 bg-forest-50/40 p-4" aria-live="polite">
    <div className="mb-3 flex items-start gap-2 text-sm text-forest-900"><ShieldCheck className="mt-0.5 shrink-0" size={18}/><div><p className="font-semibold">{title}</p><p className="mt-1 text-gray-600">{description}</p></div></div>
    <div ref={containerRef} className="min-h-[65px] w-full max-w-full" />
    {(loading || busy) && <p className="mt-2 text-sm text-gray-600">{busy ? 'Verifying securely…' : 'Loading security check…'}</p>}
    {(errorMessage || error) && <div className="mt-3 text-sm text-red-700"><p>{errorMessage || error}</p><button type="button" className="btn-secondary mt-2 inline-flex items-center gap-2 px-3 py-2" onClick={reset}><RefreshCw size={14}/>Retry security check</button></div>}
  </section>;
});

export default function GuestCaptchaPanel({ onVerified }: { onVerified: () => void }) {
  const challenge = useRef<TurnstileChallengeHandle>(null);
  const verificationLock = useRef(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <TurnstileChallenge
    ref={challenge}
    action="guest-checkout"
    busy={verifying}
    errorMessage={error}
    title="Quick security check"
    description="This protects guest checkout from automated abuse."
    onReset={() => { verificationLock.current = false; setVerifying(false); setError(null); }}
    onToken={(token) => {
      if (verificationLock.current) return;
      verificationLock.current = true;
      setVerifying(true);
      setError(null);
      void ensureGuestAuthIdentity(token)
        .then(onVerified)
        .catch(() => {
          verificationLock.current = false;
          setVerifying(false);
          challenge.current?.reset();
          setError('Security check failed or expired. Please try again.');
        });
    }}
  />;
}
