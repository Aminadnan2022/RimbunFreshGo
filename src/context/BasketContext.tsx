import React, { createContext, useContext, useState } from 'react';
import type { RecurringBasket } from '../types';

interface BasketContextValue {
  baskets: RecurringBasket[];
  addBasket: (basket: RecurringBasket) => void;
  updateBasket: (id: string, updates: Partial<RecurringBasket>) => void;
  removeBasket: (id: string) => void;
  togglePause: (id: string) => void;
}

const BasketContext = createContext<BasketContextValue | null>(null);

export function BasketProvider({ children }: { children: React.ReactNode }) {
  const [baskets, setBaskets] = useState<RecurringBasket[]>(() => {
    try {
      const stored = localStorage.getItem('rfg-baskets');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const save = (next: RecurringBasket[]) => {
    localStorage.setItem('rfg-baskets', JSON.stringify(next));
    setBaskets(next);
  };

  return (
    <BasketContext.Provider
      value={{
        baskets,
        addBasket: (b) => save([...baskets, b]),
        updateBasket: (id, updates) =>
          save(baskets.map((b) => (b.id === id ? { ...b, ...updates } : b))),
        removeBasket: (id) => save(baskets.filter((b) => b.id !== id)),
        togglePause: (id) =>
          save(baskets.map((b) => (b.id === id ? { ...b, active: !b.active } : b))),
      }}
    >
      {children}
    </BasketContext.Provider>
  );
}

export function useBaskets() {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error('useBaskets must be used within BasketProvider');
  return ctx;
}
