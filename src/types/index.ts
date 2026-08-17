export type Category = 'chicken' | 'fish' | 'prawns' | 'squid' | 'combo';

export type DeliveryDay = string;

export type PreparationOption = 'whole' | 'cleaned' | 'descaled' | 'gutted' | 'cut' | 'cut4' | 'cut12' | 'cut16';

export type SellingUnit = 'piece' | 'kg' | 'pack';

export type OrderingMode = 'fixed_quantity' | 'weight_only' | 'whole_fish_by_weight' | 'combo' | 'slice';

export interface Product {
  id: string;
  name: string;
  nameMs: string;
  category: Category;
  price: number;
  /** Current supplier cost (RM per unit). Source of truth for new orders; history lives in supplier_price_history. */
  costPrice?: number;
  /** Current supplier name the cost is sourced from. */
  costSupplierName?: string;
  unit: string;
  priceNote?: string;
  weight?: string;
  description: string;
  longDescription: string;
  image: string;
  images: string[];
  freshness: 'available' | 'limited' | 'sold-out';
  preparationOptions: PreparationOption[];
  vendorId: string;
  tags: string[];
  isPopular?: boolean;
  showEstimatedQuantity?: boolean;
  orderingMode: OrderingMode;
  averageWeight?: number;
  selling_unit?: SellingUnit;
  displayOrder: number;
  isPinned: boolean;
  /** Slice ordering fields (orderingMode === 'slice'). */
  sliceUnit?: string;
  minSlice?: number;
  maxSlice?: number;
  defaultSlice?: number;
  sliceIncrement?: number;
  sliceInstruction?: string;
}

export interface ComboItem {
  productId: string;
  quantity: number;
  label: string;
}

export interface Combo {
  id: string;
  name: string;
  tagline: string;
  price: number;
  originalValue: number;
  description: string;
  items: ComboItem[];
  image: string;
  images: string[];
  servings: number;
  highlights: string[];
}

export interface ComboExpandedItem {
  productId: string;
  name: string;
  image: string;
  price: number;
  unit: string;
  quantity: number;
  quantityValue?: number;
  sellingUnit?: string;
  preparation?: PreparationOption;
  pricingType?: 'per_kg' | 'fixed';
  label: string;
}

