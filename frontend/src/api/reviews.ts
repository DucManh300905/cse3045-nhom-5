import client, { type ApiResponse } from './client';
import type { AdminReview, Paginated, Review, ReviewSummary } from '../types';

// Đánh giá quán (API-8): 1–5 sao, mỗi khách 1 đánh giá / quán, phải có đơn hoàn thành mới viết được

type ReviewPage = Paginated<Review> & { summary: ReviewSummary };

const clean = (params: object) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));

export const reviewsApi = {
  // ---------- Công khai / khách ----------

  /** Đánh giá đang hiện của quán + phân bố số sao */
  async list(idOrSlug: string, query: { rating?: number; page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<ReviewPage>>(`/restaurants/${idOrSlug}/reviews`, { params: clean(query) });
    return res.data.data;
  },

  /** Đánh giá của tôi + tôi có được đánh giá không (đã có đơn hoàn thành) */
  async getMine(idOrSlug: string) {
    const res = await client.get<ApiResponse<{ canReview: boolean; review: Review | null }>>(`/restaurants/${idOrSlug}/reviews/me`);
    return res.data.data;
  },

  /** Viết mới hoặc sửa */
  async saveMine(idOrSlug: string, input: { rating: number; comment?: string }) {
    const res = await client.put<ApiResponse<Review>>(`/restaurants/${idOrSlug}/reviews/me`, input);
    return res.data.data;
  },

  async deleteMine(idOrSlug: string) {
    await client.delete(`/restaurants/${idOrSlug}/reviews/me`);
  },

  // ---------- Chủ quán ----------

  async listMerchant(query: { rating?: number; replied?: boolean; page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<ReviewPage>>('/merchant/reviews', {
      params: clean({ ...query, replied: query.replied === undefined ? undefined : String(query.replied) }),
    });
    return res.data.data;
  },

  async reply(id: string, content: string) {
    const res = await client.put<ApiResponse<Review>>(`/merchant/reviews/${id}/reply`, { content });
    return res.data.data;
  },

  // ---------- Admin ----------

  async listAdmin(query: { hidden?: boolean; q?: string; page?: number; limit?: number } = {}) {
    const res = await client.get<ApiResponse<Paginated<AdminReview>>>('/admin/reviews', {
      params: clean({ ...query, hidden: query.hidden === undefined ? undefined : String(query.hidden) }),
    });
    return res.data.data;
  },

  async setHidden(id: string, hidden: boolean, reason?: string) {
    const res = await client.patch<ApiResponse<Review>>(`/admin/reviews/${id}/hide`, { hidden, reason });
    return res.data.data;
  },
};
