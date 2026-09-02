import { Calendar } from 'lucide-react';
import type { DeliveryDay } from '../../types';
import { useDeliveryConfig } from '../../context/DeliveryConfigContext';
import { useLanguage } from '../../context/LanguageContext';
import { getUpcomingDeliverySlots } from '../../lib/deliverySlots';

interface Props {
  selected: DeliveryDay | null;
  onChange: (day: DeliveryDay) => void;
  compact?: boolean;
}

export default function DeliverySlotSelector({ selected, onChange, compact = false }: Props) {
  const { config } = useDeliveryConfig();
  const { t, language } = useLanguage();

  const slots = getUpcomingDeliverySlots(config.days).map(({ day, date }) => ({
    day: day.toLowerCase(),
    label: t("days." + day.toLowerCase()),
    dayLabel: t("days." + day.toLowerCase()).slice(0, 3),
    date: date.toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { day: 'numeric', month: 'short' }),
  }));

  return (
    <div className={compact ? 'flex gap-2' : 'flex gap-3'}>
      {slots.map(({ day, label, dayLabel, date }) => (
        <button
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
            <p className={`font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>{compact ? dayLabel : label}</p>
            <p className={`opacity-80 ${compact ? 'text-xs hidden sm:block' : 'text-xs'}`}>
              {date && <span>{date} &middot; </span>}{config.time}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
