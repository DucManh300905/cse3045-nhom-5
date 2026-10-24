import client, { type ApiResponse } from './client';
import type { ManagedVoucher, Paginated, PublicVoucher, VoucherFundedBy, VoucherInput, VoucherUsage } from '../types';

// Voucher (docs/API.md mục 2.12): voucher MAK (admin tạo, nền tảng chịu) + voucher quán (chủ quán tạo, quán chịu)

const clean = (params: object) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));

export interface VoucherListQuery {
  status?: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  fundedBy?: VoucherFundedBy;
  q?: string;
  page?: number;
  limit?: number;
}

/** Bộ API quản lý dùng chung cho trang chủ quán và trang admin */
export interface VoucherManagerApi {
  list(query?: VoucherListQuery): Promise<Paginated<ManagedVoucher>>;
  create(input: VoucherInput): Promise<ManagedVoucher>;
  update(id: string, input: VoucherInput): Promise<ManagedVoucher>;
  remove(id: string): Promise<unknown>;
  usage(id: string): Promise<Paginated<VoucherUsage> & { summary: { uses: number; totalDiscount: number } }>;
}

const managerApi = (base: string): VoucherManagerApi => ({
  async list(query = {}) {
    const res = await client.get<ApiResponse<Paginated<ManagedVoucher>>>(base, { params: clean(query) });
    return res.data.data;
  },
  async create(input) {
    const res = await client.post<ApiResponse<ManagedVoucher>>(base, input);
    return res.data.data;
  },
  async update(id, input) {
    const res = await client.patch<ApiResponse<ManagedVoucher>>(`${base}/${id}`, input);
    return res.data.data;
  },
  async remove(id) {
    const res = await client.delete<ApiResponse<unknown>>(`${base}/${id}`);
    return res.data.data;
  },
  async usage(id) {
    const res = await client.get<ApiResponse<Paginated<VoucherUsage> & { summary: { uses: number; totalDiscount: number } }>>(`${base}/${id}/usage`, { params: { limit: 50 } });
    return res.data.data;
  },
});

export const vouchersApi = {
  /** Khách: voucher còn dùng được ở quán */
  async available(restaurantId: string) {
    const res = await client.get<ApiResponse<PublicVoucher[]>>('/vouchers/available', { params: { restaurantId } });
    return res.data.data;
  },
  merchant: managerApi('/merchant/vouchers'),
  admin: managerApi('/admin/vouchers'),
};
