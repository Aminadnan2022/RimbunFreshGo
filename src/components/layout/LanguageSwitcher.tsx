import { useState } from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';

function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);

  const languages: { code: 'en' | 'ms'; labelKey: string; flag: string }[] = [
    { code: 'en', labelKey: 'language.english', flag: '🇬🇧' },
    { code: 'ms', labelKey: 'language.melayu', flag: '🇲🇾' },
  ];

  const current = languages.find(l => l.code === language) ?? languages[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="touch-target flex items-center justify-center gap-0 px-2 py-2 rounded-xl text-sm font-medium text-forest-700 bg-forest-50 border border-forest-200 hover:bg-forest-100 transition-all sm:gap-1.5 sm:px-3"
        aria-label={t('language.select') || 'Select language'}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Globe size={16} />
        <span className="hidden sm:inline">{current.flag} {current.code.toUpperCase()}</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <ul
            className="absolute right-0 mt-1.5 z-50 min-w-[160px] bg-white rounded-xl shadow-lg border border-cream-200 overflow-hidden animate-[fadeSlideUp_0.15s_ease-out]"
            role="listbox"
            aria-label={t('language.select') || 'Select language'}
          >
            {languages.map(lang => (
              <li key={lang.code} role="option" aria-selected={lang.code === language}>
                <button
                  onClick={() => { setLanguage(lang.code); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                    lang.code === language
                      ? 'bg-forest-50 text-forest-800'
                      : 'text-gray-700 hover:bg-forest-50 hover:text-forest-800'
                  }`}
                >
                  <span className="text-base">{lang.flag}</span>
                  <span>{t(lang.labelKey)}</span>
                  {lang.code === language && (
                    <span className="ml-auto text-forest-600">✓</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default LanguageSwitcher;
