import assert from 'node:assert/strict';
import {
  ONBOARDING_PAGE_IDS,
  availableOnboardingSteps,
  dismissOnboarding,
  getOnboardingMode,
  isOnboardingComplete,
  isTutorialModeOn,
  mobilePopoverWidth,
  onboardingModeStorageKey,
  onboardingStorageKey,
  resetOnboarding,
  setTutorialMode,
  shouldShowOnboarding,
} from '../src/lib/onboarding.ts';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const storage = new MemoryStorage();
const user = 'customer-123';

assert.equal(getOnboardingMode(storage, user), 'default', 'existing first-run behavior remains the default');
assert.equal(shouldShowOnboarding(storage, user, 'shop'), true, 'an unseen page can still show in the normal first-run flow');

assert.equal(
  onboardingStorageKey(user, 'shop'),
  'freshgo:onboarding:v1:customer-123:shop',
  'keys are versioned, user-scoped, and page-scoped',
);
assert.equal(
  onboardingModeStorageKey(user),
  'freshgo:onboarding:v1:customer-123:mode',
  'tutorial mode preference is versioned and user-scoped',
);

dismissOnboarding(storage, user, 'shop', 'skip');
assert.equal(isOnboardingComplete(storage, user, 'shop'), true, 'Skip prevents the page tour repeating');
assert.equal(isOnboardingComplete(storage, user, 'cart'), false, 'Skipping one page does not complete later pages');

dismissOnboarding(storage, user, 'cart', 'finish');
assert.equal(isOnboardingComplete(storage, user, 'cart'), true, 'Finish prevents the page tour repeating');

setTutorialMode(storage, user, false);
assert.equal(getOnboardingMode(storage, user), 'off', 'OFF persists for the current user');
assert.equal(shouldShowOnboarding(storage, user, 'product-detail'), false, 'OFF stops future tours even on an incomplete page');

const otherUser = 'customer-456';
dismissOnboarding(storage, otherUser, 'shop', 'finish');
setTutorialMode(storage, user, true);
assert.equal(isTutorialModeOn(storage, user), true, 'turning ON persists Tutorial Mode');
ONBOARDING_PAGE_IDS.forEach((page) => {
  assert.equal(isOnboardingComplete(storage, user, page), false, `turning ON re-enables ${page}`);
});
assert.equal(isOnboardingComplete(storage, otherUser, 'shop'), true, 'turning ON does not reset another user');
assert.equal(getOnboardingMode(storage, otherUser), 'default', 'tutorial mode preference is isolated from another user');

dismissOnboarding(storage, user, 'shop', 'finish');
assert.equal(shouldShowOnboarding(storage, user, 'shop'), false, 'a page completes once during the replay cycle');
assert.equal(shouldShowOnboarding(storage, user, 'cart'), true, 'other pages remain available during the replay cycle');
assert.equal(getOnboardingMode(storage, user), 'on', 'Tutorial Mode persists across reload-style reads');

setTutorialMode(storage, user, false);
assert.equal(shouldShowOnboarding(storage, user, 'cart'), false, 'turning OFF immediately blocks the next incomplete page');
assert.equal(isOnboardingComplete(storage, user, 'shop'), true, 'turning OFF preserves page completion state');

setTutorialMode(storage, user, true);
ONBOARDING_PAGE_IDS.forEach((page) => dismissOnboarding(storage, user, page, 'finish'));
assert.equal(getOnboardingMode(storage, user), 'off', 'Tutorial Mode returns to OFF after every replay page is complete');
assert.equal(shouldShowOnboarding(storage, user, 'shop'), false, 'the completed replay cycle cannot loop on refresh');

const steps = [
  { target: '#present', body: 'Present' },
  { target: '#missing', body: 'Missing' },
];
const available = availableOnboardingSteps(steps, (selector) => selector === '#present' ? {} as Element : null);
assert.deepEqual(available, [steps[0]], 'missing targets are skipped without failing the tour');

assert.equal(mobilePopoverWidth(320), 288, 'small Android viewport keeps 16px space on both sides');
assert.equal(mobilePopoverWidth(390), 358, 'common Android viewport cannot overflow horizontally');
assert.equal(mobilePopoverWidth(1024), 384, 'popover width is capped on larger screens');

ONBOARDING_PAGE_IDS.forEach((page) => dismissOnboarding(storage, user, page, 'finish'));
resetOnboarding(storage, user);
ONBOARDING_PAGE_IDS.forEach((page) => {
  assert.equal(isOnboardingComplete(storage, user, page), false, `reset clears ${page}`);
});

console.log('FreshGo onboarding v1 checks passed.');
