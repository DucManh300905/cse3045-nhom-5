import client, { type ApiResponse } from './client';
import type { AdminShiftView, MerchantSchedule, PenaltySummary, ShipperShiftList, TimeWindow, WeeklyWindow } from '../types';

// Đăng ký ca tài xế (Đặc tả Đăng ký ca tài xế — bản chốt, giai đoạn A)

export const scheduleApi = {
  // ---------- Chủ quán ----------

  async get() {
    const res = await client.get<ApiResponse<MerchantSchedule>>('/merchant/schedule');
    return res.data.data;
  },

  async saveWeekly(weeklySchedule: WeeklyWindow[]) {
    const res = await client.put<ApiResponse<MerchantSchedule>>('/merchant/schedule/weekly', { weeklySchedule });
    return res.data.data;
  },

  /** Trước mốc chốt: sửa tự do; sau mốc chốt: chỉ bỏ khung */
  async saveDay(date: string, windows: TimeWindow[]) {
    const res = await client.put<ApiResponse<MerchantSchedule>>(`/merchant/schedule/days/${date}`, { windows });
    return res.data.data;
  },
};

export const shiftApi = {
  // ---------- Tài xế ----------

  async list() {
    const res = await client.get<ApiResponse<ShipperShiftList>>('/shipper/shifts');
    return res.data.data;
  },

  async register(id: string) {
    const res = await client.post<ApiResponse<ShipperShiftList>>(`/shipper/shifts/${id}/register`);
    return res.data.data;
  },

  async cancel(id: string) {
    const res = await client.post<ApiResponse<ShipperShiftList & { late: boolean }>>(`/shipper/shifts/${id}/cancel`);
    return res.data.data;
  },

  async penalties() {
    const res = await client.get<ApiResponse<PenaltySummary>>('/shipper/penalties');
    return res.data.data;
  },

  /** Tài khoản tài xế cũ chưa có email: lấy vé qua /auth/otp/send + /auth/otp/verify rồi gửi vào đây */
  async setEmail(email: string, verificationToken: string) {
    const res = await client.post<ApiResponse<{ email: string; emailVerified: boolean }>>('/shipper/email', { email, verificationToken });
    return res.data.data;
  },

  // ---------- Admin ----------

  async adminShifts(date?: string) {
    const res = await client.get<ApiResponse<{ date: string; shifts: AdminShiftView[] }>>('/admin/shifts', { params: date ? { date } : {} });
    return res.data.data;
  },

  async adminPenalties(shipperId: string) {
    const res = await client.get<ApiResponse<PenaltySummary>>(`/admin/shippers/${shipperId}/penalties`);
    return res.data.data;
  },

  async adminUnlock(shipperId: string, reason?: string) {
    const res = await client.post<ApiResponse<PenaltySummary>>(`/admin/shippers/${shipperId}/unlock`, reason ? { reason } : {});
    return res.data.data;
  },
};
