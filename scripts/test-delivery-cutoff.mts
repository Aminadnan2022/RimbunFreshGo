import assert from 'node:assert/strict';
import { formatCountdown, formatDeliveryCutoffCountdown, getBulkDeliveryCutoffStatus, getUpcomingCustomerDeliverySlots, getUpcomingDeliverySlots, isBulkDeliveryDate, isDeliveryDateAllowed, nextBulkDeliveryDate, nextCustomerDeliveryDate } from '../src/lib/deliverySlots.ts';

const at = (iso: string) => new Date(iso);
const cases = [
  ['Wednesday before cutoff', '2026-09-02T14:59:00+08:00', '2026-09-02', true],
  ['Wednesday exactly cutoff', '2026-09-02T15:00:00+08:00', '2026-09-09', false],
  ['Wednesday after cutoff', '2026-09-02T15:00:01+08:00', '2026-09-09', false],
  ['Friday before cutoff', '2026-09-04T14:59:00+08:00', '2026-09-04', true],
  ['Friday exactly cutoff', '2026-09-04T15:00:00+08:00', '2026-09-11', false],
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
assert.equal(getUpcomingDeliverySlots(['Wednesday', 'Friday'], at('2026-09-07T16:00:00+08:00'))[0].localDate, '2026-09-09', 'non-delivery day after 3 PM is unaffected');
assert.deepEqual(
  getUpcomingCustomerDeliverySlots(monday).map((slot) => slot.localDate),
  ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'],
  'customer selector must show Tuesday–Sunday and skip Monday',
);

const wednesdayAfterCutoff = at('2026-09-02T15:00:01+08:00');
assert.equal(
  getUpcomingCustomerDeliverySlots(wednesdayAfterCutoff)[0].localDate,
  '2026-09-02',
  'Wednesday remains selectable for courier after the RM2 cutoff',
);
assert.equal(nextCustomerDeliveryDate('Sunday', monday), '2026-09-13');

const utcPreviousDay = at('2026-09-01T18:30:00Z');
assert.equal(nextBulkDeliveryDate('Wednesday', utcPreviousDay), '2026-09-02', 'Malaysia date must win over UTC date');
assert.equal(getBulkDeliveryCutoffStatus(utcPreviousDay).isBeforeCutoff, true);

const oneSecondLeft = getBulkDeliveryCutoffStatus(at('2026-09-02T14:59:59+08:00'));
assert.equal(oneSecondLeft.millisecondsRemaining, 1000);
assert.equal(formatCountdown(oneSecondLeft.millisecondsRemaining), '00:00:01');
assert.equal(formatDeliveryCutoffCountdown(84 * 60_000, 'ms'), 'Tutup dalam 1j 24m');
assert.equal(formatDeliveryCutoffCountdown(84 * 60_000, 'en'), 'Closes in 1h 24m');
assert.equal(formatDeliveryCutoffCountdown(29 * 60_000, 'ms'), 'Tutup dalam 29m');
assert.equal(formatDeliveryCutoffCountdown(29 * 60_000, 'en'), 'Closes in 29m');

for (const date of ['2026-09-06', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']) {
  assert.equal(isDeliveryDateAllowed(date), true, `${date} should allow delivery`);
}
assert.equal(isDeliveryDateAllowed('2026-09-07'), false, 'Monday must be closed');
assert.equal(isDeliveryDateAllowed('not-a-date'), false);
assert.equal(isBulkDeliveryDate('2026-09-09'), true);
assert.equal(isBulkDeliveryDate('2026-09-11'), true);
assert.equal(isBulkDeliveryDate('2026-09-12'), false);

console.log('Malaysia bulk-delivery cutoff checks passed');
