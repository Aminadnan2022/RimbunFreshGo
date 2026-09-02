const DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

export const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur';
export const BULK_DELIVERY_CUTOFF_HOUR = 15;
export const BULK_DELIVERY_FEE = 2;
const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;

interface MalaysiaDateTime {
  year: number; month: number; day: number; weekday: number;
  hour: number; minute: number; second: number;
}

export interface UpcomingDeliverySlot {
  day: string;
  date: Date;
  localDate: string;
  isToday: boolean;
}

export interface BulkDeliveryCutoffStatus {
  isBulkDeliveryDay: boolean;
  isBeforeCutoff: boolean;
  millisecondsRemaining: number;
  nextDeliveryDate: string;
}

const malaysiaDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MALAYSIA_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function malaysiaDateTime(now: Date): MalaysiaDateTime {
  const parts = Object.fromEntries(
    malaysiaDateTimeFormatter.formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const weekday = DAY_INDEX[parts.weekday.toLowerCase()];
  if (weekday === undefined) throw new Error(`Unsupported Malaysia weekday: ${parts.weekday}`);
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday,
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

function malaysiaMidnightUtc({ year, month, day }: Pick<MalaysiaDateTime, 'year' | 'month' | 'day'>): number {
  return Date.UTC(year, month - 1, day) - MALAYSIA_OFFSET_MS;
}

function formatMalaysiaDate(date: Date): string {
  const local = malaysiaDateTime(date);
  return `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
}

export function getMalaysiaDateString(now = new Date()): string {
  return formatMalaysiaDate(now);
}

function calendarWeekday(localDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCDate() === Number(match[3]) ? date.getUTCDay() : null;
}

export function isDeliveryDateAllowed(localDate: string): boolean {
  const weekday = calendarWeekday(localDate);
  return weekday !== null && weekday !== DAY_INDEX.monday;
}

export function isBulkDeliveryDate(localDate: string): boolean {
  const weekday = calendarWeekday(localDate);
  return weekday === DAY_INDEX.wednesday || weekday === DAY_INDEX.friday;
}

export function getUpcomingDeliverySlots(days: string[], now = new Date()): UpcomingDeliverySlot[] {
  const localNow = malaysiaDateTime(now);
  const beforeCutoff = localNow.hour < BULK_DELIVERY_CUTOFF_HOUR;
  const localMidnight = malaysiaMidnightUtc(localNow);

  return days
    .map((day) => {
      const target = DAY_INDEX[day.toLowerCase()];
      if (target === undefined) return null;
      let difference = target - localNow.weekday;
      const isSameDayBulkSlot = difference === 0 && (target === DAY_INDEX.wednesday || target === DAY_INDEX.friday);
      if (difference < 0 || (difference === 0 && (!isSameDayBulkSlot || !beforeCutoff))) difference += 7;
      const date = new Date(localMidnight + difference * 24 * 60 * 60 * 1000);
      return { day, date, localDate: formatMalaysiaDate(date), isToday: difference === 0 };
    })
    .filter((slot): slot is UpcomingDeliverySlot => slot !== null)
    .sort((left, right) => left.date.getTime() - right.date.getTime());
}

export function nextBulkDeliveryDate(day: string, now = new Date()): string {
  const slot = getUpcomingDeliverySlots([day], now)[0];
  if (!slot) throw new Error(`Unsupported delivery day: ${day}`);
  return slot.localDate;
}

export function getBulkDeliveryCutoffStatus(now = new Date()): BulkDeliveryCutoffStatus {
  const localNow = malaysiaDateTime(now);
  const isBulkDeliveryDay = localNow.weekday === DAY_INDEX.wednesday || localNow.weekday === DAY_INDEX.friday;
  const cutoff = malaysiaMidnightUtc(localNow) + BULK_DELIVERY_CUTOFF_HOUR * 60 * 60 * 1000;
  const millisecondsRemaining = Math.max(0, cutoff - now.getTime());
  const isBeforeCutoff = isBulkDeliveryDay && millisecondsRemaining > 0;
  const nextSlot = getUpcomingDeliverySlots(['Wednesday', 'Friday'], now)[0];
  return {
    isBulkDeliveryDay,
    isBeforeCutoff,
    millisecondsRemaining: isBeforeCutoff ? millisecondsRemaining : 0,
    nextDeliveryDate: nextSlot.localDate,
  };
}

export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}
