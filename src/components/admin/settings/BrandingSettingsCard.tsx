import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { useWebsiteSettings } from '../../../context/WebsiteSettingsContext';
import ImageUploader from '../../ui/ImageUploader';
import BrandLogo from '../../branding/BrandLogo';
import { SectionCard, TextField, SaveBar } from './shared';

export default function BrandingSettingsCard() {
  const { t } = useLanguage();
  const { settings, loading, logoVersion, updateSettings, refetch } = useWebsiteSettings();
  const [draftName, setDraftName] = useState(settings.site_name);
  const [draftLogo, setDraftLogo] = useState(settings.site_logo);
  const [draftLogoVersion, setDraftLogoVersion] = useState<string | null>(logoVersion);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!loading) {
      setDraftName(settings.site_name);
      setDraftLogo(settings.site_logo);
      setDraftLogoVersion(logoVersion);
    }
  }, [settings.site_name, settings.site_logo, logoVersion, loading]);

  const handleUpload = (path: string) => {
    setDraftLogo(path);
    setDraftLogoVersion(String(Date.now()));
  };

  const handleRemove = () => {
    setDraftLogo('');
    setDraftLogoVersion(null);
  };

  const hasChanges = draftName !== settings.site_name || draftLogo !== settings.site_logo;

  const handleSave = async () => {
    setStatus('idle');
    setSaving(true);
    try {
      const changed: { site_name?: string; site_logo?: string } = {};
      if (draftName !== settings.site_name) changed.site_name = draftName.trim() || 'Rimbun FreshGo';
      if (draftLogo !== settings.site_logo) changed.site_logo = draftLogo;
      if (Object.keys(changed).length > 0) await updateSettings(changed);
      setStatus('success');
    } catch (err) {
      console.error('Failed to save branding settings:', err);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraftName(settings.site_name);
    setDraftLogo(settings.site_logo);
    setDraftLogoVersion(logoVersion);
    setStatus('idle');
  };

  return (
    <SectionCard
      icon={Sparkles}
      title={t('adminSettings.branding.title')}
      description={t('adminSettings.branding.description')}
      onRefresh={() => { setStatus('idle'); refetch(); }}
      refreshTitle={t('adminSettings.branding.refresh')}
    >
      <TextField label={t('adminSettings.branding.siteName')} value={draftName} onChange={setDraftName} placeholder="Rimbun FreshGo" />

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('adminSettings.branding.logo')}</label>
        <ImageUploader
          category="branding"
          bucket="branding"
          currentPath={draftLogo}
          onUpload={handleUpload}
          onRemove={handleRemove}
        />
        <p className="text-xs text-gray-400 mt-1.5">{t('adminSettings.branding.logoHelper')}</p>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('adminSettings.branding.preview')}</p>
        <div className="flex items-center gap-3 p-4 bg-cream-50 border border-cream-200 rounded-2xl">
          <BrandLogo size="w-12 h-12" iconSize={24} rounded="rounded-2xl" path={draftLogo} version={draftLogoVersion} />
          <div>
            <p className="font-display font-bold text-forest-900">{draftName.trim() || 'Rimbun FreshGo'}</p>
            <p className="text-xs text-gray-500">{t('adminSettings.branding.preview')}</p>
          </div>
        </div>
      </div>

      <SaveBar hasChanges={hasChanges} saving={saving} status={status} errorMsg={errorMsg} onSave={handleSave} onReset={handleReset} />
    </SectionCard>
  );
}
