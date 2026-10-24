import { getErrorCode, getErrorDetail, getErrorMessage } from '../api/client';
import type { PaymentMethod, PublicVoucher, VoucherFundedBy } from '../types';
import { formatPrice } from './format';

export const FUNDED_LABEL: Record<VoucherFundedBy, string> = {
  PLATFORM: 'Voucher MAK',
  RESTAURANT: 'Voucher quán',
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  COD: 'tiền mặt',
  BANK_TRANSFER: 'chuyển khoản',
};

/** Thiếu trường (voucher cũ) = áp dụng mọi phương thức */
export const voucherMethods = (v: { paymentMethods?: PaymentMethod[] }): PaymentMethod[] =>
  v.paymentMethods?.length ? v.paymentMethods : ['COD', 'BANK_TRANSFER'];

/** "Giảm 10% tối đa 15.000 đ · đơn từ 50.000 đ · chỉ khi chuyển khoản" */
export const describeVoucher = (v: Pick<PublicVoucher, 'type' | 'value' | 'maxDiscount' | 'minOrderAmount'> & { paymentMethods?: PaymentMethod[] }) => {
  const parts = [
    v.type === 'PERCENT'
      ? `Giảm ${v.value}%${v.maxDiscount ? ` tối đa ${formatPrice(v.maxDiscount)}` : ''}`
      : `Giảm ${formatPrice(v.value)}`,
  ];
  if (v.minOrderAmount > 0) parts.push(`đơn từ ${formatPrice(v.minOrderAmount)}`);
  const methods = voucherMethods(v);
  if (methods.length === 1) parts.push(`chỉ khi trả ${PAYMENT_LABEL[methods[0]]}`);
  return parts.join(' · ');
};

const REASON_TEXT: Record<string, string> = {
  NOT_FOUND: 'Mã giảm giá không tồn tại.',
  INACTIVE: 'Mã giảm giá đang tạm ngưng.',
  NOT_STARTED: 'Mã giảm giá chưa tới thời gian sử dụng.',
  EXPIRED: 'Mã giảm giá đã hết hạn.',
  WRONG_RESTAURANT: 'Mã giảm giá không áp dụng cho quán này.',
};

/** Lỗi voucher -> câu tiếng Việt có lý do cụ thể */
export const voucherErrorMessage = (err: unknown) => {
  const detail = getErrorDetail(err);
  const reason = detail?.reason as string | undefined;
  if (getErrorCode(err) === 'VOUCHER_INVALID' && reason === 'WRONG_PAYMENT_METHOD') {
    const methods = (detail?.paymentMethods as PaymentMethod[] | undefined) ?? [];
    return `Mã này chỉ áp dụng khi thanh toán bằng ${methods.map(m => PAYMENT_LABEL[m]).join(' hoặc ') || 'phương thức khác'}.`;
  }
  if (getErrorCode(err) === 'VOUCHER_INVALID' && reason === 'BELOW_MIN_ORDER') {
    return `Đơn chưa đạt tối thiểu ${formatPrice(Number(detail?.minOrderAmount ?? 0))} để dùng mã này.`;
  }
  return (reason && REASON_TEXT[reason]) || getErrorMessage(err);
};

export const isVoucherError = (err: unknown) => (getErrorCode(err) ?? '').startsWith('VOUCHER_');
