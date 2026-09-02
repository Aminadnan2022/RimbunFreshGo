import { useLanguage } from '../../context/LanguageContext';

export default function DeliveryTimingBadge() {
  const { t } = useLanguage();
  return <>{t('delivery.availabilityBadge')}</>;
}
