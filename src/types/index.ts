export type Category = 'chicken' | 'fish' | 'prawns' | 'squid' | 'combo';

export type DeliveryDay = string;

export type PreparationOption = 'whole' | 'cleaned' | 'descaled' | 'gutted' | 'cut' | 'cut4' | 'cut12' | 'cut16';

export type OrderingMode = 'fixed_quantity' | 'weight_only' | 'whole_or_weight' | 'combo';

export interface Product {
  id: string;
  name: string;
  nameMs: string;
  category: Category;
  price: number;
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
  preparation?: PreparationOption;
  pricingType?: 'per_kg' | 'fixed';
  label: string;
}

export interface CartItem {
  productId: string;
  name: string;
  image: string;
  price: number;
  unit: string;
  category?: Category;
  showEstimatedQuantity?: boolean;
  orderingMode?: OrderingMode;
  averageWeight?: number;
  quantity: number;
  estimatedWeight?: number;
  preparation?: PreparationOption;
  pricingType?: 'per_kg' | 'fixed';
  isCombo?: boolean;
  comboId?: string;
  comboItems?: ComboExpandedItem[];
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
