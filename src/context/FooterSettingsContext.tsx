import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { FooterSettings } from '../types';
import { FOOTER_SETTINGS_DEFAULTS, FOOTER_SETTINGS_KEYS, FOOTER_BOOLEAN_KEYS } from '../types';

interface FooterSettingsContextType {
  settings: FooterSettings;
  loading: boolean;
  updateSettings: (updates: Partial<FooterSettings>) => Promise<void>;
  refetch: () => Promise<void>;
}

const FooterSettingsContext = createContext<FooterSettingsContextType>({
  settings: FOOTER_SETTINGS_DEFAULTS,
  loading: true,
  updateSettings: async () => {},
  refetch: async () => {},
});

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  return false;
}

const isBooleanKey = (key: keyof FooterSettings): boolean =>
  (FOOTER_BOOLEAN_KEYS as string[]).includes(key);

let cachedSettings: FooterSettings | null = null;
let fetchPromise: Promise<FooterSettings | null> | null = null;

async function fetchFooterSettings(): Promise<FooterSettings | null> {
  if (cachedSettings) return cachedSettings;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('key, value')
        .in('key', FOOTER_SETTINGS_KEYS);

      if (error) {
        console.error('Failed to load footer settings:', error.message);
        return null;
      }

      const map = new Map<string, unknown>();
      data?.forEach((row) => map.set(row.key, row.value));

      const settings = { ...FOOTER_SETTINGS_DEFAULTS } as FooterSettings;
      const target = settings as unknown as Record<string, unknown>;
      for (const key of FOOTER_SETTINGS_KEYS) {
        if (map.has(key)) {
          const raw = map.get(key);
          target[key] = isBooleanKey(key)
            ? parseBoolean(raw)
            : String(raw ?? '');
        }
      }
      cachedSettings = settings;
      return settings;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

export function FooterSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<FooterSettings>(cachedSettings ?? FOOTER_SETTINGS_DEFAULTS);
  const [loading, setLoading] = useState(!cachedSettings);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cachedSettings) return;
      const result = await fetchFooterSettings();
      if (cancelled) return;
      if (result) setSettings(result);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const updateSettings = useCallback(async (updates: Partial<FooterSettings>) => {
    const rows = FOOTER_SETTINGS_KEYS
      .filter((key) => key in updates)
      .map((key) => ({
        key,
        value: isBooleanKey(key)
          ? (updates[key] === true ? 'true' : 'false')
          : String(updates[key] ?? ''),
        updated_at: new Date().toISOString(),
      }));

    if (rows.length === 0) return;

    const { error } = await supabase
      .from('site_settings')
      .upsert(rows, { onConflict: 'key' });

    if (error) throw error;

    setSettings((prev) => ({ ...prev, ...updates }));
    cachedSettings = { ...(cachedSettings ?? FOOTER_SETTINGS_DEFAULTS), ...updates } as FooterSettings;
  }, []);

  const refetch = useCallback(async () => {
    cachedSettings = null;
    const result = await fetchFooterSettings();
    if (result) setSettings(result);
    setLoading(false);
  }, []);

  const value = useMemo(
    () => ({ settings, loading, updateSettings, refetch }),
    [settings, loading, updateSettings, refetch]
  );

  return (
    <FooterSettingsContext.Provider value={value}>
      {children}
    </FooterSettingsContext.Provider>
  );
}

export function useFooterSettings() {
  return useContext(FooterSettingsContext);
}
