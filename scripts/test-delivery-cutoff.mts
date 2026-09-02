import assert from 'node:assert/strict';
import { formatCountdown, getBulkDeliveryCutoffStatus, getUpcomingDeliverySlots, nextBulkDeliveryDate } from '../src/lib/deliverySlots.ts';

const at = (iso: string) => new Date(iso);
const cases = [
  ['Wednesday before cutoff', '2026-09-02T14:59:59+08:00', '2026-09-02', true],
  ['Wednesday exactly cutoff', '2026-09-02T15:00:00+08:00', '2026-09-09', false],
  ['Wednesday after cutoff', '2026-09-02T15:00:01+08:00', '2026-09-09', false],
  ['Friday before cutoff', '2026-09-04T10:00:00+08:00', '2026-09-04', true],
  ['Friday after cutoff', '2026-09-04T18:00:00+08:00', '2026-09-11', false],
] as const;

for (const [name, instant, expectedDate, expectedBeforeCutoff] of cases) {
  const now = at(instant);
  const day = name.startsWith('Wednesday') ? 'Wednesday' : 'Friday';
  assert.equal(nextBulkDeliveryDate(day, now), expectedDate, name);
  assert.equal(getBulkDeliveryCutoffStatus(now).isBeforeCutoff, expectedBeforeCutoff, `${name} countdown`);
}

const monday = at('2026-09-07T10:00:00+08:00');
assert.equal(getBulkDeliveryCutoffStatus(monday).isBulkDeliveryDay, false);
assert.equal(getBulkDeliveryCutoffStatus(monday).isBeforeCutoff, false);
assert.equal(getUpcomingDeliverySlots(['Wednesday', 'Friday'], monday)[0].localDate, '2026-09-09');
assert.equal(getUpcomingDeliverySlots(['Monday'], monday)[0].localDate, '2026-09-14', 'non-bulk days keep the original next-week behavior');

const utcPreviousDay = at('2026-09-01T18:30:00Z');
assert.equal(nextBulkDeliveryDate('Wednesday', utcPreviousDay), '2026-09-02', 'Malaysia date must win over UTC date');
assert.equal(getBulkDeliveryCutoffStatus(utcPreviousDay).isBeforeCutoff, true);

const oneSecondLeft = getBulkDeliveryCutoffStatus(at('2026-09-02T14:59:59+08:00'));
assert.equal(oneSecondLeft.millisecondsRemaining, 1000);
assert.equal(formatCountdown(oneSecondLeft.millisecondsRemaining), '00:00:01');

console.log('Malaysia bulk-delivery cutoff checks passed');
