import client from './client';
import type { User } from '../types';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface RegisterInput {
  fullName: string;
  email?: string;
  phone?: string;
  password: string;
}

// /users/me trả về document Mongo (_id), còn login/register trả về id -> thống nhất thành id
type RawUser = Omit<User, 'id'> & { id?: string; _id?: string };
const normalizeUser = (u: RawUser): User => ({ ...u, id: (u.id ?? u._id) as string });

export const authApi = {
  /** identifier là email hoặc số điện thoại */
  async login(identifier: string, password: string) {
    const res = await client.post<ApiResponse<{ token: string; user: RawUser }>>('/auth/login', { identifier, password });
    return { token: res.data.data.token, user: normalizeUser(res.data.data.user) };
  },

  async register(input: RegisterInput) {
    const res = await client.post<ApiResponse<RawUser>>('/auth/register', { ...input, role: 'CUSTOMER' });
    return normalizeUser(res.data.data);
  },

  async getMe() {
    const res = await client.get<ApiResponse<RawUser>>('/users/me');
    return normalizeUser(res.data.data);
  },
};
