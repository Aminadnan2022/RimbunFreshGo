import { useEffect, useState } from 'react';
import { Calendar, Clock3 } from 'lucide-react';
import type { DeliveryDay } from '../../types';
import { useDeliveryConfig } from '../../context/DeliveryConfigContext';
import { useLanguage } from '../../context/LanguageContext';
import { formatCountdown, getBulkDeliveryCutoffStatus, getUpcomingDeliverySlots } from '../../lib/deliverySlots';

interface Props {
  selected: DeliveryDay | null;
  onChange: (day: DeliveryDay) => void;
  compact?: boolean;
}

export default function DeliverySlotSelector({ selected, onChange, compact = false }: Props) {
  const { config } = useDeliveryConfig();
  const { t, language } = useLanguage();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const slots = getUpcomingDeliverySlots(config.days, now).map(({ day, date, isToday }) => ({
    day: day.toLowerCase(),
    label: t("days." + day.toLowerCase()),
    dayLabel: t("days." + day.toLowerCase()).slice(0, 3),
    date: date.toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }),
    isToday,
  }));
  const cutoff = getBulkDeliveryCutoffStatus(now);
  const nextDate = new Date(`${cutoff.nextDeliveryDate}T00:00:00+08:00`).toLocaleDateString(
    language === 'ms' ? 'ms-MY' : 'en-MY',
    { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' },
  );

  return (
    <div>
      {cutoff.isBeforeCutoff ? (
        <p className="mb-2 flex items-center gap-1.5 rounded-xl bg-jade-50 px-3 py-2 text-xs font-semibold text-forest-800" aria-label={t('delivery.sameDayCutoffLabel')}>
          <Clock3 size={14} aria-hidden="true" />
          <span>{t('delivery.sameDayCutoff')}</span>
          <time dateTime={`PT${Math.ceil(cutoff.millisecondsRemaining / 1000)}S`} className="font-mono tabular-nums" aria-hidden="true">{formatCountdown(cutoff.millisecondsRemaining)}</time>
        </p>
      ) : cutoff.isBulkDeliveryDay ? (
        <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">{t('delivery.cutoffPassed', { date: nextDate })}</p>
      ) : null}
      <div className={compact ? 'flex gap-2' : 'flex gap-3'}>
      {slots.map(({ day, label, dayLabel, date, isToday }) => (
        <button
          type="button"
          key={day}
          onClick={() => onChange(day)}
          aria-pressed={selected === day}
          className={`touch-target flex-1 flex items-center gap-2.5 rounded-2xl border-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:ring-offset-2 ${
            compact ? 'px-3 py-2' : 'px-4 py-3'
          } ${
            selected === day
              ? 'border-forest-700 bg-forest-700 text-white shadow-green'
              : 'border-cream-300 bg-white text-gray-600 hover:border-forest-400 hover:bg-forest-50'
          }`}
        >
          <Calendar size={compact ? 15 : 18} className={selected === day ? 'text-jade-300' : 'text-forest-500'} />
          <div className="text-left">
            <p className={`font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>{compact ? dayLabel : label}{isToday ? ` · ${t('delivery.today')}` : ''}</p>
            <p className={`opacity-80 ${compact ? 'text-xs hidden sm:block' : 'text-xs'}`}>
              {date && <span>{date} &middot; </span>}{config.time}
            </p>
          </div>
        </button>
      ))}
      </div>
    </div>
  );
}
