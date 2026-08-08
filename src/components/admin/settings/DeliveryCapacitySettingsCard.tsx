import { useState, useEffect } from 'react';
import { Gauge } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { fetchMaxOrdersPerDay, saveMaxOrdersPerDay } from '../../../data/delivery';
import { SectionCard, SaveBar } from './shared';

export default function DeliveryCapacitySettingsCard() {
  const { t } = useLanguage();
  const [value, setValue] = useState<number>(20);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchMaxOrdersPerDay()
      .then((v) => { setValue(v); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const hasChanges = value !== undefined && loaded;

  const handleSave = async () => {
    setSaving(true);
    setStatus('idle');
    try {
      await saveMaxOrdersPerDay(value);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 4000);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : t("adminSettings.deliveryCapacity.failedSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    fetchMaxOrdersPerDay().then((v) => setValue(v));
    setStatus('idle');
  };

  if (!loaded) return null;

  return (
    <SectionCard
      icon={Gauge}
      title={t("adminSettings.deliveryCapacity.title")}
      description={t("adminSettings.deliveryCapacity.description")}
    >
      <div className="max-w-xs">
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          {t("adminSettings.deliveryCapacity.maxOrders")}
        </label>
        <input
          type="number"
          min={1}
          max={500}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-full bg-cream-50 border border-cream-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-all"
        />
        <p className="text-xs text-gray-400 mt-1.5">{t("adminSettings.deliveryCapacity.helper")}</p>
      </div>
      <SaveBar hasChanges={hasChanges} saving={saving} status={status} errorMsg={errorMsg} onSave={handleSave} onReset={handleReset} />
    </SectionCard>
  );
}
