import { useEffect, useState } from 'react';
import { Images } from 'lucide-react';
import type { WebsiteSettings } from '../../../types';
import { useWebsiteSettings } from '../../../context/WebsiteSettingsContext';
import ImageUploader from '../../ui/ImageUploader';
import { SectionCard, SaveBar } from './shared';

type Key = 'home_category_chicken_image' | 'home_category_fish_image' | 'home_category_prawns_image' | 'home_category_squid_image';
const fields: { key: Key; label: string; folder: string }[] = [
  { key: 'home_category_chicken_image', label: 'Chicken', folder: 'chicken' },
  { key: 'home_category_fish_image', label: 'Fish', folder: 'fish' },
  { key: 'home_category_prawns_image', label: 'Prawns', folder: 'prawns' },
  { key: 'home_category_squid_image', label: 'Squid', folder: 'squid' },
];
const pick = (s: WebsiteSettings): Pick<WebsiteSettings, Key> => ({ home_category_chicken_image: s.home_category_chicken_image, home_category_fish_image: s.home_category_fish_image, home_category_prawns_image: s.home_category_prawns_image, home_category_squid_image: s.home_category_squid_image });

export default function CategoryImagesSettingsCard() {
  const { settings, loading, updateSettings, refetch } = useWebsiteSettings();
  const [draft, setDraft] = useState(() => pick(settings));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  useEffect(() => { if (!loading) setDraft(pick(settings)); }, [loading, settings]);
  const changed = fields.some(({ key }) => draft[key] !== settings[key]);
  const save = async () => {
    setSaving(true); setStatus('idle');
    try { const updates: Partial<WebsiteSettings> = {}; fields.forEach(({ key }) => { if (draft[key] !== settings[key]) updates[key] = draft[key]; }); if (Object.keys(updates).length) await updateSettings(updates); setStatus('success'); }
    catch (error) { setStatus('error'); setErrorMsg(error instanceof Error ? error.message : 'Failed to save category images'); }
    finally { setSaving(false); }
  };
  return <SectionCard icon={Images} title="Shop by Category Images" description="Upload square images for the four category tiles on the homepage. Recommended size: 1024 × 1024 px." onRefresh={() => { setStatus('idle'); refetch(); }} refreshTitle="Reload settings">
    <p className="text-xs text-gray-500 -mt-1">Use square images for the best crop. Changes appear on the homepage after saving.</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">{fields.map(({ key, label, folder }) => <div key={key}><label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label><ImageUploader category={`category-images/${folder}`} currentPath={draft[key]} onUpload={(path) => { setDraft((prev) => ({ ...prev, [key]: path })); setStatus('idle'); }} onRemove={() => { setDraft((prev) => ({ ...prev, [key]: '' })); setStatus('idle'); }} /></div>)}</div>
    <SaveBar hasChanges={changed} saving={saving} status={status} errorMsg={errorMsg} onSave={save} onReset={() => { setDraft(pick(settings)); setStatus('idle'); }} />
  </SectionCard>;
}
