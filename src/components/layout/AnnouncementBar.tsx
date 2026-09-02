import { Truck } from 'lucide-react';
import { useDeliveryConfig } from '../../context/DeliveryConfigContext';
import { useLanguage } from '../../context/LanguageContext';
import { useLocation } from 'react-router-dom';
import { getUpcomingDeliverySlots } from '../../lib/deliverySlots';

export default function AnnouncementBar() {
  const { config, loading } = useDeliveryConfig();
  const { t, language } = useLanguage();
  const location = useLocation();
  const nextSlot = getUpcomingDeliverySlots(config.days)[0];
  const landingAnnouncement = nextSlot
    ? t('homepage.announcement.nextDelivery', {
        day: t(`days.${nextSlot.day.toLowerCase()}`),
        date: nextSlot.date.toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { day: 'numeric', month: 'short' }),
        time: config.time,
      })
    : config.announcement;

  return (
    <div className="gradient-forest text-white py-2.5 px-4 text-center text-sm font-medium">
      <div className="flex items-center justify-center gap-2">
        <Truck size={15} className="opacity-90 flex-shrink-0" />
        <span>{loading ? t("homepage.announcement.loading") : location.pathname === '/' ? landingAnnouncement : config.announcement}</span>
      </div>
    </div>
  );
}
