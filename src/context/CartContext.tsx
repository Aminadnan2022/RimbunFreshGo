import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Cart, CartItem, DeliveryDay } from '../types';

type CartAction =
  | { type: 'ADD_ITEM'; item: CartItem }
  | { type: 'REMOVE_ITEM'; productId: string; comboId?: string }
  | { type: 'UPDATE_QTY'; productId: string; quantity: number; comboId?: string }
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

function cartReducer(state: Cart, action: CartAction): Cart {
  switch (action.type) {
    case 'LOAD_CART':
      return action.cart;
    case 'ADD_ITEM': {
      const key = action.item.comboId ?? action.item.productId;
      const existing = state.items.find((i) =>
        action.item.comboId ? i.comboId === key : i.productId === key
      );
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) => {
            const match = action.item.comboId ? i.comboId === key : i.productId === key;
            return match ? { ...i, quantity: i.quantity + action.item.quantity } : i;
          }),
        };
      }
      return { ...state, items: [...state.items, action.item] };
    }
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter((i) =>
          action.comboId ? i.comboId !== action.comboId : i.productId !== action.productId
        ),
      };
    case 'UPDATE_QTY': {
      if (action.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter((i) =>
            action.comboId ? i.comboId !== action.comboId : i.productId !== action.productId
          ),
        };
      }
      return {
        ...state,
        items: state.items.map((i) => {
          const match = action.comboId ? i.comboId === action.comboId : i.productId === action.productId;
          return match ? { ...i, quantity: action.quantity } : i;
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
  removeItem: (productId: string, comboId?: string) => void;
  updateQty: (productId: string, quantity: number, comboId?: string) => void;
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
  const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        addItem: (item) => dispatch({ type: 'ADD_ITEM', item }),
        removeItem: (productId, comboId) => dispatch({ type: 'REMOVE_ITEM', productId, comboId }),
        updateQty: (productId, quantity, comboId) =>
          dispatch({ type: 'UPDATE_QTY', productId, quantity, comboId }),
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
