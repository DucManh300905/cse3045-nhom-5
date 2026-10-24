import client, { type ApiResponse } from './client';
import type { Role, User } from '../types';

export interface RegisterInput {
  fullName: string;
  email?: string;
  phone?: string;
  password: string;
  /** Mặc định CUSTOMER; không tự đăng ký ADMIN được */
  role?: Exclude<Role, 'ADMIN'>;
  /** Bắt buộc khi đăng ký bằng email: lấy từ verifyOtp */
  verificationToken?: string;
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

  /** Gửi mã OTP 6 số tới email (hết hạn 5 phút, gửi lại sau 60 giây) */
  async sendOtp(email: string) {
    const res = await client.post<ApiResponse<{ expiresInSeconds: number; resendInSeconds: number }>>('/auth/otp/send', { email });
    return res.data.data;
  },

  /** Đúng mã -> verificationToken (15 phút) để gửi kèm khi đăng ký */
  async verifyOtp(email: string, code: string) {
    const res = await client.post<ApiResponse<{ verificationToken: string }>>('/auth/otp/verify', { email, code });
    return res.data.data.verificationToken;
  },

  /** Quên mật khẩu: gửi mã 6 số về email (luôn trả thành công, không lộ email nào đã đăng ký) */
  async forgotPassword(email: string) {
    const res = await client.post<ApiResponse<{ expiresInSeconds: number; resendInSeconds: number }>>('/auth/password/forgot', { email });
    return res.data.data;
  },

  /** Nhập mã + mật khẩu mới; mọi phiên đăng nhập cũ hết hiệu lực */
  async resetPassword(email: string, code: string, newPassword: string) {
    await client.post('/auth/password/reset', { email, code, newPassword });
  },

  /** Trả token mới — token cũ hết hiệu lực ngay (BR-05) */
  async changePassword(currentPassword: string, newPassword: string) {
    const res = await client.put<ApiResponse<{ token: string }>>('/auth/change-password', { currentPassword, newPassword });
    return res.data.data.token;
  },
};
