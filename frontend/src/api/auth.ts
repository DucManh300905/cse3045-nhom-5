import client, { type ApiResponse } from './client';
import type { Role, User } from '../types';

export interface RegisterInput {
  fullName: string;
  email?: string;
  phone?: string;
  password: string;
  /** Mặc định CUSTOMER; không tự đăng ký ADMIN được */
  role?: Exclude<Role, 'ADMIN'>;
}

// Backend trả `id` ở mọi response (plugin toJSON) nên không cần chuẩn hóa _id nữa
export const authApi = {
  /** identifier là email hoặc số điện thoại */
  async login(identifier: string, password: string) {
    const res = await client.post<ApiResponse<{ token: string; user: User }>>('/auth/login', { identifier, password });
    return res.data.data;
  },

  async register(input: RegisterInput) {
    const res = await client.post<ApiResponse<User>>('/auth/register', { role: 'CUSTOMER', ...input });
    return res.data.data;
  },

  /** Trả token mới — token cũ hết hiệu lực ngay (BR-05) */
  async changePassword(currentPassword: string, newPassword: string) {
    const res = await client.put<ApiResponse<{ token: string }>>('/auth/change-password', { currentPassword, newPassword });
    return res.data.data.token;
  },
};
