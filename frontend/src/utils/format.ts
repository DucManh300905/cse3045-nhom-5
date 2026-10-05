const vnd = new Intl.NumberFormat('vi-VN');

/** 20000 -> "20.000 đ" */
export const formatPrice = (n: number) => `${vnd.format(n)} đ`;

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Số di động Việt Nam: 10 chữ số, bắt đầu bằng 0 */
export const PHONE_REGEX = /^0\d{9}$/;

/** Bỏ dấu tiếng Việt để tìm kiếm "com ga" vẫn ra "Cơm gà" */
export const normalizeText = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
