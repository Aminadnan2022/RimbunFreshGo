import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  availableOnboardingSteps,
  dismissOnboarding,
  mobilePopoverWidth,
  shouldShowOnboarding,
  type OnboardingPageId,
  type OnboardingStep,
} from '../../lib/onboarding';

type Props = { page: OnboardingPageId; steps: readonly OnboardingStep[]; enabled?: boolean };
const TARGET_GAP = 8;
const VIEWPORT_GAP = 16;

export default function OnboardingTour({ page, steps, enabled = true }: Props) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [activeSteps, setActiveSteps] = useState<OnboardingStep[]>([]);
  const [current, setCurrent] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [modeRevision, setModeRevision] = useState(0);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const stepSignature = useMemo(() => JSON.stringify(steps), [steps]);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  useEffect(() => {
    const handleModeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (!detail?.userId || detail.userId === user?.id) {
        setModeRevision((revision) => revision + 1);
      }
    };
    window.addEventListener('freshgo:onboarding-mode-change', handleModeChange);
    return () => window.removeEventListener('freshgo:onboarding-mode-change', handleModeChange);
  }, [user?.id]);

  useEffect(() => {
    if (!enabled || !user || !shouldShowOnboarding(localStorage, user.id, page)) {
      setActiveSteps([]);
      return;
    }
    const timer = window.setTimeout(() => {
      const available = availableOnboardingSteps(stepsRef.current, (selector) => document.querySelector(selector));
      if (available.length) { setCurrent(0); setActiveSteps(available); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [enabled, modeRevision, page, stepSignature, user]);

  const step = activeSteps[current];
  useEffect(() => {
    if (!step) { setRect(null); return; }
    const target = document.querySelector(step.target);
    if (!target) {
      setActiveSteps((currentSteps) => currentSteps.filter((candidate) => candidate !== step));
      setCurrent((index) => Math.max(0, index - 1));
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    const update = () => setRect(target.getBoundingClientRect());
    const frame = window.requestAnimationFrame(update);
    const settle = window.setTimeout(update, 300);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    nextButtonRef.current?.focus({ preventScroll: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step]);

  if (!user || !step || !rect) return null;
  const dismiss = (outcome: 'skip' | 'finish') => {
    dismissOnboarding(localStorage, user.id, page, outcome);
    setActiveSteps([]);
  };
  const finish = () => dismiss('finish');
  const skip = () => dismiss('skip');
  const next = () => current === activeSteps.length - 1 ? finish() : setCurrent((index) => index + 1);
  const back = () => setCurrent((index) => Math.max(0, index - 1));
  const width = mobilePopoverWidth(window.innerWidth);
  const isMobile = window.innerWidth < 640;
  const targetTop = Math.max(VIEWPORT_GAP, rect.top - TARGET_GAP);
  const targetLeft = Math.max(VIEWPORT_GAP, rect.left - TARGET_GAP);
  const targetWidth = Math.min(window.innerWidth - targetLeft - VIEWPORT_GAP, rect.width + TARGET_GAP * 2);
  const targetHeight = Math.min(window.innerHeight - targetTop - VIEWPORT_GAP, rect.height + TARGET_GAP * 2);
  const desktopLeft = Math.min(window.innerWidth - width - VIEWPORT_GAP, Math.max(VIEWPORT_GAP, rect.left + rect.width / 2 - width / 2));
  const desktopTop = window.innerHeight - rect.bottom >= 250 ? Math.min(window.innerHeight - 220, rect.bottom + 16) : Math.max(VIEWPORT_GAP, rect.top - 220);

  return createPortal(
    <div className="fixed inset-0 z-[80]" onKeyDown={(event) => {
      if (event.key === 'Escape') skip();
      if (event.key === 'ArrowRight') next();
      if (event.key === 'ArrowLeft' && current > 0) back();
    }}>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed rounded-2xl border-2 border-jade-300 transition-all duration-200"
        style={{
          top: targetTop,
          left: targetLeft,
          width: targetWidth,
          height: targetHeight,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45), 0 0 0 4px rgba(134, 239, 181, 0.3)',
        }}
      />
      <section role="dialog" aria-modal="true" aria-label={language === 'ms' ? 'Panduan FreshGo' : 'FreshGo tutorial'} className={`fixed max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-forest-100 bg-white p-5 shadow-2xl ${isMobile ? 'bottom-[max(1rem,env(safe-area-inset-bottom))]' : ''}`} style={{ width, left: isMobile ? VIEWPORT_GAP : desktopLeft, top: isMobile ? undefined : desktopTop }}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-jade-600">{language === 'ms' ? 'Panduan FreshGo' : 'FreshGo tutorial'}</p><p className="mt-1 text-xs font-medium text-gray-400">{current + 1} of {activeSteps.length}</p></div>
          <button type="button" onClick={skip} className="-mr-1 -mt-1 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label={language === 'ms' ? 'Langkau tutorial' : 'Skip tutorial'}><X size={18} /></button>
        </div>
        <p className="text-[15px] leading-6 text-gray-700">{step.body}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" onClick={skip} className="min-h-11 px-1 text-sm font-semibold text-gray-500 hover:text-forest-700">{language === 'ms' ? 'Langkau' : 'Skip'}</button>
          <div className="flex gap-2">
            {current > 0 && <button type="button" onClick={back} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-cream-300 px-3 text-sm font-semibold text-gray-700 hover:bg-cream-50"><ChevronLeft size={16} /> {language === 'ms' ? 'Kembali' : 'Back'}</button>}
            <button ref={nextButtonRef} type="button" onClick={next} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-forest-700 px-4 text-sm font-semibold text-white hover:bg-forest-800 focus:outline-none focus:ring-2 focus:ring-jade-400 focus:ring-offset-2">
              {current === activeSteps.length - 1 ? <>{language === 'ms' ? 'Selesai' : 'Finish'} <Check size={16} /></> : <>{language === 'ms' ? 'Seterusnya' : 'Next'} <ChevronRight size={16} /></>}
            </button>
          </div>
        </div>
      </section>
    </div>, document.body,
  );
}
