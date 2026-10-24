import type { NotificationType, Role } from '../types';

/**
 * Số đỏ trên từng mục menu / tab = số thông báo CHƯA ĐỌC thuộc mục đó (chốt 21/10/2026).
 * Mở trang / tab nào thì thông báo của mục đó được đánh dấu đã đọc -> số mất. Chuông vẫn đếm tổng chưa đọc.
 *
 * Mỗi mục: key (dùng trong layout), path (trang của mục), types (loại thông báo thuộc mục),
 * end: chỉ khớp đúng path (trang gốc như /admin, /owner, /shipper).
 */
export interface BadgeGroup {
  key: string;
  path: string;
  end?: boolean;
  types: NotificationType[];
}

/** Các tab của Ví đối soát (admin) — số trên menu "Ví đối soát" = tổng các tab */
export const ADMIN_WALLET_TABS: Record<string, NotificationType[]> = {
  topups: ['TOPUP_REQUESTED'],
  payouts: ['PAYOUT_REQUESTED'],
  refunds: ['REFUND_REQUESTED'],
  payments: ['PAYMENT_UNMATCHED'],
};

export const BADGE_GROUPS: Partial<Record<Role, BadgeGroup[]>> = {
  ADMIN: [
    { key: 'restaurants', path: '/admin', end: true, types: ['RESTAURANT_SUBMITTED'] },
    { key: 'shippers', path: '/admin/shippers', types: ['SHIPPER_SUBMITTED'] },
    { key: 'dispatch', path: '/admin/dispatch', types: ['DELIVERY_FAILED', 'DELIVERY_STALE'] },
    { key: 'shifts', path: '/admin/shifts', types: ['SHIFT_UNFILLED'] },
    // Trang ví: đánh dấu đã đọc theo tab đang mở (AdminWalletsPage), không theo cả trang
    { key: 'wallets', path: '/admin/wallets', types: Object.values(ADMIN_WALLET_TABS).flat() },
  ],
  RESTAURANT_OWNER: [
    { key: 'profile', path: '/owner', end: true, types: ['RESTAURANT_APPROVED', 'RESTAURANT_REJECTED', 'RESTAURANT_BLOCKED', 'RESTAURANT_UNBLOCKED'] },
    { key: 'orders', path: '/owner/orders', types: ['ORDER_NEW', 'ORDER_STATUS', 'DELIVERY_ASSIGNED', 'DELIVERY_NO_SHIPPER', 'DELIVERY_FAILED'] },
    { key: 'reviews', path: '/owner/reviews', types: ['REVIEW_NEW'] },
    { key: 'schedule', path: '/owner/schedule', types: ['SHIFT_PLAN_REQUEST', 'SHIFT_REPORT', 'SHIFT_UNFILLED'] },
    { key: 'wallet', path: '/owner/wallet', types: ['WALLET_NEGATIVE', 'WALLET_LOCKED', 'WALLET_UNLOCKED', 'TOPUP_CONFIRMED', 'TOPUP_REJECTED', 'PAYOUT_PAID', 'PAYOUT_REJECTED'] },
  ],
  SHIPPER: [
    { key: 'work', path: '/shipper', end: true, types: ['DELIVERY_ASSIGNED', 'DELIVERY_CANCELLED'] },
    { key: 'shifts', path: '/shipper/shifts', types: ['SHIFT_LIST', 'SHIFT_REMINDER', 'SHIFT_CANCELLED', 'PENALTY'] },
    { key: 'earnings', path: '/shipper/earnings', types: ['SHIPPER_EARNING', 'PAYOUT_PAID', 'PAYOUT_REJECTED'] },
    { key: 'profile', path: '/shipper/profile', types: ['SHIPPER_APPROVED', 'SHIPPER_REJECTED', 'SHIPPER_BLOCKED', 'SHIPPER_UNBLOCKED'] },
  ],
  CUSTOMER: [
    { key: 'orders', path: '/orders', types: ['ORDER_STATUS', 'PAYMENT_ISSUE', 'REFUND_DONE', 'DELIVERY_ASSIGNED', 'DELIVERY_FAILED'] },
  ],
};

export const groupOf = (role: Role | undefined, key: string) => (role ? BADGE_GROUPS[role]?.find(g => g.key === key) : undefined);

/** Mục menu ứng với trang đang mở (ưu tiên đường dẫn dài nhất) */
export const groupForPath = (role: Role | undefined, pathname: string) =>
  (role ? BADGE_GROUPS[role] ?? [] : [])
    .filter(g => (g.end ? pathname === g.path : pathname === g.path || pathname.startsWith(`${g.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];
