// Cấu hình lịch ca (Đặc tả Đăng ký ca tài xế — bản chốt). Đọc env lúc gọi (test đổi được).

// Giai đoạn A: một khu vực
const AREA = 'HOA_LAC';
const AREA_NAME = 'Hòa Lạc';

// Khung cố định
const FIXED_SLOTS = [
    { key: 'LUNCH', label: 'Trưa', start: '10:30', end: '13:30' },
    { key: 'AFTERNOON', label: 'Chiều', start: '15:00', end: '17:00' },
    { key: 'DINNER', label: 'Tối', start: '17:00', end: '21:00' }
];

const settings = () => ({
    // Mốc hằng ngày (giờ VN) cho lịch NGÀY MAI
    askAt: process.env.SHIFT_ASK_AT || '14:00',
    closeAt: process.env.SHIFT_CLOSE_AT || '18:00',
    reportAt: process.env.SHIFT_REPORT_AT || '21:00',
    // Đăng ký / hủy miễn phạt tới N giờ trước giờ bắt đầu ca
    cutoffHours: Number(process.env.SHIFT_CUTOFF_HOURS) || 2,
    remindBeforeMinutes: 60,
    // Phút 15: nhắc · phút 30: tính vắng ca
    remindLateMinutes: 15,
    noShowMinutes: 30,
    // Số tài xế cần = số đơn dự kiến ÷ N (tròn lên, tối thiểu 1)
    ordersPerDriver: Number(process.env.SHIFT_ORDERS_PER_DRIVER) || 6,
    // Khung tự chọn: 1–4 giờ, bước 30 phút
    minMinutes: 60,
    maxMinutes: 240,
    // Thang phạt: số ngày khóa theo bậc; 30 ngày không vi phạm thì giảm bậc
    lockDays: { 2: 3, 3: 5 },
    decayDays: Number(process.env.PENALTY_DECAY_DAYS) || 30,
    // Trả đơn đã nhận liên tiếp -> khóa nhận đơn 1 ngày
    maxConsecutiveWithdrawals: Number(process.env.SHIPPER_MAX_CONSECUTIVE_WITHDRAWALS) || 3,
    withdrawLockHours: 24
});

const fixedSlotOf = (start, end) => FIXED_SLOTS.find((s) => s.start === start && s.end === end) ?? null;
const slotLabel = (start, end) => fixedSlotOf(start, end)?.label ?? `${start}–${end}`;

module.exports = {
    AREA,
    AREA_NAME,
    FIXED_SLOTS,
    settings,
    fixedSlotOf,
    slotLabel
};
