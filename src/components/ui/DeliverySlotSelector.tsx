import { useEffect, useState } from 'react';
import { Calendar, Clock3 } from 'lucide-react';
import type { DeliveryDay } from '../../types';
import { useDeliveryConfig } from '../../context/DeliveryConfigContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  BULK_DELIVERY_DAYS,
  formatDeliveryCutoffCountdown,
  getBulkDeliveryCutoffStatus,
  getUpcomingCustomerDeliverySlots,
  getUpcomingDeliverySlots,
  isBulkDeliveryDate,
} from '../../lib/deliverySlots';

interface Props {
  selected: DeliveryDay | null;
  selectedDate?: string;
  onChange: (day: DeliveryDay, localDate: string) => void;
  compact?: boolean;
  scope?: 'customer' | 'bulk' | 'external';
}

export default function DeliverySlotSelector({ selected, selectedDate, onChange, compact = false, scope = 'customer' }: Props) {
  const { config } = useDeliveryConfig();
  const { t, language } = useLanguage();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number;
    const updateAtNextMinute = () => {
      timer = window.setTimeout(() => {
        setNow(new Date());
        updateAtNextMinute();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    updateAtNextMinute();
    return () => window.clearTimeout(timer);
  }, []);

  const availableSlots = scope === 'bulk'
    ? getUpcomingDeliverySlots([...BULK_DELIVERY_DAYS], now)
    : getUpcomingCustomerDeliverySlots(now);
  const cutoff = getBulkDeliveryCutoffStatus(now);
  const slots = availableSlots.map(({ day, date, localDate, isToday }) => ({
    day: day.toLowerCase(),
    label: t("days." + day.toLowerCase()),
    dayLabel: t("days." + day.toLowerCase()).slice(0, 3),
    date: date.toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-MY', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }),
    localDate,
    isToday,
    communityEligible: scope !== 'external' && isBulkDeliveryDate(localDate) && !(isToday && cutoff.isBulkDeliveryDay && !cutoff.isBeforeCutoff),
  }));
  const nextDate = new Date(`${cutoff.nextDeliveryDate}T00:00:00+08:00`).toLocaleDateString(
    language === 'ms' ? 'ms-MY' : 'en-MY',
    { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' },
  );

  return (
    <div>
      {scope !== 'external' && cutoff.isBeforeCutoff ? (
        <p className="mb-2 flex items-center gap-1.5 rounded-xl bg-jade-50 px-3 py-2 text-xs font-semibold text-forest-800" aria-label={t('delivery.sameDayCutoffLabel')}>
          <Clock3 size={14} aria-hidden="true" />
          <time dateTime={`PT${Math.ceil(cutoff.millisecondsRemaining / 60_000)}M`} className="tabular-nums">
            {formatDeliveryCutoffCountdown(cutoff.millisecondsRemaining, language)}
          </time>
        </p>
      ) : scope !== 'external' && cutoff.isBulkDeliveryDay ? (
        <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">{t(scope === 'bulk' ? 'delivery.cutoffPassed' : 'delivery.cutoffPassedCustomer', { date: nextDate })}</p>
      ) : null}
      <div className={`grid grid-cols-2 ${scope !== 'bulk' ? 'sm:grid-cols-3' : ''} ${compact ? 'gap-2' : 'gap-3'}`}>
      {slots.map(({ day, label, dayLabel, date, localDate, isToday, communityEligible }) => {
        const active = selectedDate ? selectedDate === localDate : selected === day;
        return (
        <button
          type="button"
          key={localDate}
          onClick={() => onChange(day, localDate)}
          aria-pressed={active}
          className={`touch-target min-w-0 rounded-2xl border-2 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:ring-offset-2 ${
            compact ? 'px-3 py-2' : 'px-4 py-3'
          } ${
            active
              ? 'border-forest-700 bg-forest-700 text-white shadow-green'
              : 'border-cream-300 bg-white text-gray-600 hover:border-forest-400 hover:bg-forest-50'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Calendar size={compact ? 14 : 16} className={active ? 'text-jade-300' : 'text-forest-500'} aria-hidden="true" />
            <p className={`truncate font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>{compact ? dayLabel : label}{isToday ? ` · ${t('delivery.today')}` : ''}</p>
          </div>
          <p className="mt-1 text-xs opacity-80">{date}</p>
          <p className={`mt-1.5 text-[11px] font-semibold leading-4 ${active ? 'text-jade-100' : communityEligible ? 'text-forest-700' : 'text-amber-700'}`}>
            {scope === 'bulk'
              ? t('delivery.communitySlot', { time: config.time })
              : communityEligible
                ? t('delivery.communityOrCourierSlot')
                : t('delivery.courierSlot')}
          </p>
        </button>
      );})}
      </div>
    </div>
  );
}
