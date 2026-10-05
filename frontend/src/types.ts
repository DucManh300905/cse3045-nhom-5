export type Role = 'CUSTOMER' | 'RESTAURANT_OWNER' | 'ADMIN';

export interface User {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: Role;
  status: 'ACTIVE' | 'BLOCKED';
}

export type DishCategory = 'FOOD' | 'DRINK';

export interface Dish {
  id: string;
  name: string;
  description: string;
  price: number;
  category: DishCategory;
  shop: string;
  /** Số suất còn lại trong ngày */
  stock: number;
  prepMinutes: number;
  /** Giờ chốt nhận đơn, dạng HH:mm */
  closesAt: string;
  image: string;
  popularity: number;
}

export interface CartLine {
  dish: Dish;
  qty: number;
}

export interface OrderLine {
  dishId: string;
  name: string;
  shop: string;
  price: number;
  qty: number;
}

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERING' | 'DONE' | 'CANCELLED';

export interface Order {
  id: string;
  userId: string;
  createdAt: string;
  items: OrderLine[];
  total: number;
  receiverName: string;
  phone: string;
  address: string;
  note: string;
  status: OrderStatus;
}
