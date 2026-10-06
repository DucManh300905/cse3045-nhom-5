import client, { type ApiResponse } from './client';
import type { FulfillmentType, Order, OrderPreview, OrderStatus, Paginated } from '../types';

// Đơn của khách (docs/API.md mục 2.6). Giá không gửi lên — server tự tính (BR-31).

export interface OrderLineInput {
  menuItemId: string;
  variantId?: string;
  optionIds: string[];
  qty: number;
  note?: string;
}

export interface PlaceOrderInput {
  restaurantId: string;
  items: OrderLineInput[];
  fulfillmentType: FulfillmentType;
  /** Địa chỉ trong sổ — hoặc gửi delivery */
  addressId?: string;
  delivery?: { receiverName?: string; phone?: string; addressLine?: string; note?: string };
  paymentMethod?: 'COD';
}

/** Khóa chống đặt trùng (BR-38); trình duyệt cũ không có randomUUID thì tự sinh */
export const newIdempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export const ordersApi = {
  /** Tính tiền, không lưu, không trừ kho */
  async preview(input: Pick<PlaceOrderInput, 'restaurantId' | 'items' | 'fulfillmentType'>) {
    const res = await client.post<ApiResponse<OrderPreview>>('/orders/preview', input);
    return res.data.data;
  },

  /** Gửi lại cùng key (vd mạng lỗi) trả về đúng đơn đã tạo, không tạo đơn mới */
  async place(input: PlaceOrderInput, idempotencyKey: string) {
    const res = await client.post<ApiResponse<Order>>('/orders', input, { headers: { 'Idempotency-Key': idempotencyKey } });
    return res.data.data;
  },

  async list(query: { status?: OrderStatus[]; page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<Paginated<Order>>>('/orders', {
      params: { ...query, status: query.status?.join(',') || undefined },
    });
    return res.data.data;
  },

  async get(id: string) {
    const res = await client.get<ApiResponse<Order>>(`/orders/${id}`);
    return res.data.data;
  },

  /** Chỉ khi đơn còn PLACED (quán chưa nhận) */
  async cancel(id: string, note?: string) {
    const res = await client.post<ApiResponse<Order>>(`/orders/${id}/cancel`, note ? { note } : {});
    return res.data.data;
  },
};
