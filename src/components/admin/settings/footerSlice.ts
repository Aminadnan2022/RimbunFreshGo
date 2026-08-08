import { useState, useEffect } from 'react';
import type { FooterSettings } from '../../../types';
import { useFooterSettings } from '../../../context/FooterSettingsContext';

export interface FooterSlice {
  draft: FooterSettings;
  loading: boolean;
  set: (key: keyof FooterSettings) => (value: string) => void;
  setBool: (key: keyof FooterSettings) => (value: boolean) => void;
  hasChanges: boolean;
  handleSave: () => Promise<void>;
  handleReset: () => void;
  saving: boolean;
  status: 'idle' | 'success' | 'error';
  errorMsg: string;
}

export function useFooterSlice(keys: (keyof FooterSettings)[]): FooterSlice {
  const { settings, loading, updateSettings } = useFooterSettings();
  const [draft, setDraft] = useState<FooterSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!loading) setDraft(settings);
  }, [settings, loading]);

  const set = (key: keyof FooterSettings) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const setBool = (key: keyof FooterSettings) => (value: boolean) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const hasChanges = keys.some((key) => draft[key] !== settings[key]);

  const handleSave = async () => {
    setStatus('idle');
    setSaving(true);
    try {
      const changed: Partial<FooterSettings> = {};
      for (const key of keys) {
        if (draft[key] !== settings[key]) {
          (changed as Record<string, unknown>)[key] = draft[key];
        }
      }
      if (Object.keys(changed).length > 0) await updateSettings(changed);
      setStatus('success');
    } catch (err) {
      console.error('Failed to save settings:', err);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(settings);
    setStatus('idle');
  };

  return { draft, loading, set, setBool, hasChanges, handleSave, handleReset, saving, status, errorMsg };
}
