import client, { type ApiResponse } from './client';
import type { Address, User } from '../types';

export interface ProfileInput {
  fullName?: string;
  /** "" = xóa số điện thoại */
  phone?: string;
}

export interface AddressInput {
  label?: string;
  receiverName: string;
  phone: string;
  addressLine: string;
  isDefault?: boolean;
}

export const usersApi = {
  async getMe() {
    const res = await client.get<ApiResponse<User>>('/users/me');
    return res.data.data;
  },

  async updateMe(input: ProfileInput) {
    const res = await client.put<ApiResponse<User>>('/users/me', input);
    return res.data.data;
  },

  // Sổ địa chỉ — tối đa 5, luôn có 1 mặc định (BR-06)
  async listAddresses() {
    const res = await client.get<ApiResponse<Address[]>>('/users/me/addresses');
    return res.data.data;
  },

  async createAddress(input: AddressInput) {
    const res = await client.post<ApiResponse<Address>>('/users/me/addresses', input);
    return res.data.data;
  },

  async updateAddress(id: string, input: Partial<AddressInput>) {
    const res = await client.put<ApiResponse<Address>>(`/users/me/addresses/${id}`, input);
    return res.data.data;
  },

  /** Trả danh sách còn lại */
  async deleteAddress(id: string) {
    const res = await client.delete<ApiResponse<Address[]>>(`/users/me/addresses/${id}`);
    return res.data.data;
  },
};
