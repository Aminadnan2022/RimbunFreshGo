import { useState } from 'react';
import { LayoutDashboard, Navigation, Home, Briefcase, Loader2, CheckCircle2, AlertCircle, RefreshCcw } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useWebsiteSettings } from '../../context/WebsiteSettingsContext';
import type { WebsiteSettings } from '../../types';

type SettingKey = keyof WebsiteSettings;

interface ToggleRow {
  key: SettingKey;
  label: string;
  desc: string;
}

interface ToggleGroup {
  icon: React.ElementType;
  groupLabel: string;
  rows: ToggleRow[];
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-forest-600' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

export default function WebsiteVisibilityCard() {
  const { t } = useLanguage();
  const { settings, updateSettings, refetch } = useWebsiteSettings();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const groups: ToggleGroup[] = [
    {
      icon: Navigation,
      groupLabel: t('adminSettings.website.navigation'),
      rows: [
        { key: 'show_shop', label: t('adminSettings.website.shop'), desc: t('adminSettings.website.shopDesc') },
        { key: 'show_family_combo', label: t('adminSettings.website.familyCombo'), desc: t('adminSettings.website.familyComboDesc') },
        { key: 'show_suppliers', label: t('adminSettings.website.suppliers'), desc: t('adminSettings.website.suppliersDesc') },
        { key: 'show_recurring_basket', label: t('adminSettings.website.recurringBasket'), desc: t('adminSettings.website.recurringBasketDesc') },
      ],
    },
    {
      icon: Home,
      groupLabel: t('adminSettings.website.homepage'),
      rows: [
        { key: 'show_home_featured_products', label: t('adminSettings.website.featuredProducts'), desc: t('adminSettings.website.featuredProductsDesc') },
        { key: 'show_home_featured_combos', label: t('adminSettings.website.featuredCombos'), desc: t('adminSettings.website.featuredCombosDesc') },
        { key: 'show_home_suppliers', label: t('adminSettings.website.homeSuppliers'), desc: t('adminSettings.website.homeSuppliersDesc') },
        { key: 'show_home_testimonials', label: t('adminSettings.website.testimonials'), desc: t('adminSettings.website.testimonialsDesc') },
        { key: 'show_home_delivery_schedule', label: t('adminSettings.website.deliverySchedule'), desc: t('adminSettings.website.deliveryScheduleDesc') },
        { key: 'show_home_why_freshgo', label: t('adminSettings.website.whyFreshGo'), desc: t('adminSettings.website.whyFreshGoDesc') },
      ],
    },
    {
      icon: Briefcase,
      groupLabel: t('adminSettings.website.business'),
      rows: [
        { key: 'allow_customer_registration', label: t('adminSettings.website.registration'), desc: t('adminSettings.website.registrationDesc') },
        { key: 'allow_customer_orders', label: t('adminSettings.website.orders'), desc: t('adminSettings.website.ordersDesc') },
        { key: 'maintenance_mode', label: t('adminSettings.website.maintenance'), desc: t('adminSettings.website.maintenanceDesc') },
      ],
    },
  ];

  const handleToggle = async (key: SettingKey, value: boolean) => {
    setStatus('idle');
    setSaving(true);
    try {
      await updateSettings({ [key]: value });
      setStatus('success');
    } catch (err) {
      console.error('Failed to update setting:', err);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-forest-50 flex items-center justify-center flex-shrink-0">
          <LayoutDashboard size={20} className="text-forest-700" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-forest-900 text-base">{t('adminSettings.website.title')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('adminSettings.website.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => { setStatus('idle'); refetch(); }}
          className="p-2 rounded-xl text-gray-400 hover:text-forest-700 hover:bg-forest-50 transition-all"
          aria-label={t('adminSettings.website.refresh')}
          title={t('adminSettings.website.refresh')}
        >
          <RefreshCcw size={16} className={saving ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.groupLabel}>
            <div className="flex items-center gap-2 mb-3">
              <group.icon size={15} className="text-forest-600" />
              <h3 className="text-xs font-semibold text-forest-900 uppercase tracking-wide">{group.groupLabel}</h3>
            </div>
            <div className="divide-y divide-cream-100 border border-cream-200 rounded-2xl overflow-hidden">
              {group.rows.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-4 px-4 py-3 bg-cream-50/50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{row.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{row.desc}</p>
                  </div>
                  <ToggleSwitch
                    checked={Boolean(settings[row.key])}
                    onChange={(v) => handleToggle(row.key, v)}
                    disabled={saving}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {status === 'success' && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm mt-5 animate-[fadeSlideUp_0.2s_ease-out]">
          <CheckCircle2 size={16} /> {t('adminSettings.messages.saved')}
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm mt-5">
          <AlertCircle size={16} /> {errorMsg}
        </div>
      )}
      {saving && (
        <div className="flex items-center gap-2 p-3 bg-forest-50 border border-forest-100 rounded-xl text-forest-700 text-sm mt-5">
          <Loader2 size={16} className="animate-spin" /> {t('adminSettings.messages.saving')}
        </div>
      )}
    </section>
  );
}
