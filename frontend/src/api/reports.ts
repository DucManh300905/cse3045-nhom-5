import client, { type ApiResponse } from './client';
import type {
  AdminOrder,
  AdminSummary,
  AdminUser,
  GroupBy,
  MerchantSummary,
  OrderStatus,
  Paginated,
  ReportRange,
  RevenuePoint,
  Role,
  TopItem,
} from '../types';

// Báo cáo + quản trị người dùng / đơn (API-9). Khoảng ngày theo giờ VN, mặc định 30 ngày gần nhất.

export interface RangeQuery {
  from?: string;
  to?: string;
}

const clean = (params: object) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));

export const reportsApi = {
  // ---------- Chủ quán ----------

  async merchantSummary(range: RangeQuery) {
    const res = await client.get<ApiResponse<MerchantSummary>>('/merchant/reports/summary', { params: clean(range) });
    return res.data.data;
  },

  async merchantRevenue(range: RangeQuery, groupBy: GroupBy = 'day') {
    const res = await client.get<ApiResponse<{ range: ReportRange; groupBy: GroupBy; series: RevenuePoint[] }>>(
      '/merchant/reports/revenue',
      { params: clean({ ...range, groupBy }) }
    );
    return res.data.data;
  },

  async merchantTopItems(range: RangeQuery, limit = 10) {
    const res = await client.get<ApiResponse<{ range: ReportRange; items: TopItem[] }>>('/merchant/reports/top-items', {
      params: clean({ ...range, limit }),
    });
    return res.data.data.items;
  },

  // ---------- Admin ----------

  async adminSummary(range: RangeQuery, groupBy: GroupBy = 'day') {
    const res = await client.get<ApiResponse<AdminSummary>>('/admin/reports/summary', { params: clean({ ...range, groupBy }) });
    return res.data.data;
  },

  async listUsers(query: { role?: Role; status?: 'ACTIVE' | 'BLOCKED'; q?: string; page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<Paginated<AdminUser>>>('/admin/users', { params: clean(query) });
    return res.data.data;
  },

  /** Không khóa được admin; khóa chủ quán -> quán tắt nhận đơn */
  async setUserBlocked(id: string, blocked: boolean, reason?: string) {
    const res = await client.post<ApiResponse<AdminUser>>(`/admin/users/${id}/${blocked ? 'block' : 'unblock'}`, reason ? { reason } : {});
    return res.data.data;
  },

  async listOrders(query: { status?: OrderStatus[]; restaurant?: string; q?: string; from?: string; to?: string; page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<Paginated<AdminOrder>>>('/admin/orders', {
      params: clean({ ...query, status: query.status?.join(',') }),
    });
    return res.data.data;
  },
};