export interface DbCombo {
  id: string;
  name: string;
  name_ms: string;
  slug: string;
  description: string;
  badge: string;
  category_label: string;
  tagline: string;
  price: number;
  original_value: number;
  discount_percent?: number;
  image: string;
  images: string[];
  servings: number;
  highlights: string[];
  featured: boolean;
  active: boolean;
  is_pinned: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbComboItem {
  id: string;
  combo_id: string;
  product_id: string;
  quantity_value: number;
  selling_unit: string;
  sort_order: number;
  custom_label?: string;
  preparation?: string;
  unit?: string;
  created_at: string;
}

export interface ComboWithItems {
  combo: DbCombo;
  items: DbComboItem[];
}

export type ComboPayload = {
  id: string;
  name: string;
  name_ms?: string;
  slug: string;
  description?: string;
  badge?: string;
  category_label?: string;
  tagline?: string;
  price: number;
  original_value?: number;
  discount_percent?: number;
  image?: string;
  images?: string[];
  servings?: number;
  highlights?: string[];
  featured?: boolean;
  active?: boolean;
  is_pinned?: boolean;
  display_order?: number;
  items: {
    product_id: string;
    quantity_value: number;
    selling_unit: string;
    sort_order?: number;
    custom_label?: string;
    preparation?: string;
    unit?: string;
  }[];
};

export interface CartItem {
  productId: string;
  name: string;
  image: string;
  price: number;
  unit: string;
  category?: Category;
  showEstimatedQuantity?: boolean;
  orderingMode?: OrderingMode;
  /** Legacy customer-selected mode retained for historical cart/order compatibility. */
  selectedOrderMode?: 'whole' | 'weight';
  averageWeight?: number;
  quantity: number;
  estimatedWeight?: number;
  preparation?: PreparationOption;
  pricingType?: 'per_kg' | 'fixed' | 'slice';
  isCombo?: boolean;
  comboId?: string;
  comboItems?: ComboExpandedItem[];
  /** Slice ordering (orderingMode === 'slice'). */
  ordering_type?: 'slice';
  sliceQuantity?: number;
  sliceUnit?: string;
  minSlice?: number;
  maxSlice?: number;
  sliceIncrement?: number;
  sliceInstruction?: string;
  /** Actual weight (kg) entered by the supplier; enables final price = weight x price. */
  actualWeight?: number;
  /** Supplier unit cost snapshot (RM per kg / per piece) frozen at add-to-cart time. */
  costPrice?: number;
  /** Supplier name snapshot for supplier-level profit reports. */
  supplierName?: string;
  /** Gross profit snapshot for this line. Re-computed when the supplier weighs the order. */
  grossProfit?: number;
}

export interface Cart {
  items: CartItem[];
  deliveryDay: DeliveryDay | null;
}

export interface CustomerDetails {
  name: string;
  phone: string;
  email: string;
  apartment: string;
  houseUnit: string;
  pickupLocation: string;
  /** Chosen Delivery Point name (the canonical concept replacing pickup location). */
  deliveryPointName: string;
  /** Handover instruction snapshot for the chosen Delivery Point. */
  deliveryMethod: string;
  notes: string;
}

export type PaymentStatus = 'Pending' | 'Ready To Pay' | 'Paid';

export interface Order {
  id: string;
  items: CartItem[];
  customer: CustomerDetails;
  deliveryDay: DeliveryDay;
  deliveryDate: string;
  deliveryWindow: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: 'confirmed' | 'preparing' | 'out-for-delivery' | 'delivered';
  createdAt: string;
  statusTimeline: { status: string; time: string; done: boolean }[];
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  /** Delivery Batch the order was assigned to (optional logistics grouping only). */
  deliveryBatchId?: string | null;
  /** Per-order delivery progress ('pending' | 'arrived' | 'delivered'). */
  deliveryStatus?: string;
  deliveredAt?: string | null;
  /** Order-owned supplier workflow timestamps (source of truth). */
  packingStartedAt?: string | null;
  packingCompletedAt?: string | null;
  supplierDispatchStartedAt?: string | null;
  supplierDispatchCompletedAt?: string | null;
  readyForRiderAt?: string | null;
  lalamoveTrackingUrl?: string | null;
  /** Phase 3 immutable, bilingual checkout preparation snapshot. */
  preparationSnapshot?: Record<string, unknown>;
}

export interface Vendor {
  id: string;
  name: string;
  location: string;
  story: string;
  since: string;
  image: string;
  coverImage: string;
  products: string[];
  certifications: string[];
  qualityStandards: string[];
}

export interface RecurringBasket {
  id: string;
  name: string;
  items: CartItem[];
  frequency: 'weekly' | 'biweekly';
  deliveryDay: DeliveryDay;
  active: boolean;
  nextDelivery: string;
  createdAt: string;
}

/**
 * Central website visibility + business settings.
 * Single source of truth for what is shown to customers (navbar, footer,
 * homepage sections, public pages). Persisted as key/value rows in
 * `site_settings`. All flags default to TRUE except maintenance_mode.
 */
export interface WebsiteSettings {
  /** Global site name (single source of truth for the brand name). */
  site_name: string;
  /** Storage path of the site logo (e.g. `branding/logo.webp`), not a public URL. */
  site_logo: string;

  show_shop: boolean;
  show_family_combo: boolean;
  show_suppliers: boolean;
  show_recurring_basket: boolean;

  show_home_featured_products: boolean;
  show_home_featured_combos: boolean;
  show_home_suppliers: boolean;
  show_home_testimonials: boolean;
  show_home_delivery_schedule: boolean;
  show_home_why_freshgo: boolean;

  allow_customer_registration: boolean;
  allow_customer_orders: boolean;

  maintenance_mode: boolean;

