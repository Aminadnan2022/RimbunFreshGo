import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Cart, CartItem, DeliveryDay } from '../types';

type SelectedOrderMode = 'whole' | 'weight';

type CartAction =
  | { type: 'ADD_ITEM'; item: CartItem }
  | {
      type: 'REMOVE_ITEM';
      productId: string;
      comboId?: string;
      preparation?: string;
      selectedOrderMode?: SelectedOrderMode;
    }
  | {
      type: 'UPDATE_QTY';
      productId: string;
      quantity: number;
      comboId?: string;
      preparation?: string;
      selectedOrderMode?: SelectedOrderMode;
    }
  | {
      type: 'UPDATE_ESTIMATED_WEIGHT';
      productId: string;
      estimatedWeight: number;
      comboId?: string;
      preparation?: string;
      selectedOrderMode?: SelectedOrderMode;
    }
  | {
      type: 'UPDATE_SLICE';
      productId: string;
      sliceQuantity: number;
      comboId?: string;
      preparation?: string;
      selectedOrderMode?: SelectedOrderMode;
    }
  | { type: 'SET_DELIVERY_DAY'; day: DeliveryDay }
  | { type: 'CLEAR_CART' }
  | { type: 'LOAD_CART'; cart: Cart };

const emptyCart: Cart = { items: [], deliveryDay: null };

function storageKey(userId: string) {
  return `rfg-cart-${userId}`;
}

function loadCart(userId: string | null): Cart {
  if (!userId) return emptyCart;

  try {
    const stored = localStorage.getItem(storageKey(userId));
    return stored ? JSON.parse(stored) : emptyCart;
  } catch {
    return emptyCart;
  }
}

function itemMode(item: CartItem): string {
  // Canonical Phase 3D mode: customer orders physical whole fish by quantity,
  // while final price is still based on supplier-confirmed weight.
  if (
    item.orderingMode === 'whole_fish_by_weight' ||
    item.selectedOrderMode === 'whole'
  ) {
    return 'whole';
  }

  if (item.selectedOrderMode) {
    return item.selectedOrderMode;
  }

  if (item.orderingMode === 'weight_only') {
    return 'weight';
  }

  if (item.orderingMode === 'slice' || item.pricingType === 'slice') {
    return 'slice';
  }

  return 'default';
}

function cartItemKey(item: CartItem): string {
  const base = item.comboId ?? item.productId;
  const prep = item.preparation ?? 'default';
  const mode = itemMode(item);

  // Whole fish must merge regardless of its estimated weight because the
  // customer is ordering a count of physical fish.
  const weight =
    item.pricingType === 'per_kg' && mode !== 'whole'
      ? `|weight${item.estimatedWeight ?? 0}`
      : '';

  const slices =
    item.pricingType === 'slice'
      ? `|slices${item.sliceQuantity ?? 0}`
      : '';

  const choices = item.comboItems
    ?.filter((part) => part.choiceGroupKey)
    .map((part) => `${part.choiceGroupKey}:${part.comboItemId}`)
    .sort()
    .join(',') ?? '';

  return `${base}|${prep}|${mode}${weight}${slices}|${choices}`;
}

function actionMatchesItem(
  item: CartItem,
  action: {
    productId: string;
    comboId?: string;
    preparation?: string;
    selectedOrderMode?: SelectedOrderMode;
  },
): boolean {
  const base = item.comboId ?? item.productId;
  const actionBase = action.comboId ?? action.productId;
  const prep = item.preparation ?? 'default';
  const actionPrep = action.preparation ?? 'default';

  if (base !== actionBase || prep !== actionPrep) {
    return false;
  }

  if (action.selectedOrderMode) {
    return item.selectedOrderMode === action.selectedOrderMode;
  }

  return !item.selectedOrderMode;
}

function wholeFishEstimatedWeight(item: CartItem, quantity: number): number | undefined {
  const isWholeFish =
    item.orderingMode === 'whole_fish_by_weight' ||
    item.selectedOrderMode === 'whole';

  if (
    !isWholeFish ||
    !item.averageWeight ||
    item.averageWeight <= 0
  ) {
    return item.estimatedWeight;
  }

  return (quantity * item.averageWeight) / 1000;
}

