import type { WebsiteSettings } from '../types';

/**
 * Public pages that can be enabled/disabled from Admin → Settings.
 * Maps each page to its backing site_settings key.
 */
export type PublicPage = 'shop' | 'family_combo' | 'suppliers' | 'recurring_basket';

const PAGE_KEYS: Record<PublicPage, keyof WebsiteSettings> = {
  shop: 'show_shop',
  family_combo: 'show_family_combo',
  suppliers: 'show_suppliers',
  recurring_basket: 'show_recurring_basket',
};

/**
 * Homepage sections that can be enabled/disabled from Admin → Settings.
 * Maps each section to its backing site_settings key.
 */
export type HomepageSection =
  | 'featured_products'
  | 'featured_combos'
  | 'suppliers'
  | 'testimonials'
  | 'delivery_schedule'
  | 'why_freshgo';

const SECTION_KEYS: Record<HomepageSection, keyof WebsiteSettings> = {
  featured_products: 'show_home_featured_products',
  featured_combos: 'show_home_featured_combos',
  suppliers: 'show_home_suppliers',
  testimonials: 'show_home_testimonials',
  delivery_schedule: 'show_home_delivery_schedule',
  why_freshgo: 'show_home_why_freshgo',
};

/** Is a public page enabled? */
export function isPageEnabled(settings: WebsiteSettings, page: PublicPage): boolean {
  return Boolean(settings[PAGE_KEYS[page]]);
}

/** Is a homepage section enabled? */
export function isHomepageSectionEnabled(settings: WebsiteSettings, section: HomepageSection): boolean {
  return Boolean(settings[SECTION_KEYS[section]]);
}
