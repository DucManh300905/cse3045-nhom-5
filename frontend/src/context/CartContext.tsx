import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CartLine, MenuItem, RestaurantSummary } from '../types';
import { useToast } from './ToastContext';

// v2: giỏ lưu kèm quán + biến thể/topping (bản cũ chỉ lưu {dishId: qty} theo data/menu.ts)
const STORAGE_KEY = 'mak-cart-v2';
localStorage.removeItem('mak-cart');
// Đơn hàng giờ lưu trên server (/api/orders) — bỏ đơn tạm của bản cũ
localStorage.removeItem('mak-orders');
localStorage.removeItem('mak-orders-v2');

type CartRestaurant = Pick<RestaurantSummary, 'id' | 'name' | 'slug'>;

interface CartState {
  restaurant: CartRestaurant | null;
  lines: CartLine[];
}

export interface Choice {
  variantId?: string;
  optionIds: string[];
}

interface CartValue {
  /** Mỗi giỏ chỉ có món của 1 quán (BR-30) */
  restaurant: CartRestaurant | null;
  lines: CartLine[];
  count: number;
  subtotal: number;
  /** Tổng số phần của một món (mọi size/topping) */
  qtyOfItem: (menuItemId: string) => number;
  add: (item: MenuItem, restaurant: CartRestaurant, choice?: Choice, qty?: number) => boolean;
  change: (key: string, delta: number) => void;
  /** Cập nhật giá / suất còn lại theo menu mới nhất của quán, bỏ dòng không còn đặt được */
  refresh: (items: MenuItem[]) => void;
  clear: () => void;
}

const Ctx = createContext<CartValue | null>(null);

const EMPTY: CartState = { restaurant: null, lines: [] };

function loadCart(): CartState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as CartState | null;
    return raw?.restaurant && Array.isArray(raw.lines) && raw.lines.length ? raw : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Biến thể mặc định của món (nếu có) */
export const defaultVariant = (item: MenuItem) => item.variants.find(v => v.isDefault) ?? item.variants[0];

/** Món cần mở hộp chọn size/topping trước khi thêm */
export const needsChoice = (item: MenuItem) => item.variants.length > 1 || item.optionGroups.length > 0;

/** Tạo dòng giỏ từ món + lựa chọn; null nếu lựa chọn không còn hợp lệ */
export function buildLine(item: MenuItem, choice: Choice, qty: number): CartLine | null {
  const variant = choice.variantId ? item.variants.find(v => v.id === choice.variantId) : defaultVariant(item);
  if (item.variants.length && !variant) return null;

  const allOptions = item.optionGroups.flatMap(g => g.options);
  const options = choice.optionIds.map(id => allOptions.find(o => o.id === id));
  if (options.some(o => !o || !o.isAvailable)) return null;

  const optionIds = [...choice.optionIds].sort();
  return {
    key: [item.id, variant?.id ?? '', optionIds.join(',')].join('|'),
    menuItemId: item.id,
    name: item.name,
    imageUrl: item.imageUrl,
    variantId: variant?.id,
    variantName: item.variants.length > 1 ? variant?.name : undefined,
    optionIds,
    optionNames: options.map(o => o!.name),
    unitPrice: (variant?.price ?? item.basePrice) + options.reduce((s, o) => s + o!.price, 0),
    maxQty: item.remainingToday,
    qty,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const notify = useToast();
  const [cart, setCart] = useState<CartState>(loadCart);

  useEffect(() => {
    if (cart.lines.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    else localStorage.removeItem(STORAGE_KEY);
  }, [cart]);

  const qtyOfItem = useCallback(
    (menuItemId: string) => cart.lines.reduce((s, l) => (l.menuItemId === menuItemId ? s + l.qty : s), 0),
    [cart.lines]
  );

  const add: CartValue['add'] = (item, restaurant, choice, qty = 1) => {
    if (!item.isOrderable) {
      notify(`${item.name} đã hết hàng`);
      return false;
    }

    const line = buildLine(item, choice ?? { variantId: defaultVariant(item)?.id, optionIds: [] }, qty);
    if (!line) {
      notify('Lựa chọn không còn hợp lệ, vui lòng chọn lại');
      return false;
    }

    // Giỏ đang có món của quán khác (BR-30)
    let base = cart;
    if (cart.restaurant && cart.restaurant.id !== restaurant.id) {
      const ok = window.confirm(
        `Giỏ hàng đang có món của ${cart.restaurant.name}. Mỗi đơn chỉ đặt được món của một quán.\n\nXóa giỏ hiện tại để thêm món của ${restaurant.name}?`
      );
      if (!ok) return false;
      base = EMPTY;
    }

    const current = base.lines.reduce((s, l) => (l.menuItemId === item.id ? s + l.qty : s), 0);
    if (item.remainingToday !== null && current + qty > item.remainingToday) {
      notify(`Chỉ còn ${item.remainingToday} suất ${item.name}`);
      return false;
    }

    const exists = base.lines.some(l => l.key === line.key);
    setCart({
      restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug },
      lines: exists
        ? base.lines.map(l => (l.key === line.key ? { ...l, qty: l.qty + qty } : l))
        : [...base.lines, line],
    });
    notify(`Đã thêm ${item.name} vào giỏ`);
    return true;
  };

  const change = (key: string, delta: number) =>
    setCart(c => {
      const target = c.lines.find(l => l.key === key);
      if (!target) return c;
      // Giới hạn suất tính trên tổng mọi dòng của cùng món
      const others = c.lines.reduce((s, l) => (l.menuItemId === target.menuItemId && l.key !== key ? s + l.qty : s), 0);
      const max = target.maxQty === null ? Infinity : target.maxQty - others;
      const qty = Math.min(target.qty + delta, max);
      const lines = qty > 0
        ? c.lines.map(l => (l.key === key ? { ...l, qty } : l))
        : c.lines.filter(l => l.key !== key);
      return lines.length ? { ...c, lines } : EMPTY;
    });

  const refresh = useCallback((items: MenuItem[]) => {
    setCart(c => {
      const lines = c.lines.flatMap(l => {
        const item = items.find(i => i.id === l.menuItemId);
        if (!item?.isOrderable) return [];
        const fresh = buildLine(item, { variantId: l.variantId, optionIds: l.optionIds }, l.qty);
        if (!fresh) return [];
        return [{ ...fresh, qty: item.remainingToday === null ? l.qty : Math.min(l.qty, item.remainingToday) }];
      });
      const changed = JSON.stringify(lines) !== JSON.stringify(c.lines);
      if (!changed) return c;
      return lines.length ? { ...c, lines } : EMPTY;
    });
  }, []);

  const value: CartValue = {
    restaurant: cart.restaurant,
    lines: cart.lines,
    count: cart.lines.reduce((s, l) => s + l.qty, 0),
    subtotal: cart.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0),
    qtyOfItem,
    add,
    change,
    refresh,
    clear: () => setCart(EMPTY),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used inside CartProvider');
  return c;
};
