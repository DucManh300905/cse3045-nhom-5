import client, { type ApiResponse } from './client';
import type { AdminRestaurant, AuditLog, DocumentType, Paginated, RestaurantStatus } from '../types';

// Quản trị viên: duyệt / từ chối / khóa quán, hoa hồng, nhật ký (docs/API.md mục 2.7)

export const adminApi = {
  /** status mặc định SUBMITTED (nộp trước xếp trước), ALL = tất cả */
  async listRestaurants(query: { status?: RestaurantStatus | 'ALL'; q?: string; page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<Paginated<AdminRestaurant>>>('/admin/restaurants', {
      params: Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== '')),
    });
    return res.data.data;
  },

  async getRestaurant(id: string) {
    const res = await client.get<ApiResponse<AdminRestaurant>>(`/admin/restaurants/${id}`);
    return res.data.data;
  },

  /** File giấy tờ là private (cần token) nên tải về dạng blob rồi mở */
  async getDocument(id: string, type: DocumentType) {
    const res = await client.get<Blob>(`/admin/restaurants/${id}/documents/${type}`, { responseType: 'blob' });
    return res.data;
  },

  async approve(id: string) {
    const res = await client.post<ApiResponse<AdminRestaurant>>(`/admin/restaurants/${id}/approve`);
    return res.data.data;
  },

  /** reason bắt buộc */
  async reject(id: string, reason: string) {
    const res = await client.post<ApiResponse<AdminRestaurant>>(`/admin/restaurants/${id}/reject`, { reason });
    return res.data.data;
  },

  async block(id: string, reason?: string) {
    const res = await client.post<ApiResponse<AdminRestaurant>>(`/admin/restaurants/${id}/block`, reason ? { reason } : {});
    return res.data.data;
  },

  async unblock(id: string) {
    // Luôn gửi body: không có body thì req.body undefined (Express 5) và backend đọc req.body.reason bị lỗi 500
    const res = await client.post<ApiResponse<AdminRestaurant>>(`/admin/restaurants/${id}/unblock`, {});
    return res.data.data;
  },

  /** 0–1, vd 0.1 = 10% */
  async setCommission(id: string, commissionRate: number) {
    const res = await client.patch<ApiResponse<AdminRestaurant>>(`/admin/restaurants/${id}/commission`, { commissionRate });
    return res.data.data;
  },

  async listAuditLogs(query: { action?: string; targetId?: string; page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<Paginated<AuditLog>>>('/admin/audit-logs', {
      params: Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== '')),
    });
    return res.data.data;
  },
};
