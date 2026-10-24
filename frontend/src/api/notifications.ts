import client, { type ApiResponse } from './client';
import type { AppNotification, NotificationType, Paginated } from '../types';

// Thông báo trong app — mọi vai trò, chỉ thấy của chính mình (docs/API.md mục 2.8)

export const notificationsApi = {
  /** Mới nhất trước, kèm unreadCount cho huy hiệu chuông */
  async list(query: { unread?: boolean; page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<Paginated<AppNotification> & { unreadCount: number }>>('/notifications', {
      params: { ...query, unread: query.unread ? 'true' : undefined },
    });
    return res.data.data;
  },

  async markRead(id: string) {
    const res = await client.patch<ApiResponse<AppNotification>>(`/notifications/${id}/read`, {});
    return res.data.data;
  },

  /** Số chưa đọc theo loại — số đỏ trên menu / tab */
  async unreadCounts() {
    const res = await client.get<ApiResponse<{ total: number; byType: Partial<Record<NotificationType, number>> }>>('/notifications/unread-counts');
    return res.data.data;
  },

  /** Mở trang / tab nào thì đánh dấu đã đọc thông báo của mục đó */
  async markTypesRead(types: NotificationType[]) {
    const res = await client.patch<ApiResponse<{ modifiedCount: number }>>('/notifications/read-types', { types });
    return res.data.data;
  },

  async markAllRead() {
    const res = await client.patch<ApiResponse<{ modifiedCount: number }>>('/notifications/read-all', {});
    return res.data.data;
  },
};
