import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';

export type Language = 'en' | 'ms';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'language';

function detectBrowserLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  const browserLang = navigator.language.toLowerCase();
  return browserLang.startsWith('ms') ? 'ms' : 'en';
}

function loadTranslations(lang: Language): Record<string, string> {
  const translations: Record<Language, Record<string, string>> = {
    en: import.meta.glob('../locales/en.json', { eager: true }),
    ms: import.meta.glob('../locales/ms.json', { eager: true }),
  };
  const module = translations[lang];
  if (!module) return {};
  const keys = Object.keys(module);
  if (keys.length === 0) return {};
  const mod = module[keys[0]] as { default: Record<string, string> };
  return mod.default;
}

function flattenTranslations(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenTranslations(value as Record<string, unknown>, newKey));
    } else if (typeof value === 'string') {
      result[newKey] = value;
    }
  }
  return result;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en';
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored === 'en' || stored === 'ms') return stored;
    return detectBrowserLanguage();
  });

  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [enFallback, setEnFallback] = useState<Record<string, string>>({});

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    setTranslations(flattenTranslations(loadTranslations(language)));
    setEnFallback(flattenTranslations(loadTranslations('en')));
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    let translation = translations[key] ?? enFallback[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        translation = translation.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
      });
    }
    return translation;
  }, [translations, enFallback]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}