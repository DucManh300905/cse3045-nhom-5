// Giờ mở cửa tính theo giờ Việt Nam, kể cả khi server chạy ở múi giờ khác (BR-13)
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
});

// Date -> { dayOfWeek: 0-6 (0 = Chủ nhật), time: 'HH:mm' } theo giờ VN
const toLocalParts = (date) => {
    const parts = Object.fromEntries(
        formatter.formatToParts(date).map(({ type, value }) => [type, value])
    );

    return {
        dayOfWeek: WEEKDAYS[parts.weekday],
        time: `${parts.hour}:${parts.minute}`
    };
};

// Date -> 'yyMMdd' theo ngày VN, vd 2026-10-06 -> '261006' (mã đơn, so sánh "cùng ngày")
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit'
});
const toLocalDateKey = (date = new Date()) => dateFormatter.format(date).replace(/-/g, '');

// MVP: không có ca qua đêm, nên open < close trong cùng một ngày
const isWithinOpeningHours = (openingHours = [], date = new Date()) => {
    const { dayOfWeek, time } = toLocalParts(date);

    return openingHours.some(
        (slot) => slot.dayOfWeek === dayOfWeek && slot.open <= time && time < slot.close
    );
};

// Quán nhận đơn khi: đã duyệt + đang bật nhận đơn + trong giờ mở cửa (BR-13)
const canAcceptOrders = (restaurant, date = new Date()) =>
    restaurant.status === 'APPROVED' &&
    restaurant.isAcceptingOrders === true &&
    isWithinOpeningHours(restaurant.openingHours, date);

module.exports = {
    TIME_ZONE,
    toLocalParts,
    toLocalDateKey,
    isWithinOpeningHours,
    canAcceptOrders
};
