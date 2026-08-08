import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useWebsiteSettings } from '../../context/WebsiteSettingsContext';
import type { WebsiteSettings } from '../../types';
import FeatureDisabledPage from './FeatureDisabledPage';

export type FeatureKey = keyof WebsiteSettings;

interface FeatureRouteProps {
  feature: FeatureKey;
  children: ReactNode;
}

export default function FeatureRoute({ feature, children }: FeatureRouteProps) {
  const { settings, loading } = useWebsiteSettings();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </div>
    );
  }

  if (!settings[feature]) {
    return <FeatureDisabledPage />;
  }

  return <>{children}</>;
}
