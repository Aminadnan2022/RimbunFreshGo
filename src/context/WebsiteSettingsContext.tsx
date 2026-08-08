import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { WebsiteSettings } from '../types';
import { WEBSITE_SETTINGS_DEFAULTS, WEBSITE_SETTINGS_KEYS, WEBSITE_BOOLEAN_KEYS } from '../types';

interface WebsiteSettingsContextType {
  settings: WebsiteSettings;
  loading: boolean;
  /** updated_at of the site_logo row, used to cache-bust the logo URL. */
  logoVersion: string | null;
  updateSettings: (updates: Partial<WebsiteSettings>) => Promise<void>;
  refetch: () => Promise<void>;
}

const WebsiteSettingsContext = createContext<WebsiteSettingsContextType>({
  settings: WEBSITE_SETTINGS_DEFAULTS,
  loading: true,
  logoVersion: null,
  updateSettings: async () => {},
  refetch: async () => {},
});

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  return false;
}

const isBooleanKey = (key: keyof WebsiteSettings): boolean =>
  (WEBSITE_BOOLEAN_KEYS as string[]).includes(key);

let cachedSettings: WebsiteSettings | null = null;
let cachedLogoVersion: string | null = null;
let fetchPromise: Promise<WebsiteSettings | null> | null = null;

async function fetchWebsiteSettings(): Promise<WebsiteSettings | null> {
  if (cachedSettings) return cachedSettings;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('key, value, updated_at')
        .in('key', WEBSITE_SETTINGS_KEYS);

      if (error) {
        console.error('Failed to load website settings:', error.message);
        return null;
      }

      const map = new Map<string, unknown>();
      data?.forEach((row) => map.set(row.key, row.value));

      const logoRow = data?.find((row) => row.key === 'site_logo');
      cachedLogoVersion = logoRow?.updated_at ?? null;

      const settings = { ...WEBSITE_SETTINGS_DEFAULTS } as WebsiteSettings;
      const target = settings as unknown as Record<string, unknown>;
      for (const key of WEBSITE_SETTINGS_KEYS) {
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

export function WebsiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WebsiteSettings>(cachedSettings ?? WEBSITE_SETTINGS_DEFAULTS);
  const [logoVersion, setLogoVersion] = useState<string | null>(cachedLogoVersion);
  const [loading, setLoading] = useState(!cachedSettings);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cachedSettings) return;
      const result = await fetchWebsiteSettings();
      if (cancelled) return;
      if (result) setSettings(result);
      setLogoVersion(cachedLogoVersion);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const updateSettings = useCallback(async (updates: Partial<WebsiteSettings>) => {
    const rows = WEBSITE_SETTINGS_KEYS
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
    cachedSettings = { ...(cachedSettings ?? WEBSITE_SETTINGS_DEFAULTS), ...updates } as WebsiteSettings;

    if ('site_logo' in updates) {
      const now = new Date().toISOString();
      setLogoVersion(now);
      cachedLogoVersion = now;
    }
  }, []);

  const refetch = useCallback(async () => {
    cachedSettings = null;
    const result = await fetchWebsiteSettings();
    if (result) setSettings(result);
    setLogoVersion(cachedLogoVersion);
    setLoading(false);
  }, []);

  const value = useMemo(
    () => ({ settings, loading, logoVersion, updateSettings, refetch }),
    [settings, loading, logoVersion, updateSettings, refetch]
  );

  return (
    <WebsiteSettingsContext.Provider value={value}>
      {children}
    </WebsiteSettingsContext.Provider>
  );
}

export function useWebsiteSettings() {
  return useContext(WebsiteSettingsContext);
}
