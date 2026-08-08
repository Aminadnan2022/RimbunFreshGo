import { Navigation } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import type { FooterSettings } from '../../../types';
import { useFooterSlice } from './footerSlice';
import { SectionCard, ToggleSwitch, SaveBar } from './shared';

const NAV_KEYS: { key: keyof FooterSettings; labelKey: string }[] = [
  { key: 'footer_show_shop', labelKey: 'adminSettings.website.shop' },
  { key: 'footer_show_family_combo', labelKey: 'adminSettings.website.familyCombo' },
  { key: 'footer_show_suppliers', labelKey: 'adminSettings.website.suppliers' },
  { key: 'footer_show_recurring_basket', labelKey: 'adminSettings.website.recurringBasket' },
  { key: 'footer_show_faq', labelKey: 'adminSettings.navigation.faq' },
  { key: 'footer_show_how_it_works', labelKey: 'adminSettings.navigation.howItWorks' },
  { key: 'footer_show_privacy', labelKey: 'adminSettings.navigation.privacy' },
  { key: 'footer_show_terms', labelKey: 'adminSettings.navigation.terms' },
];

export default function NavigationSettingsCard() {
  const { t } = useLanguage();
  const slice = useFooterSlice(NAV_KEYS.map(({ key }) => key));

  return (
    <SectionCard
      icon={Navigation}
      title={t('adminSettings.navigation.title')}
      description={t('adminSettings.navigation.description')}
    >
      <div className="divide-y divide-cream-100 border border-cream-200 rounded-2xl overflow-hidden">
        {NAV_KEYS.map(({ key, labelKey }) => (
          <div key={key} className="flex items-center justify-between gap-4 px-4 py-3 bg-cream-50/50">
            <span className="text-sm font-medium text-gray-800">{t(labelKey)}</span>
            <ToggleSwitch
              checked={slice.draft[key] as boolean}
              onChange={slice.setBool(key)}
              disabled={slice.saving}
            />
          </div>
        ))}
      </div>

      <SaveBar
        hasChanges={slice.hasChanges}
        saving={slice.saving}
        status={slice.status}
        errorMsg={slice.errorMsg}
        onSave={slice.handleSave}
        onReset={slice.handleReset}
      />
    </SectionCard>
  );
}
