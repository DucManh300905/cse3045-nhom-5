import client, { type ApiResponse } from './client';
import type {
  AdminWallet,
  BankPayment,
  BankPaymentStatus,
  Refund,
  BankAccount,
  MerchantWallet,
  Paginated,
  Payout,
  PayoutStatus,
  Topup,
  TopupStatus,
  WalletEntry,
  WalletOverview,
} from '../types';

// Ví đối soát (API-11). Ví quán: + MAK nợ quán (rút được), − quán nợ hoa hồng đơn COD (nạp để trả).

const clean = (params: object) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));

interface PageQuery { page?: number; limit?: number }

export const walletApi = {
  // ---------- Chủ quán ----------

  async get() {
    const res = await client.get<ApiResponse<MerchantWallet>>('/merchant/wallet');
    return res.data.data;
  },

  async entries(query: PageQuery = {}) {
    const res = await client.get<ApiResponse<Paginated<WalletEntry>>>('/merchant/wallet/entries', { params: clean(query) });
    return res.data.data;
  },

  async saveBankAccount(body: BankAccount) {
    const res = await client.put<ApiResponse<BankAccount>>('/merchant/wallet/bank-account', body);
    return res.data.data;
  },

  /** Tạo lệnh nạp: trả mã chuyển khoản + ảnh VietQR (lệnh đang chờ cũ bị hủy) */
  async createTopup(amount: number) {
    const res = await client.post<ApiResponse<Topup>>('/merchant/wallet/topups', { amount });
    return res.data.data;
  },

  async cancelTopup(id: string) {
    const res = await client.post<ApiResponse<Topup>>(`/merchant/wallet/topups/${id}/cancel`, {});
    return res.data.data;
  },

  async requestPayout(amount: number) {
    const res = await client.post<ApiResponse<Payout>>('/merchant/wallet/payouts', { amount });
    return res.data.data;
  },

  // ---------- Admin ----------

  async overview() {
    const res = await client.get<ApiResponse<WalletOverview>>('/admin/wallets/overview');
    return res.data.data;
  },

  async listWallets(query: { status?: 'negative' | 'positive' | 'locked'; q?: string } & PageQuery = {}) {
    const res = await client.get<ApiResponse<Paginated<AdminWallet>>>('/admin/wallets', { params: clean(query) });
    return res.data.data;
  },

  async restaurantEntries(restaurantId: string, query: PageQuery = {}) {
    const res = await client.get<ApiResponse<Paginated<WalletEntry>>>(`/admin/wallets/${restaurantId}/entries`, { params: clean(query) });
    return res.data.data;
  },

  /** amount có dấu: + cộng ví quán, − trừ ví quán. Bắt buộc lý do (ghi audit log) */
  async adjust(restaurantId: string, amount: number, reason: string) {
    const res = await client.post<ApiResponse<{ balance: number }>>(`/admin/wallets/${restaurantId}/adjustments`, { amount, reason });
    return res.data.data;
  },

  async listTopups(query: { status?: TopupStatus; q?: string } & PageQuery = {}) {
    const res = await client.get<ApiResponse<Paginated<Topup>>>('/admin/topups', { params: clean(query) });
    return res.data.data;
  },

  async confirmTopup(id: string, body: { receivedAmount?: number; bankRef?: string }) {
    const res = await client.post<ApiResponse<Topup>>(`/admin/topups/${id}/confirm`, clean(body));
    return res.data.data;
  },

  async rejectTopup(id: string, reason: string) {
    const res = await client.post<ApiResponse<Topup>>(`/admin/topups/${id}/reject`, { reason });
    return res.data.data;
  },

  async listPayouts(query: { status?: PayoutStatus; q?: string } & PageQuery = {}) {
    const res = await client.get<ApiResponse<Paginated<Payout>>>('/admin/payouts', { params: clean(query) });
    return res.data.data;
  },

  async markPayoutPaid(id: string, bankRef?: string) {
    const res = await client.post<ApiResponse<Payout>>(`/admin/payouts/${id}/paid`, clean({ bankRef }));
    return res.data.data;
  },

  async rejectPayout(id: string, reason: string) {
    const res = await client.post<ApiResponse<Payout>>(`/admin/payouts/${id}/reject`, { reason });
    return res.data.data;
  },

  // ---------- Admin: trả trước (W2) ----------

  async listRefunds(query: { status?: 'PENDING' | 'DONE' } & PageQuery = {}) {
    const res = await client.get<ApiResponse<Paginated<Refund>>>('/admin/refunds', { params: clean(query) });
    return res.data.data;
  },

  /** Admin đã chuyển khoản trả khách */
  async completeRefund(id: string, bankRef?: string) {
    const res = await client.post<ApiResponse<Refund>>(`/admin/refunds/${id}/done`, clean({ bankRef }));
    return res.data.data;
  },

  async listPayments(query: { status?: BankPaymentStatus } & PageQuery = {}) {
    const res = await client.get<ApiResponse<Paginated<BankPayment>>>('/admin/payments', { params: clean(query) });
    return res.data.data;
  },

  /** Giao dịch không khớp mã: hoàn lại cho người chuyển hoặc bỏ qua (không phải tiền khách MAK) */
  async resolvePayment(id: string, action: 'refund' | 'ignore', note: string) {
    const res = await client.post<ApiResponse<{ payment: BankPayment; refund: Refund | null }>>(`/admin/payments/${id}/resolve`, { action, note });
    return res.data.data;
  },
};
