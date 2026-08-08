import { useState, useEffect } from 'react';
import { Megaphone, Truck } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { useDeliveryConfig } from '../../../context/DeliveryConfigContext';
import { SectionCard, TextField, SaveBar } from './shared';

export default function GeneralSettingsCard() {
  const { t } = useLanguage();
  const { config, updateConfig } = useDeliveryConfig();
  const [draft, setDraft] = useState(config.announcement);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setDraft(config.announcement);
  }, [config.announcement]);

  const hasChanges = draft !== config.announcement;

  const handleSave = async () => {
    if (!draft.trim()) {
      setStatus('error');
      setErrorMsg(t('adminSettings.errors.noAnnouncement'));
      return;
    }
    setStatus('idle');
    setSaving(true);
    try {
      await updateConfig({ announcement: draft.trim() });
      setStatus('success');
    } catch (err) {
      console.error('Failed to save general settings:', err);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(config.announcement);
    setStatus('idle');
  };

  return (
    <SectionCard
      icon={Megaphone}
      title={t('adminSettings.general.title')}
      description={t('adminSettings.general.description')}
    >
      <TextField
        label={t('adminSettings.general.announcement')}
        value={draft}
        onChange={setDraft}
        textarea
        placeholder={t('adminSettings.delivery.announcementPlaceholder')}
      />
      <p className="text-xs text-gray-400 -mt-2">{t('adminSettings.general.announcementHelper')}</p>

      {draft.trim() && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('adminSettings.general.announcementPreview')}</p>
          <div className="gradient-forest text-white py-2.5 px-4 rounded-xl text-center text-sm font-medium">
            <div className="flex items-center justify-center gap-2">
              <Truck size={15} className="opacity-90 flex-shrink-0" />
              <span>{draft}</span>
            </div>
          </div>
        </div>
      )}

      <SaveBar hasChanges={hasChanges} saving={saving} status={status} errorMsg={errorMsg} onSave={handleSave} onReset={handleReset} />
    </SectionCard>
  );
}
