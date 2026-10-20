import type { OpeningHour } from '../types';
import { DAY_NAMES } from './labels';

// Giờ mở cửa luôn tính theo giờ Việt Nam (giống backend utils/openingHours.js), dù máy người xem ở múi giờ nào
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Thứ (0 = Chủ nhật) và giờ 'HH:mm' hiện tại ở Việt Nam */
export const vnNow = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return { day: WEEKDAYS.indexOf(get('weekday')), time: `${get('hour')}:${get('minute')}` };
};

/**
 * '12:00' -> '12 giờ trưa', '23:59' -> '11 giờ 59 tối', '06:30' -> '6 giờ 30 sáng'.
 * Ô nhập giờ của trình duyệt có thể hiện kiểu SA/CH ("12:00 CH" = 12 giờ trưa) nên luôn ghi kèm cách đọc này.
 */
export const describeTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const period = h < 4 ? 'đêm' : h < 11 ? 'sáng' : h < 13 ? 'trưa' : h < 18 ? 'chiều' : 'tối';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour} giờ${m ? ` ${String(m).padStart(2, '0')}` : ''} ${period}`;
};

/** Lần mở cửa kế tiếp tính từ bây giờ (trong 7 ngày tới) */
export const nextOpening = (hours: OpeningHour[], date = new Date()) => {
  const { day, time } = vnNow(date);
  for (let offset = 0; offset < 8; offset++) {
    const d = (day + offset) % 7;
    const slots = hours.filter(h => h.dayOfWeek === d).sort((a, b) => a.open.localeCompare(b.open));
    const slot = offset === 0 ? slots.find(s => s.open > time) : slots[0];
    if (slot) return { offset, day: d, open: slot.open };
  }
  return null;
};

const whenLabel = (next: NonNullable<ReturnType<typeof nextOpening>>) =>
  next.offset === 0 ? `mở lại lúc ${next.open}` : next.offset === 1 ? `mở lúc ${next.open} ngày mai` : `mở ${DAY_NAMES[next.day]} lúc ${next.open}`;

interface StatusInput {
  canAcceptOrders: boolean;
  isOpenNow: boolean;
  openingHours?: OpeningHour[];
}

/**
 * Lý do quán không nhận đơn, để khách hiểu (thay cho chữ "Tạm nghỉ" chung chung):
 * - ngoài giờ mở cửa  -> "Ngoài giờ mở cửa · mở lại lúc 06:00"
 * - trong giờ nhưng chủ quán tắt nhận đơn / quán bị tạm ngưng -> "Quán tạm ngưng nhận đơn"
 * @returns { short: nhãn ngắn cho thẻ quán, full: câu đầy đủ } hoặc null nếu đang nhận đơn
 */
export const closedReason = (r: StatusInput) => {
  if (r.canAcceptOrders) return null;
  if (r.isOpenNow) return { short: 'Tạm ngưng nhận đơn', full: 'Quán tạm ngưng nhận đơn' };

  const next = r.openingHours ? nextOpening(r.openingHours) : null;
  if (r.openingHours && !next) return { short: 'Chưa có giờ mở cửa', full: 'Quán chưa có giờ mở cửa' };
  if (!next) return { short: 'Ngoài giờ mở cửa', full: 'Ngoài giờ mở cửa' };

  const when = whenLabel(next);
  return { short: when.charAt(0).toUpperCase() + when.slice(1), full: `Ngoài giờ mở cửa · ${when}` };
};
