export const ONBOARDING_VERSION = 'v1' as const;

export const ONBOARDING_PAGE_IDS = [
  'shop',
  'product-detail',
  'cart',
  'checkout',
  'payment-receipt',
  'order-tracking',
] as const;

export type OnboardingPageId = (typeof ONBOARDING_PAGE_IDS)[number];

export type OnboardingMode = 'default' | 'on' | 'off';

export type OnboardingStep = {
  target: string;
  body: string;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function onboardingStorageKey(userId: string, page: OnboardingPageId): string {
  return `freshgo:onboarding:${ONBOARDING_VERSION}:${userId}:${page}`;
}

export function onboardingModeStorageKey(userId: string): string {
  return `freshgo:onboarding:${ONBOARDING_VERSION}:${userId}:mode`;
}

export function getOnboardingMode(storage: StorageLike, userId: string): OnboardingMode {
  const value = storage.getItem(onboardingModeStorageKey(userId));
  return value === 'on' || value === 'off' ? value : 'default';
}

export function isTutorialModeOn(storage: StorageLike, userId: string): boolean {
  return getOnboardingMode(storage, userId) === 'on';
}

export function isOnboardingComplete(
  storage: StorageLike,
  userId: string,
  page: OnboardingPageId,
): boolean {
  return storage.getItem(onboardingStorageKey(userId, page)) === 'complete';
}

export function completeOnboarding(
  storage: StorageLike,
  userId: string,
  page: OnboardingPageId,
): void {
  storage.setItem(onboardingStorageKey(userId, page), 'complete');
  if (
    getOnboardingMode(storage, userId) === 'on'
    && ONBOARDING_PAGE_IDS.every((pageId) => isOnboardingComplete(storage, userId, pageId))
  ) {
    storage.setItem(onboardingModeStorageKey(userId), 'off');
  }
}

export function dismissOnboarding(
  storage: StorageLike,
  userId: string,
  page: OnboardingPageId,
  outcome: 'skip' | 'finish',
): void {
  void outcome;
  completeOnboarding(storage, userId, page);
}

export function resetOnboarding(storage: StorageLike, userId: string): void {
  ONBOARDING_PAGE_IDS.forEach((page) => {
    storage.removeItem(onboardingStorageKey(userId, page));
  });
}

export function setTutorialMode(
  storage: StorageLike,
  userId: string,
  enabled: boolean,
): void {
  storage.setItem(onboardingModeStorageKey(userId), enabled ? 'on' : 'off');
  if (enabled) resetOnboarding(storage, userId);
}

export function shouldShowOnboarding(
  storage: StorageLike,
  userId: string,
  page: OnboardingPageId,
): boolean {
  return getOnboardingMode(storage, userId) !== 'off'
    && !isOnboardingComplete(storage, userId, page);
}

export function availableOnboardingSteps<T extends OnboardingStep>(
  steps: readonly T[],
  findTarget: (selector: string) => Element | null,
): T[] {
  return steps.filter((step) => findTarget(step.target));
}

export function mobilePopoverWidth(viewportWidth: number): number {
  return Math.max(0, Math.min(384, viewportWidth - 32));
}
