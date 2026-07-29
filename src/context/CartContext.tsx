import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Cart, CartItem, DeliveryDay } from '../types';

type CartAction =
  | { type: 'ADD_ITEM'; item: CartItem }
  | { type: 'REMOVE_ITEM'; productId: string; comboId?: string; preparation?: string }
  | { type: 'UPDATE_QTY'; productId: string; quantity: number; comboId?: string; preparation?: string }
  | { type: 'UPDATE_ESTIMATED_WEIGHT'; productId: string; estimatedWeight: number; comboId?: string; preparation?: string }
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

function cartItemKey(item: CartItem): string {
  const base = item.comboId ?? item.productId;
  const prep = item.preparation ?? 'default';
  const weight = item.pricingType === 'per_kg' ? `|${item.estimatedWeight ?? 0}` : '';
  return `${base}|${prep}${weight}`;
}

function cartReducer(state: Cart, action: CartAction): Cart {
  switch (action.type) {
    case 'LOAD_CART':
      return action.cart;
    case 'ADD_ITEM': {
      const key = cartItemKey(action.item);
      const existing = state.items.find((i) => cartItemKey(i) === key);
      if (existing) {
        if (existing.pricingType === 'per_kg') {
          return state;
        }
        return {
          ...state,
          items: state.items.map((i) =>
            cartItemKey(i) === key ? { ...i, quantity: i.quantity + action.item.quantity } : i
          ),
        };
      }
      return { ...state, items: [...state.items, action.item] };
    }
    case 'REMOVE_ITEM': {
      const baseKey = action.comboId ?? action.productId;
      const prep = action.preparation ?? 'default';
      let removed = false;
      return {
        ...state,
        items: state.items.filter((i) => {
          const itemBase = i.comboId ?? i.productId;
          const itemPrep = i.preparation ?? 'default';
          const match = itemBase === baseKey && itemPrep === prep;
          if (!match) return true;
          if (i.pricingType === 'per_kg' && !removed) {
            removed = true;
            return false;
          }
          if (i.pricingType !== 'per_kg') return false;
          return true;
        }),
      };
    }
    case 'UPDATE_QTY': {
      const baseKey = action.comboId ?? action.productId;
      const prep = action.preparation ?? 'default';
      if (action.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter((i) => {
            const itemBase = i.comboId ?? i.productId;
            const itemPrep = i.preparation ?? 'default';
            return !(itemBase === baseKey && itemPrep === prep && i.pricingType !== 'per_kg');
          }),
        };
      }
      return {
        ...state,
        items: state.items.map((i) => {
          const itemBase = i.comboId ?? i.productId;
          const itemPrep = i.preparation ?? 'default';
          if (itemBase === baseKey && itemPrep === prep && i.pricingType !== 'per_kg') {
            return { ...i, quantity: action.quantity };
          }
          return i;
        }),
      };
    }
    case 'UPDATE_ESTIMATED_WEIGHT': {
      const baseKey = action.comboId ?? action.productId;
      const prep = action.preparation ?? 'default';
      return {
        ...state,
        items: state.items.map((i) => {
          const itemBase = i.comboId ?? i.productId;
          const itemPrep = i.preparation ?? 'default';
          if (itemBase === baseKey && itemPrep === prep && i.pricingType === 'per_kg') {
            return { ...i, estimatedWeight: action.estimatedWeight };
          }
          return i;
        }),
      };
    }
    case 'SET_DELIVERY_DAY':
      return { ...state, deliveryDay: action.day };
    case 'CLEAR_CART':
      return emptyCart;
    default:
      return state;
  }
}

interface CartContextValue {
  cart: Cart;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, comboId?: string, preparation?: string) => void;
  updateQty: (productId: string, quantity: number, comboId?: string, preparation?: string) => void;
  updateEstimatedWeight: (productId: string, estimatedWeight: number, comboId?: string, preparation?: string) => void;
  setDeliveryDay: (day: DeliveryDay) => void;
  clearCart: () => void;
  itemCount: number;
  subtotal: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, dispatch] = useReducer(cartReducer, emptyCart);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Load cart for the initial session
    supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user?.id ?? null;
      userIdRef.current = userId;
      dispatch({ type: 'LOAD_CART', cart: loadCart(userId) });
    });

    // Switch cart whenever the user signs in or out
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        const newUserId = session?.user?.id ?? null;
        if (newUserId !== userIdRef.current) {
          userIdRef.current = newUserId;
          dispatch({ type: 'LOAD_CART', cart: loadCart(newUserId) });
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  // Persist cart to the user-scoped key whenever it changes
  useEffect(() => {
    if (userIdRef.current) {
      localStorage.setItem(storageKey(userIdRef.current), JSON.stringify(cart));
    }
  }, [cart]);

  const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = cart.items.reduce((sum, i) => {
    if (i.pricingType === 'per_kg') {
      return sum + i.price * (i.estimatedWeight ?? 0);
    }
    return sum + i.price * i.quantity;
  }, 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        addItem: (item) => dispatch({ type: 'ADD_ITEM', item }),
        removeItem: (productId, comboId, preparation) =>
          dispatch({ type: 'REMOVE_ITEM', productId, comboId, preparation }),
        updateQty: (productId, quantity, comboId, preparation) =>
          dispatch({ type: 'UPDATE_QTY', productId, quantity, comboId, preparation }),
        updateEstimatedWeight: (productId, estimatedWeight, comboId, preparation) =>
          dispatch({ type: 'UPDATE_ESTIMATED_WEIGHT', productId, estimatedWeight, comboId, preparation }),
        setDeliveryDay: (day) => dispatch({ type: 'SET_DELIVERY_DAY', day }),
        clearCart: () => dispatch({ type: 'CLEAR_CART' }),
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
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
