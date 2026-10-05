import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { findDish } from '../data/menu';
import type { CartLine, Dish } from '../types';
import { useToast } from './ToastContext';

const STORAGE_KEY = 'mak-cart';

interface CartValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  qtyOf: (dishId: string) => number;
  add: (dish: Dish) => void;
  change: (dishId: string, delta: number) => void;
  clear: () => void;
}

const Ctx = createContext<CartValue | null>(null);

/** Giỏ hàng chỉ lưu {id, qty}; thông tin món lấy lại từ thực đơn để giá luôn đúng */
function loadCart(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, number>;
    return Object.fromEntries(Object.entries(raw).filter(([id, q]) => findDish(id) && q > 0));
  } catch {
    return {};
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const notify = useToast();
  const [items, setItems] = useState<Record<string, number>>(loadCart);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const lines = useMemo(
    () => Object.entries(items).map(([id, qty]) => ({ dish: findDish(id)!, qty })),
    [items]
  );

  const add = (dish: Dish) => {
    const current = items[dish.id] ?? 0;
    if (current >= dish.stock) {
      notify(dish.stock ? `Chỉ còn ${dish.stock} suất ${dish.name}` : `${dish.name} đã hết hàng`);
      return;
    }
    setItems(c => ({ ...c, [dish.id]: current + 1 }));
    notify(`Đã thêm ${dish.name} vào giỏ`);
  };

  const change = (dishId: string, delta: number) =>
    setItems(c => {
      const dish = findDish(dishId);
      const qty = Math.min((c[dishId] ?? 0) + delta, dish?.stock ?? 0);
      const next = { ...c };
      if (qty > 0) next[dishId] = qty; else delete next[dishId];
      return next;
    });

  const value: CartValue = {
    lines,
    count: lines.reduce((s, l) => s + l.qty, 0),
    subtotal: lines.reduce((s, l) => s + l.qty * l.dish.price, 0),
    qtyOf: id => items[id] ?? 0,
    add,
    change,
    clear: () => setItems({}),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used inside CartProvider');
  return c;
};
