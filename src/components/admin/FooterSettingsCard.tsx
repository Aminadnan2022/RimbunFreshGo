import { FileText } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useFooterSettings } from '../../context/FooterSettingsContext';
import { useWebsiteSettings } from '../../context/WebsiteSettingsContext';
import { useDeliveryConfig } from '../../context/DeliveryConfigContext';
import FooterContent from '../layout/FooterContent';
import type { FooterSettings } from '../../types';
import { useFooterSlice } from './settings/footerSlice';
import { TextField, SaveBar } from './settings/shared';

const FOOTER_KEYS: (keyof FooterSettings)[] = ['footer_description', 'copyright_text'];

export default function FooterSettingsCard() {
  const { t } = useLanguage();
  const slice = useFooterSlice(FOOTER_KEYS);
  const { settings: footer } = useFooterSettings();
  const { settings: website } = useWebsiteSettings();
  const { config } = useDeliveryConfig();

  const previewFooter: FooterSettings = {
    ...footer,
    footer_description: slice.draft.footer_description,
    copyright_text: slice.draft.copyright_text,
  };

  return (
    <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-forest-50 flex items-center justify-center flex-shrink-0">
          <FileText size={20} className="text-forest-700" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-forest-900 text-base">{t('adminSettings.footer.title')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('adminSettings.footer.description')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-5">
          <TextField
            label={t('adminSettings.footer.description')}
            value={slice.draft.footer_description}
            onChange={slice.set('footer_description')}
            textarea
            placeholder="Freshly prepared daily proteins, delivered to your door every {{days}}..."
          />
          <TextField
            label={t('adminSettings.footer.copyrightText')}
            value={slice.draft.copyright_text}
            onChange={slice.set('copyright_text')}
            placeholder="© {{year}} Rimbun FreshGo. All rights reserved."
          />
        </div>

        {/* Live Preview */}
        <div>
          <div className="sticky top-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-2 h-2 rounded-full bg-jade-500 animate-pulse" />
              <h3 className="text-xs font-semibold text-forest-900 uppercase tracking-wide">{t('adminSettings.footer.livePreview')}</h3>
            </div>
            <div className="rounded-2xl overflow-hidden border border-cream-200 shadow-soft pointer-events-none select-none">
              <FooterContent footer={previewFooter} website={website} delivery={config} t={t} />
            </div>
          </div>
        </div>
      </div>

      <SaveBar
        hasChanges={slice.hasChanges}
        saving={slice.saving}
        status={slice.status}
        errorMsg={slice.errorMsg}
        onSave={slice.handleSave}
        onReset={slice.handleReset}
      />
    </section>
  );
}
