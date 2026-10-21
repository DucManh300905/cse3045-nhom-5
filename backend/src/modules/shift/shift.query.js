const { Shift, ShiftAssignment, HOLDING_STATUSES } = require('./shift.models');

// Truy vấn chỉ đọc, dùng chung cho điều phối và đặt đơn (không phụ thuộc service khác -> tránh vòng require)

/** Id các tài xế đang trong ca (đã đăng ký / đã trực tuyến) tại thời điểm `now` */
const shippersOnShift = async (now = new Date()) =>
    ShiftAssignment.find({ status: { $in: HOLDING_STATUSES }, startAt: { $lte: now }, endAt: { $gt: now } }).distinct('shipper');

/**
 * Ca đang chạy của quán có ít nhất 1 tài xế (đã đăng ký / đã trực tuyến) tại `now` — quán "Theo lịch" giao bằng tài xế MAK.
 * @returns ca hoặc null
 */
const coveredShiftFor = async (restaurantId, now = new Date()) => {
    const shifts = await Shift.find({
        'restaurants.restaurant': restaurantId,
        status: { $ne: 'CANCELLED' },
        startAt: { $lte: now },
        endAt: { $gt: now }
    }).select('_id start end');
    for (const shift of shifts) {
        if (await ShiftAssignment.exists({ shift: shift._id, status: { $in: HOLDING_STATUSES } })) {
            return shift;
        }
    }
    return null;
};

/** Các khung trong ngày có tài xế cho quán (hiện trên trang quán / thanh toán) */
const coveredWindowsOn = async (restaurantId, date) => {
    const shifts = await Shift.find({ 'restaurants.restaurant': restaurantId, date, status: { $ne: 'CANCELLED' } })
        .select('_id start end')
        .sort({ start: 1 });
    const windows = [];
    for (const shift of shifts) {
        if (await ShiftAssignment.exists({ shift: shift._id, status: { $in: HOLDING_STATUSES } })) {
            windows.push({ start: shift.start, end: shift.end });
        }
    }
    return windows;
};

/**
 * Hình thức giao thực tế lúc đặt (BR-98): quán "Theo lịch" đang trong ca có tài xế -> PLATFORM (trả trước),
 * ngoài ra -> SELF. Quán khác giữ nguyên.
 */
const effectiveDeliveryMode = async (restaurant, now = new Date()) => {
    const mode = restaurant.deliveryMode || 'SELF';
    if (mode !== 'SCHEDULED') return mode;
    return (await coveredShiftFor(restaurant._id, now)) ? 'PLATFORM' : 'SELF';
};

module.exports = {
    effectiveDeliveryMode,
    shippersOnShift,
    coveredShiftFor,
    coveredWindowsOn
};
