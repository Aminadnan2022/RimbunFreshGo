import { Phone } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import type { FooterSettings } from '../../../types';
import { useFooterSlice } from './footerSlice';
import { SectionCard, TextField, SaveBar } from './shared';

const CONTACT_FIELDS: { key: keyof FooterSettings; labelKey: string; placeholder: string }[] = [
  { key: 'contact_phone', labelKey: 'adminSettings.contact.phone', placeholder: '+60 12-345 6789' },
  { key: 'contact_whatsapp', labelKey: 'adminSettings.contact.whatsapp', placeholder: '+60 12-345 6789' },
  { key: 'contact_email', labelKey: 'adminSettings.contact.email', placeholder: 'hello@rimbunfreshgo.my' },
  { key: 'contact_address', labelKey: 'adminSettings.contact.address', placeholder: 'Klang Valley, Selangor' },
  { key: 'delivery_area', labelKey: 'adminSettings.contact.deliveryArea', placeholder: 'Klang Valley, Selangor' },
];

export default function ContactSettingsCard() {
  const { t } = useLanguage();
  const slice = useFooterSlice(CONTACT_FIELDS.map(({ key }) => key));

  return (
    <SectionCard
      icon={Phone}
      title={t('adminSettings.contact.title')}
      description={t('adminSettings.contact.description')}
    >
      {CONTACT_FIELDS.map(({ key, labelKey, placeholder }) => (
        <TextField
          key={key}
          label={t(labelKey)}
          value={slice.draft[key] as string}
          onChange={slice.set(key)}
          placeholder={placeholder}
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