  /** Default sort mode for the shop (customer product list). Values: manual | name | price_low | price_high | newest. */
  default_product_sort: string;
  /** Default sort mode for the combos page. Values: manual | name | price_low | price_high | newest. */
  default_combo_sort: string;
}

export const WEBSITE_SETTINGS_DEFAULTS: WebsiteSettings = {
  site_name: 'Rimbun FreshGo',
  site_logo: '',

  show_shop: true,
  show_family_combo: true,
  show_suppliers: true,
  show_recurring_basket: true,

  show_home_featured_products: true,
  show_home_featured_combos: true,
  show_home_suppliers: true,
  show_home_testimonials: true,
  show_home_delivery_schedule: true,
  show_home_why_freshgo: true,

  allow_customer_registration: true,
  allow_customer_orders: true,

  maintenance_mode: false,

  default_product_sort: 'manual',
  default_combo_sort: 'manual',
};

export const WEBSITE_BOOLEAN_KEYS: (keyof WebsiteSettings)[] = [
  'show_shop',
  'show_family_combo',
  'show_suppliers',
  'show_recurring_basket',
  'show_home_featured_products',
  'show_home_featured_combos',
  'show_home_suppliers',
  'show_home_testimonials',
  'show_home_delivery_schedule',
  'show_home_why_freshgo',
  'allow_customer_registration',
  'allow_customer_orders',
  'maintenance_mode',
];

export const WEBSITE_SETTINGS_KEYS: (keyof WebsiteSettings)[] = [
  'site_name',
  'site_logo',
  ...WEBSITE_BOOLEAN_KEYS,
  'default_product_sort',
  'default_combo_sort',
];

/**
 * Footer settings (Website CMS). All values are stored as
 * key/value rows in `site_settings`. Booleans are stored as
 * 'true'/'false' strings; text fields as plain strings.
 */
export interface FooterSettings {
  footer_description: string;

  contact_phone: string;
  contact_whatsapp: string;
  contact_email: string;
  contact_address: string;
  delivery_area: string;

  social_facebook: string;
  social_instagram: string;
  social_tiktok: string;
  social_threads: string;
  social_youtube: string;
  social_linkedin: string;
  social_x: string;

  footer_show_shop: boolean;
  footer_show_family_combo: boolean;
  footer_show_suppliers: boolean;
  footer_show_recurring_basket: boolean;
  footer_show_faq: boolean;
  footer_show_how_it_works: boolean;
  footer_show_privacy: boolean;
  footer_show_terms: boolean;

  copyright_text: string;
}

export const FOOTER_SETTINGS_DEFAULTS: FooterSettings = {
  footer_description: 'Freshly prepared daily proteins, delivered to your door every {{days}}. Never frozen. Always local.',

  contact_phone: '+60 12-345 6789',
  contact_whatsapp: '',
  contact_email: 'hello@rimbunfreshgo.my',
  contact_address: 'Delivering across Klang Valley, Selangor',
  delivery_area: 'Klang Valley, Selangor',

  social_facebook: '',
  social_instagram: '',
  social_tiktok: '',
  social_threads: '',
  social_youtube: '',
  social_linkedin: '',
  social_x: '',

  footer_show_shop: true,
  footer_show_family_combo: true,
  footer_show_suppliers: true,
  footer_show_recurring_basket: true,
  footer_show_faq: true,
  footer_show_how_it_works: true,
  footer_show_privacy: true,
  footer_show_terms: true,

  copyright_text: '© {{year}} Rimbun FreshGo. All rights reserved.',
};

export const FOOTER_BOOLEAN_KEYS: (keyof FooterSettings)[] = [
  'footer_show_shop',
  'footer_show_family_combo',
  'footer_show_suppliers',
  'footer_show_recurring_basket',
  'footer_show_faq',
  'footer_show_how_it_works',
  'footer_show_privacy',
  'footer_show_terms',
];

export const FOOTER_SETTINGS_KEYS: (keyof FooterSettings)[] = [
  'footer_description',
  'contact_phone',
  'contact_whatsapp',
  'contact_email',
  'contact_address',
  'delivery_area',
  'social_facebook',
  'social_instagram',
  'social_tiktok',
  'social_threads',
  'social_youtube',
  'social_linkedin',
  'social_x',
  ...FOOTER_BOOLEAN_KEYS,
  'copyright_text',
];
