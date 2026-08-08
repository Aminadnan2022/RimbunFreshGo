import { Leaf } from 'lucide-react';
import { useWebsiteSettings } from '../../context/WebsiteSettingsContext';
import { getBrandImage } from '../../lib/image';

interface BrandLogoProps {
  /** Size classes, e.g. `w-8 h-8`. Defaults to `w-9 h-9`. */
  size?: string;
  /** Leaf icon size used for the fallback logo. */
  iconSize?: number;
  /** Border radius classes for both image and fallback. */
  rounded?: string;
  /** Optional explicit storage path override (for draft/preview use only). */
  path?: string | null;
  /** Optional cache-bust version override (for draft/preview use only). */
  version?: string | null;
  /** Extra classes applied to both variants. */
  className?: string;
  alt?: string;
}

export default function BrandLogo({
  size = 'w-9 h-9',
  iconSize = 18,
  rounded = 'rounded-xl',
  path,
  version,
  className = '',
  alt,
}: BrandLogoProps) {
  const { settings, logoVersion } = useWebsiteSettings();
  const storagePath = path !== undefined ? path : settings.site_logo;
  const cacheVersion = version !== undefined ? version : logoVersion;
  const name = alt || settings.site_name || 'Rimbun FreshGo';

  if (storagePath) {
    return (
      <img
        src={getBrandImage(storagePath, cacheVersion)}
        alt={name}
        className={`${size} object-cover ${rounded} ${className}`}
      />
    );
  }

  return (
    <div
      className={`${size} gradient-card ${rounded} flex items-center justify-center shadow-green ${className}`}
      aria-label={name}
      role="img"
    >
      <Leaf size={iconSize} className="text-white" />
    </div>
  );
}
