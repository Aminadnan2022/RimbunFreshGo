import { useDeliveryConfig } from '../../context/DeliveryConfigContext';
import { useLanguage } from '../../context/LanguageContext';
import { useWebsiteSettings } from '../../context/WebsiteSettingsContext';
import { useFooterSettings } from '../../context/FooterSettingsContext';
import FooterContent from './FooterContent';

export default function Footer() {
  const { config } = useDeliveryConfig();
  const { t } = useLanguage();
  const { settings: website } = useWebsiteSettings();
  const { settings: footer } = useFooterSettings();

  return <FooterContent footer={footer} website={website} delivery={config} t={t} />;
}
