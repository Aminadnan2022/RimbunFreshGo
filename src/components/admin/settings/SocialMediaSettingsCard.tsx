import { Share2 } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import type { FooterSettings } from '../../../types';
import { useFooterSlice } from './footerSlice';
import { SectionCard, TextField, SaveBar } from './shared';

const SOCIAL_FIELDS: { key: keyof FooterSettings; label: string }[] = [
  { key: 'social_facebook', label: 'Facebook' },
  { key: 'social_instagram', label: 'Instagram' },
  { key: 'social_tiktok', label: 'TikTok' },
  { key: 'social_threads', label: 'Threads' },
  { key: 'social_youtube', label: 'YouTube' },
  { key: 'social_linkedin', label: 'LinkedIn' },
  { key: 'social_x', label: 'X' },
];

export default function SocialMediaSettingsCard() {
  const { t } = useLanguage();
  const slice = useFooterSlice(SOCIAL_FIELDS.map(({ key }) => key));

  return (
    <SectionCard
      icon={Share2}
      title={t('adminSettings.social.title')}
      description={t('adminSettings.social.description')}
    >
      <p className="text-xs text-gray-500 -mt-2">{t('adminSettings.social.helper')}</p>
      {SOCIAL_FIELDS.map(({ key, label }) => (
        <TextField
          key={key}
          label={label}
          value={slice.draft[key] as string}
          onChange={slice.set(key)}
          placeholder="https://..."
        />
      ))}

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
