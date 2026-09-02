import { useEffect, useState } from 'react';
import { useDeliveryConfig } from '../../context/DeliveryConfigContext';
import { useLanguage } from '../../context/LanguageContext';
import { getUpcomingDeliverySlots } from '../../lib/deliverySlots';

export default function DeliveryTimingBadge() {
  const { config } = useDeliveryConfig();
  const { t, language } = useLanguage();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const nextSlot = getUpcomingDeliverySlots(config.days, now)[0];
  if (!nextSlot) {
    const days = config.days.map((day) => t(`days.${day.toLowerCase()}`)).join(' & ');
    return <>{t('homepage.hero.badge', { days })}</>;
  }

  return <>{t('homepage.hero.nextDelivery', {
    day: t(`days.${nextSlot.day.toLowerCase()}`),
    date: nextSlot.date.toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', {
      day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur',
    }),
    time: config.time,
  })}</>;
}
