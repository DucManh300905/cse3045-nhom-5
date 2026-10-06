import axios from 'axios';
import client, { type ApiResponse } from './client';
import type {
  DocumentType,
  MenuItemType,
  MerchantCategory,
  MerchantMenuItem,
  MerchantOrder,
  MerchantRestaurant,
  OpeningHour,
  OrderStatus,
  OwnerReasonCode,
  Paginated,
} from '../types';

// Chủ quán quản lý quán của mình (docs/API.md mục 2.5)

export interface RestaurantInput {
  name: string;
  address: string;
  phone: string;
  description?: string;
  cuisineTypes?: string[];
  minOrderAmount?: number;
  deliveryRadiusKm?: number;
  avgPrepMinutes?: number;
}

export interface MenuItemInput {
  category: string;
  name: string;
  description?: string;
  type?: MenuItemType;
  /** Bắt buộc khi không có biến thể; có biến thể thì server tự lấy giá biến thể mặc định */
  basePrice?: number;
  prepMinutes?: number;
  isAvailable?: boolean;
  dailyLimit?: number | null;
  /** Gửi kèm id cũ để giữ id; gửi lên là ghi đè toàn bộ */
  variants?: { id?: string; name: string; price: number; isDefault?: boolean }[];
  optionGroups?: {
    id?: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: { id?: string; name: string; price: number; isAvailable?: boolean }[];
  }[];
}

const upload = (file: File, field: string, extra: Record<string, string> = {}) => {
  const form = new FormData();
  Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  form.append(field, file);
  return form;
};
const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

export const merchantApi = {
  // ---------- Hồ sơ quán ----------

  /** null nếu chủ quán chưa tạo quán */
  async getRestaurant() {
    try {
      const res = await client.get<ApiResponse<MerchantRestaurant>>('/merchant/restaurant');
      return res.data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      throw err;
    }
  },

  async createRestaurant(input: RestaurantInput) {
    const res = await client.post<ApiResponse<MerchantRestaurant>>('/merchant/restaurant', input);
    return res.data.data;
  },

  async updateRestaurant(input: Partial<RestaurantInput>) {
    const res = await client.put<ApiResponse<MerchantRestaurant>>('/merchant/restaurant', input);
    return res.data.data;
  },

  async updateOpeningHours(openingHours: OpeningHour[]) {
    const res = await client.put<ApiResponse<MerchantRestaurant>>('/merchant/restaurant/opening-hours', { openingHours });
    return res.data.data;
  },

  async uploadImage(kind: 'logo' | 'cover', file: File) {
    const res = await client.post<ApiResponse<MerchantRestaurant>>(`/merchant/restaurant/images/${kind}`, upload(file, 'image'), multipart);
    return res.data.data;
  },

  async uploadDocument(type: DocumentType, file: File) {
    const res = await client.post<ApiResponse<MerchantRestaurant>>('/merchant/restaurant/documents', upload(file, 'file', { type }), multipart);
    return res.data.data;
  },

  /** DRAFT / REJECTED -> SUBMITTED; thiếu giờ mở cửa / giấy tờ -> 422 PROFILE_INCOMPLETE */
  async submit() {
    const res = await client.post<ApiResponse<MerchantRestaurant>>('/merchant/restaurant/submit');
    return res.data.data;
  },

  async setAcceptingOrders(isAcceptingOrders: boolean) {
    const res = await client.patch<ApiResponse<MerchantRestaurant>>('/merchant/restaurant/accepting-orders', { isAcceptingOrders });
    return res.data.data;
  },

  // ---------- Danh mục ----------

  async listCategories() {
    const res = await client.get<ApiResponse<MerchantCategory[]>>('/merchant/categories');
    return res.data.data;
  },

  async createCategory(name: string) {
    const res = await client.post<ApiResponse<MerchantCategory>>('/merchant/categories', { name });
    return res.data.data;
  },

  async updateCategory(id: string, input: { name?: string; isActive?: boolean }) {
    const res = await client.put<ApiResponse<MerchantCategory>>(`/merchant/categories/${id}`, input);
    return res.data.data;
  },

  /** Còn món -> 409 CATEGORY_NOT_EMPTY */
  async deleteCategory(id: string) {
    await client.delete(`/merchant/categories/${id}`);
  },

  /** ids phải đủ mọi danh mục của quán */
  async reorderCategories(ids: string[]) {
    const res = await client.patch<ApiResponse<MerchantCategory[]>>('/merchant/categories/reorder', { ids });
    return res.data.data;
  },

  // ---------- Món ----------

  async listMenuItems(query: { category?: string; q?: string } = {}) {
    const res = await client.get<ApiResponse<MerchantMenuItem[]>>('/merchant/menu-items', {
      params: Object.fromEntries(Object.entries(query).filter(([, v]) => v)),
    });
    return res.data.data;
  },

  async createMenuItem(input: MenuItemInput) {
    const res = await client.post<ApiResponse<MerchantMenuItem>>('/merchant/menu-items', input);
    return res.data.data;
  },

  async updateMenuItem(id: string, input: Partial<MenuItemInput>) {
    const res = await client.put<ApiResponse<MerchantMenuItem>>(`/merchant/menu-items/${id}`, input);
    return res.data.data;
  },

  /** dailyLimit: null = không giới hạn */
  async setAvailability(id: string, input: { isAvailable?: boolean; dailyLimit?: number | null }) {
    const res = await client.patch<ApiResponse<MerchantMenuItem>>(`/merchant/menu-items/${id}/availability`, input);
    return res.data.data;
  },

  async uploadMenuItemImage(id: string, file: File) {
    const res = await client.post<ApiResponse<MerchantMenuItem>>(`/merchant/menu-items/${id}/image`, upload(file, 'image'), multipart);
    return res.data.data;
  },

  /** Xóa mềm */
  async deleteMenuItem(id: string) {
    await client.delete(`/merchant/menu-items/${id}`);
  },

  // ---------- Đơn hàng của quán (BR-35) ----------

  async listOrders(query: { status?: OrderStatus[]; page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<Paginated<MerchantOrder>>>('/merchant/orders', {
      params: { ...query, status: query.status?.join(',') || undefined },
    });
    return res.data.data;
  },

  async acceptOrder(id: string) {
    const res = await client.post<ApiResponse<MerchantOrder>>(`/merchant/orders/${id}/accept`, {});
    return res.data.data;
  },

  /** PLACED -> REJECTED, hoàn suất */
  async rejectOrder(id: string, reasonCode: OwnerReasonCode, note?: string) {
    const res = await client.post<ApiResponse<MerchantOrder>>(`/merchant/orders/${id}/reject`, { reasonCode, note });
    return res.data.data;
  },

  /** ACCEPTED -> CANCELLED, hoàn suất */
  async cancelOrder(id: string, reasonCode: OwnerReasonCode, note?: string) {
    const res = await client.post<ApiResponse<MerchantOrder>>(`/merchant/orders/${id}/cancel`, { reasonCode, note });
    return res.data.data;
  },

  /** PREPARING / READY / DELIVERING / COMPLETED theo luồng chuẩn */
  async advanceOrder(id: string, to: OrderStatus) {
    const res = await client.post<ApiResponse<MerchantOrder>>(`/merchant/orders/${id}/status`, { to });
    return res.data.data;
  },
};