function cartReducer(state: Cart, action: CartAction): Cart {
  switch (action.type) {
    case 'LOAD_CART':
      return action.cart;

    case 'ADD_ITEM': {
      const key = cartItemKey(action.item);
      const existing = state.items.find((item) => cartItemKey(item) === key);

      if (!existing) {
        return {
          ...state,
          items: [...state.items, action.item],
        };
      }

      // Whole Fish is priced per kg but ordered as physical pieces.
      // Repeated Add to Cart therefore increments the fish count.
      if (
        existing.orderingMode === 'whole_fish_by_weight' ||
        existing.selectedOrderMode === 'whole'
      ) {
        const quantity = existing.quantity + action.item.quantity;

        return {
          ...state,
          items: state.items.map((item) =>
            cartItemKey(item) === key
              ? {
                  ...item,
                  quantity,
                  estimatedWeight: wholeFishEstimatedWeight(item, quantity),
                }
              : item,
          ),
        };
      }

      // Weight and slice lines represent an exact requested amount.
      // An identical existing line remains unchanged.
      if (existing.pricingType === 'per_kg' || existing.pricingType === 'slice') {
        return state;
      }

      return {
        ...state,
        items: state.items.map((item) =>
          cartItemKey(item) === key
            ? {
                ...item,
                quantity: item.quantity + action.item.quantity,
              }
            : item,
        ),
      };
    }

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(
          (item) => !actionMatchesItem(item, action),
        ),
      };

    case 'UPDATE_QTY': {
      if (action.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter(
            (item) => !actionMatchesItem(item, action),
          ),
        };
      }

      return {
        ...state,
        items: state.items.map((item) => {
          if (!actionMatchesItem(item, action)) {
            return item;
          }

          return {
            ...item,
            quantity: action.quantity,
            estimatedWeight: wholeFishEstimatedWeight(
              item,
              action.quantity,
            ),
          };
        }),
      };
    }

    case 'UPDATE_ESTIMATED_WEIGHT':
      return {
        ...state,
        items: state.items.map((item) => {
          if (
            actionMatchesItem(item, action) &&
            item.pricingType === 'per_kg' &&
            item.orderingMode !== 'whole_fish_by_weight' &&
            item.selectedOrderMode !== 'whole'
          ) {
            return {
              ...item,
              estimatedWeight: action.estimatedWeight,
            };
          }

          return item;
        }),
      };

    case 'UPDATE_SLICE':
      return {
        ...state,
        items: state.items.map((item) => {
          if (
            actionMatchesItem(item, action) &&
            item.pricingType === 'slice'
          ) {
            return {
              ...item,
              quantity: action.sliceQuantity,
              sliceQuantity: action.sliceQuantity,
            };
          }

          return item;
        }),
      };

    case 'SET_DELIVERY_DAY':
      return {
        ...state,
        deliveryDay: action.day,
      };

    case 'CLEAR_CART':
      return emptyCart;

    default:
      return state;
  }
}

interface CartContextValue {
  cart: Cart;

  addItem: (item: CartItem) => void;

  removeItem: (
    productId: string,
    comboId?: string,
    preparation?: string,
    selectedOrderMode?: SelectedOrderMode,
  ) => void;

  updateQty: (
    productId: string,
    quantity: number,
    comboId?: string,
    preparation?: string,
    selectedOrderMode?: SelectedOrderMode,
  ) => void;

  updateEstimatedWeight: (
    productId: string,
    estimatedWeight: number,
    comboId?: string,
    preparation?: string,
    selectedOrderMode?: SelectedOrderMode,
  ) => void;

  updateSlice: (
    productId: string,
    sliceQuantity: number,
    comboId?: string,
    preparation?: string,
    selectedOrderMode?: SelectedOrderMode,
  ) => void;

  setDeliveryDay: (day: DeliveryDay) => void;
  clearCart: () => void;

  itemCount: number;
  subtotal: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cart, dispatch] = useReducer(cartReducer, emptyCart);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user?.id ?? null;
      userIdRef.current = userId;

      dispatch({
        type: 'LOAD_CART',
        cart: loadCart(userId),
      });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id ?? null;

      if (newUserId !== userIdRef.current) {
        userIdRef.current = newUserId;

        dispatch({
          type: 'LOAD_CART',
          cart: loadCart(newUserId),
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (userIdRef.current) {
      localStorage.setItem(
        storageKey(userIdRef.current),
        JSON.stringify(cart),
      );
    }
  }, [cart]);

  const itemCount = cart.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  const subtotal = cart.items.reduce((sum, item) => {
    if (item.pricingType === 'per_kg') {
      return sum + item.price * (item.estimatedWeight ?? 0);
    }

    if (item.pricingType === 'slice') {
      return sum;
    }

    return sum + item.price * item.quantity;
  }, 0);

  return (
    <CartContext.Provider
      value={{
        cart,

        addItem: (item) =>
          dispatch({
            type: 'ADD_ITEM',
            item,
          }),

        removeItem: (
          productId,
          comboId,
          preparation,
          selectedOrderMode,
        ) =>
          dispatch({
            type: 'REMOVE_ITEM',
            productId,
            comboId,
            preparation,
            selectedOrderMode,
          }),

        updateQty: (
          productId,
          quantity,
          comboId,
          preparation,
          selectedOrderMode,
        ) =>
          dispatch({
            type: 'UPDATE_QTY',
            productId,
            quantity,
            comboId,
            preparation,
            selectedOrderMode,
          }),

        updateEstimatedWeight: (
          productId,
          estimatedWeight,
          comboId,
          preparation,
          selectedOrderMode,
        ) =>
          dispatch({
            type: 'UPDATE_ESTIMATED_WEIGHT',
            productId,
            estimatedWeight,
            comboId,
            preparation,
            selectedOrderMode,
          }),

        updateSlice: (
          productId,
          sliceQuantity,
          comboId,
          preparation,
          selectedOrderMode,
        ) =>
          dispatch({
            type: 'UPDATE_SLICE',
            productId,
            sliceQuantity,
            comboId,
            preparation,
            selectedOrderMode,
          }),

        setDeliveryDay: (day) =>
          dispatch({
            type: 'SET_DELIVERY_DAY',
            day,
          }),

        clearCart: () =>
          dispatch({
            type: 'CLEAR_CART',
          }),

        itemCount,
        subtotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);

  if (!ctx) {
    throw new Error('useCart must be used within CartProvider');
  }

  return ctx;
}
