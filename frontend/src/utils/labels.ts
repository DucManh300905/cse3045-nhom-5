import type { DocumentType, RestaurantStatus } from '../types';

export const STATUS_LABEL: Record<RestaurantStatus, string> = {
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
  BLOCKED: 'Bị khóa',
};

export const DOCUMENTS: { type: DocumentType; label: string; required: boolean }[] = [
  { type: 'BUSINESS_LICENSE', label: 'Giấy phép kinh doanh', required: true },
  { type: 'ID_CARD', label: 'CCCD của chủ quán', required: true },
  { type: 'FOOD_SAFETY', label: 'Giấy chứng nhận ATTP', required: false },
];

export const DAY_NAMES = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

/** Hành động ghi trong auditlogs (backend: recordAudit) */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  RESTAURANT_APPROVE: 'Duyệt quán',
  RESTAURANT_REJECT: 'Từ chối hồ sơ',
  RESTAURANT_BLOCK: 'Khóa quán',
  RESTAURANT_UNBLOCK: 'Mở khóa quán',
  RESTAURANT_COMMISSION_CHANGE: 'Đổi hoa hồng',
  MENU_PRICE_CHANGE: 'Đổi giá món',
  REVIEW_HIDE: 'Ẩn đánh giá',
  REVIEW_UNHIDE: 'Hiện lại đánh giá',
  USER_BLOCK: 'Khóa tài khoản',
  USER_UNBLOCK: 'Mở khóa tài khoản',
  TOPUP_CONFIRM: 'Xác nhận nạp tiền',
  TOPUP_REJECT: 'Từ chối nạp tiền',
  PAYOUT_PAID: 'Đã chuyển tiền cho quán',
  PAYOUT_REJECT: 'Từ chối rút tiền',
  WALLET_ADJUST: 'Điều chỉnh ví quán',
  REFUND_DONE: 'Đã hoàn tiền cho khách',
  PAYMENT_REFUND: 'Hoàn giao dịch không khớp',
  PAYMENT_IGNORE: 'Bỏ qua giao dịch không khớp',
  VOUCHER_CREATE: 'Tạo voucher',
  VOUCHER_UPDATE: 'Sửa voucher',
  VOUCHER_DELETE: 'Xóa voucher',
};

/** Trạng thái thanh toán của đơn trả trước */
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Chưa thanh toán',
  PAID: 'Đã thanh toán',
  REFUND_PENDING: 'Chờ hoàn tiền',
  REFUNDED: 'Đã hoàn tiền',
};

export const REFUND_REASON_LABEL: Record<string, string> = {
  ORDER_CANCELLED: 'Đơn đã trả bị hủy',
  LATE_PAYMENT: 'Chuyển sau khi đơn hết hạn',
  UNDERPAID: 'Chuyển thiếu',
  OVERPAID: 'Chuyển thừa',
  DUPLICATE: 'Chuyển trùng',
  UNMATCHED: 'Giao dịch không khớp',
};

export const BANK_PAYMENT_STATUS_LABEL: Record<string, string> = {
  PROCESSING: 'Đang xử lý',
  MATCHED_ORDER: 'Khớp đơn',
  MATCHED_TOPUP: 'Khớp lệnh nạp',
  LATE: 'Muộn → hoàn',
  UNDERPAID: 'Thiếu → hoàn',
  DUPLICATE: 'Trùng → hoàn',
  UNMATCHED: 'Chưa khớp',
  REFUNDING: 'Đã tạo lệnh hoàn',
  IGNORED: 'Bỏ qua',
};

/** Loại dòng sổ ví (API-11) */
export const WALLET_ENTRY_LABEL: Record<string, string> = {
  ORDER_SETTLE: 'Đơn hoàn thành',
  TOPUP: 'Nạp tiền',
  PAYOUT_REQUEST: 'Yêu cầu rút',
  PAYOUT_PAID: 'Đã chuyển khoản',
  PAYOUT_REJECT: 'Hoàn lại (rút bị từ chối)',
  ADJUSTMENT: 'Điều chỉnh',
  ORDER_PAYMENT: 'Khách chuyển khoản',
  REFUND_PENDING: 'Chờ hoàn tiền',
  REFUND_PAID: 'Đã hoàn tiền',
  SHIPPER_FEE: 'Tiền công giao đơn',
  SHIPPER_COMPENSATION: 'MAK bù chuyến bị hủy',
};

export const WALLET_LOCK_LABEL: Record<string, string> = {
  OVER_LIMIT: 'Ví âm vượt hạn mức',
  OVERDUE: 'Ví âm quá hạn nạp',
};

export const TOPUP_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã nhận',
  REJECTED: 'Bị từ chối',
  CANCELLED: 'Đã hủy',
};

export const PAYOUT_STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Chờ chuyển',
  PAID: 'Đã chuyển',
  REJECTED: 'Bị từ chối',
};

/** {status: 'SUBMITTED'} -> {status: 'APPROVED'} thành chuỗi ngắn gọn để hiển thị */
export function describeChange(before?: Record<string, unknown>, after?: Record<string, unknown>) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const show = (k: string, v: unknown) => {
    if (v === undefined || v === null) return '—';
    if (k === 'status' && typeof v === 'string' && v in STATUS_LABEL) return STATUS_LABEL[v as RestaurantStatus];
    if (k === 'commissionRate' && typeof v === 'number') return `${Math.round(v * 1000) / 10}%`;
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  };
  return keys
    .filter(k => k !== 'variants' && k !== 'optionGroups')
    .map(k => `${show(k, before?.[k])} → ${show(k, after?.[k])}`)
    .join(', ');
}
