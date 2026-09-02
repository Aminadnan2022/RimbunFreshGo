const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export interface UpcomingDeliverySlot {
  day: string;
  date: Date;
}

export function getUpcomingDeliverySlots(days: string[], now = new Date()): UpcomingDeliverySlot[] {
  return days
    .map((day) => {
      const target = DAY_INDEX[day.toLowerCase()];
      if (target === undefined) return null;
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      let difference = target - date.getDay();
      if (difference <= 0) difference += 7;
      date.setDate(date.getDate() + difference);
      return { day, date };
    })
    .filter((slot): slot is UpcomingDeliverySlot => slot !== null)
    .sort((left, right) => left.date.getTime() - right.date.getTime());
}
