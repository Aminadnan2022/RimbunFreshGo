import { useState, useEffect } from 'react';
import { ListOrdered } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { useWebsiteSettings } from '../../../context/WebsiteSettingsContext';
import { SectionCard, SaveBar } from './shared';

const SORT_OPTIONS = ['manual', 'name', 'price_low', 'price_high', 'newest'] as const;

export default function DisplaySortingSettingsCard() {
  const { t } = useLanguage();
  const { settings, updateSettings } = useWebsiteSettings();
  const [productSort, setProductSort] = useState<string>(settings.default_product_sort);
  const [comboSort, setComboSort] = useState<string>(settings.default_combo_sort);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setProductSort(settings.default_product_sort);
    setComboSort(settings.default_combo_sort);
  }, [settings.default_product_sort, settings.default_combo_sort]);

  const hasChanges =
    productSort !== settings.default_product_sort || comboSort !== settings.default_combo_sort;

  const handleSave = async () => {
    setStatus('idle');
    setSaving(true);
    try {
      await updateSettings({ default_product_sort: productSort, default_combo_sort: comboSort });
      setStatus('success');
    } catch (err) {
      console.error('Failed to save sorting settings:', err);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setProductSort(settings.default_product_sort);
    setComboSort(settings.default_combo_sort);
    setStatus('idle');
  };

  const selectCls =
    'w-full bg-cream-50 border border-cream-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-forest-500 transition-all';

  return (
    <SectionCard
      icon={ListOrdered}
      title={t('adminSettings.sorting.title')}
      description={t('adminSettings.sorting.description')}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            {t('adminSettings.sorting.defaultProductSort')}
          </label>
          <select value={productSort} onChange={(e) => setProductSort(e.target.value)} className={selectCls}>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {t('adminSettings.sorting.' + opt)}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1.5">{t('adminSettings.sorting.defaultProductSortHelper')}</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            {t('adminSettings.sorting.defaultComboSort')}
          </label>
          <select value={comboSort} onChange={(e) => setComboSort(e.target.value)} className={selectCls}>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {t('adminSettings.sorting.' + opt)}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1.5">{t('adminSettings.sorting.defaultComboSortHelper')}</p>
        </div>
      </div>

      <SaveBar hasChanges={hasChanges} saving={saving} status={status} errorMsg={errorMsg} onSave={handleSave} onReset={handleReset} />
    </SectionCard>
  );
}
