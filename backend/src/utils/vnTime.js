// Ngày giờ theo giờ Việt Nam (UTC+7, không đổi giờ mùa hè) cho lịch ca tài xế.
// Quy ước: ngày 'YYYY-MM-DD', giờ 'HH:mm'.
const { TIME_ZONE } = require('./openingHours');

const OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
});

/** Date -> { date: 'YYYY-MM-DD', time: 'HH:mm' } theo giờ VN */
const vnParts = (d = new Date()) => {
    const p = Object.fromEntries(parts.formatToParts(d).map(({ type, value }) => [type, value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};

/** ('2026-10-22', '10:30') -> Date (thời điểm thật) */
const vnDateTime = (date, time) => {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return new Date(Date.UTC(y, m - 1, d, hh, mm) - OFFSET_MS);
};

/** '2026-10-22' + n ngày */
const addDays = (date, n) => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
};

/** Thứ trong tuần của ngày VN (0 = Chủ nhật) */
const weekdayOf = (date) => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const toMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

const isDateKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

module.exports = {
    DAY_MS,
    vnParts,
    vnDateTime,
    addDays,
    weekdayOf,
    toMinutes,
    isDateKey
};
