import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { isTutorialModeOn, setTutorialMode } from '../../lib/onboarding';

type Props = {
  onEnabled?: () => void;
};

export default function TutorialModeSwitch({ onEnabled }: Props) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(Boolean(user && isTutorialModeOn(localStorage, user.id)));
  }, [user]);

  if (!user) return null;

  const toggle = () => {
    const nextEnabled = !enabled;
    setTutorialMode(localStorage, user.id, nextEnabled);
    setEnabled(nextEnabled);
    window.dispatchEvent(new CustomEvent('freshgo:onboarding-mode-change', {
      detail: { userId: user.id, enabled: nextEnabled },
    }));
    if (nextEnabled) onEnabled?.();
  };

  const stateLabel = enabled ? 'ON' : 'OFF';

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-4 sm:w-auto">
      <span className="text-sm font-bold text-forest-800" aria-hidden="true">{stateLabel}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={language === 'ms' ? `Tutorial FreshGo ${stateLabel}` : `FreshGo Tutorial ${stateLabel}`}
        onClick={toggle}
        className={`relative inline-flex h-11 w-[4.5rem] shrink-0 items-center rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-jade-400 focus:ring-offset-2 ${
          enabled ? 'border-forest-700 bg-forest-700' : 'border-gray-300 bg-gray-200'
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-8 w-8 rounded-full bg-white shadow-md transition-transform ${
            enabled ? 'translate-x-8' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
