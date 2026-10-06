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
