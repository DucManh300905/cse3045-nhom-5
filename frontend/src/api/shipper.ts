import client, { type ApiResponse } from './client';
import type {
  AdminShipper,
  BankAccount,
  DispatchItem,
  OnlineShipper,
  Order,
  OrderTracking,
  Paginated,
  Payout,
  ShipperDocumentType,
  ShipperOrder,
  ShipperProfile,
  ShipperState,
  ShipperStatus,
  ShipperWallet,
  VehicleType,
  WalletEntry,
} from '../types';

// Tài xế MAK (Kế hoạch triển khai Tài xế, chốt 21/10/2026)

export interface ShipperProfileInput {
  fullName: string;
  phone: string;
  idNumber?: string;
  vehicleType: VehicleType;
  licensePlate?: string;
}

const clean = (params: object) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));

/** Ảnh / giấy tờ: field + file, kèm các trường chữ */
const form = (field: string, file: Blob, extra: Record<string, string> = {}) => {
  const f = new FormData();
  Object.entries(extra).forEach(([k, v]) => f.append(k, v));
  f.append(field, file, file instanceof File ? file.name : 'photo.jpg');
  return f;
};
const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

export const shipperApi = {
  // ---------- Hồ sơ ----------

  /** null = chưa tạo hồ sơ */
  async getProfile() {
    try {
      const res = await client.get<ApiResponse<ShipperProfile>>('/shipper/profile');
      return res.data.data;
    } catch (err) {
      if ((err as { response?: { status?: number } }).response?.status === 404) return null;
      throw err;
    }
  },

  async createProfile(input: ShipperProfileInput) {
    const res = await client.post<ApiResponse<ShipperProfile>>('/shipper/profile', input);
    return res.data.data;
  },

  async updateProfile(input: Partial<ShipperProfileInput>) {
    const res = await client.put<ApiResponse<ShipperProfile>>('/shipper/profile', input);
    return res.data.data;
  },

  async uploadDocument(type: ShipperDocumentType, file: File) {
    const res = await client.post<ApiResponse<ShipperProfile>>('/shipper/profile/documents', form('file', file, { type }), multipart);
    return res.data.data;
  },

  async submit() {
    const res = await client.post<ApiResponse<ShipperProfile>>('/shipper/profile/submit');
    return res.data.data;
  },

  async saveBankAccount(body: BankAccount) {
    const res = await client.put<ApiResponse<BankAccount>>('/shipper/bank-account', body);
    return res.data.data;
  },

  // ---------- Làm việc ----------

  async state() {
    const res = await client.get<ApiResponse<ShipperState>>('/shipper/state');
    return res.data.data;
  },

  async online(at?: { lat: number; lng: number }) {
    const res = await client.post<ApiResponse<ShipperProfile>>('/shipper/online', at ?? {});
    return res.data.data;
  },

  async offline() {
    const res = await client.post<ApiResponse<ShipperProfile>>('/shipper/offline');
    return res.data.data;
  },

  async location(at: { lat: number; lng: number }) {
    const res = await client.post<ApiResponse<{ accepted: boolean; reason?: string }>>('/shipper/location', at);
    return res.data.data;
  },

  async accept(offerId: string) {
    const res = await client.post<ApiResponse<ShipperOrder>>(`/shipper/offers/${offerId}/accept`);
    return res.data.data;
  },

  async decline(offerId: string) {
    await client.post(`/shipper/offers/${offerId}/decline`);
  },

  async orders(query: { page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<Paginated<ShipperOrder>>>('/shipper/orders', { params: clean(query) });
    return res.data.data;
  },

  async arrived(orderId: string) {
    const res = await client.post<ApiResponse<ShipperOrder>>(`/shipper/orders/${orderId}/arrived`);
    return res.data.data;
  },

  async pickedUp(orderId: string) {
    const res = await client.post<ApiResponse<ShipperOrder>>(`/shipper/orders/${orderId}/picked-up`);
    return res.data.data;
  },

  /** Ảnh xác nhận giao (bắt buộc) */
  async delivered(orderId: string, photo: Blob) {
    const res = await client.post<ApiResponse<ShipperOrder>>(`/shipper/orders/${orderId}/delivered`, form('photo', photo), multipart);
    return res.data.data;
  },

  async failed(orderId: string, photo: Blob, reason: string) {
    const res = await client.post<ApiResponse<ShipperOrder>>(`/shipper/orders/${orderId}/failed`, form('photo', photo, { reason }), multipart);
    return res.data.data;
  },

  /** Hủy đơn đã nhận (chưa lấy hàng) */
  async withdraw(orderId: string, reason?: string) {
    const res = await client.post<ApiResponse<{ blocked: boolean }>>(`/shipper/orders/${orderId}/withdraw`, reason ? { reason } : {});
    return res.data.data;
  },

  // ---------- Thu nhập ----------

  async wallet() {
    const res = await client.get<ApiResponse<ShipperWallet>>('/shipper/wallet');
    return res.data.data;
  },

  async entries(query: { page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<Paginated<WalletEntry>>>('/shipper/wallet/entries', { params: clean(query) });
    return res.data.data;
  },

  async payouts(query: { page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<Paginated<Payout>>>('/shipper/wallet/payouts', { params: clean(query) });
    return res.data.data;
  },

  async requestPayout(amount: number) {
    const res = await client.post<ApiResponse<Payout>>('/shipper/wallet/payouts', { amount });
    return res.data.data;
  },
};

/** Ảnh xác nhận giao là file private: tải bằng token rồi hiện (url dạng "/delivery/orders/:id/proof") */
export const fetchProof = async (url: string) => {
  const res = await client.get<Blob>(url, { responseType: 'blob' });
  return res.data;
};

export const trackingApi = {
  async customer(orderId: string) {
    const res = await client.get<ApiResponse<OrderTracking>>(`/orders/${orderId}/tracking`);
    return res.data.data;
  },

  async merchant(orderId: string) {
    const res = await client.get<ApiResponse<OrderTracking>>(`/merchant/orders/${orderId}/tracking`);
    return res.data.data;
  },

  async rate(orderId: string, stars: number, comment?: string) {
    const res = await client.post<ApiResponse<Order>>(`/orders/${orderId}/shipper-rating`, { stars, ...(comment && { comment }) });
    return res.data.data;
  },
};

export const adminShipperApi = {
  async list(query: { status?: ShipperStatus | 'ALL'; q?: string; page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<Paginated<AdminShipper>>>('/admin/shippers', { params: clean(query) });
    return res.data.data;
  },

  async get(id: string) {
    const res = await client.get<ApiResponse<AdminShipper>>(`/admin/shippers/${id}`);
    return res.data.data;
  },

  async document(id: string, type: ShipperDocumentType) {
    const res = await client.get<Blob>(`/admin/shippers/${id}/documents/${type}`, { responseType: 'blob' });
    return res.data;
  },

  async setStatus(id: string, action: 'approve' | 'reject' | 'block' | 'unblock', reason?: string) {
    const res = await client.post<ApiResponse<AdminShipper>>(`/admin/shippers/${id}/${action}`, reason ? { reason } : {});
    return res.data.data;
  },

  async online() {
    const res = await client.get<ApiResponse<OnlineShipper[]>>('/admin/shippers/online');
    return res.data.data;
  },

  async dispatch() {
    const res = await client.get<ApiResponse<DispatchItem[]>>('/admin/dispatch');
    return res.data.data;
  },

  async assign(orderId: string, shipperId: string) {
    await client.post(`/admin/orders/${orderId}/assign`, { shipperId });
  },

  async redispatch(orderId: string) {
    await client.post(`/admin/orders/${orderId}/redispatch`, {});
  },

  async resolve(orderId: string, action: 'COMPLETE' | 'CANCEL', note?: string) {
    await client.post(`/admin/orders/${orderId}/delivery/resolve`, { action, ...(note && { note }) });
  },
};
