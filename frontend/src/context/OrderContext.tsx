import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Order } from '../types';

// TODO: thay bằng API đơn hàng khi backend có module order
const STORAGE_KEY = 'mak-orders';

interface OrderValue {
  ordersOf: (userId: string) => Order[];
  placeOrder: (order: Omit<Order, 'id' | 'createdAt' | 'status'>) => Order;
}

const Ctx = createContext<OrderValue | null>(null);

function loadOrders(): Order[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Order[];
  } catch {
    return [];
  }
}

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(loadOrders);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }, [orders]);

  const placeOrder: OrderValue['placeOrder'] = input => {
    const order: Order = {
      ...input,
      id: 'MAK' + Date.now().toString().slice(-6),
      createdAt: new Date().toISOString(),
      status: 'PENDING',
    };
    setOrders(list => [order, ...list]);
    return order;
  };

  const ordersOf = (userId: string) => orders.filter(o => o.userId === userId);

  return <Ctx.Provider value={{ ordersOf, placeOrder }}>{children}</Ctx.Provider>;
}

export const useOrders = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useOrders must be used inside OrderProvider');
  return c;
};
