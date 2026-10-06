import client, { type ApiResponse } from './client';
import type { MenuCategory, MenuItem, MenuItemType, Paginated, Restaurant } from '../types';

// API public: khách xem quán và món, không cần đăng nhập (docs/API.md mục 2.4)

export interface MenuItemQuery {
  /** Tìm không dấu theo tên */
  q?: string;
  type?: MenuItemType;
  /** id quán */
  restaurant?: string;
  inStock?: boolean;
  sort?: 'popular' | 'price' | '-price' | 'newest';
  page?: number;
  limit?: number;
}

export interface RestaurantQuery {
  q?: string;
  cuisine?: string;
  isOpen?: boolean;
  sort?: 'rating' | 'name' | 'newest';
  page?: number;
  limit?: number;
}

/** Bỏ tham số rỗng / false để URL gọn */
const clean = (params: object) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== false));

export const menuApi = {
  async listMenuItems(query: MenuItemQuery = {}) {
    const res = await client.get<ApiResponse<Paginated<MenuItem>>>('/menu-items', { params: clean(query) });
    return res.data.data;
  },

  async getMenuItem(id: string) {
    const res = await client.get<ApiResponse<MenuItem>>(`/menu-items/${id}`);
    return res.data.data;
  },

  async listRestaurants(query: RestaurantQuery = {}) {
    const res = await client.get<ApiResponse<Paginated<Restaurant>>>('/restaurants', { params: clean(query) });
    return res.data.data;
  },

  /** id hoặc slug */
  async getRestaurant(idOrSlug: string) {
    const res = await client.get<ApiResponse<Restaurant>>(`/restaurants/${idOrSlug}`);
    return res.data.data;
  },

  /** Menu theo danh mục; món hết vẫn có với isOrderable = false */
  async getRestaurantMenu(idOrSlug: string) {
    const res = await client.get<ApiResponse<{ restaurant: Restaurant; categories: MenuCategory[] }>>(
      `/restaurants/${idOrSlug}/menu`
    );
    return res.data.data;
  },
};
