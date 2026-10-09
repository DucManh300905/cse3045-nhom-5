const mongoose = require('mongoose');

const Order = require('../order/order.model');
const AppError = require('../../utils/AppError');
const { TIME_ZONE, toLocalDateKey } = require('../../utils/openingHours');

// Báo cáo (API-9). Quy ước:
// - Khoảng ngày theo giờ VN (UTC+7, không có giờ mùa hè): from 00:00 -> hết ngày `to`. Mặc định 30 ngày gần nhất.
// - Đơn tính theo ngày ĐẶT (placedAt).
// - Doanh thu chỉ tính đơn COMPLETED (BR-52): gross = Σ total, commission = Σ commissionAmount, net = gross − commission.

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const vnMidnight = (key) => new Date(`${key}T00:00:00+07:00`);
// '261009' (yyMMdd) -> '2026-10-09'
const keyToIso = (k) => `20${k.slice(0, 2)}-${k.slice(2, 4)}-${k.slice(4, 6)}`;
const todayIso = () => keyToIso(toLocalDateKey());
const shiftIso = (iso, days) => new Date(vnMidnight(iso).getTime() + days * DAY_MS + 12 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD (giờ VN, cả 2 ngày tính) -> { start, end (không gồm), from, to, days }
 */
const parseRange = ({ from, to } = {}) => {
    const toIso = to || todayIso();
    const fromIso = from || shiftIso(toIso, -29);

    if (!DATE_RE.test(fromIso) || !DATE_RE.test(toIso) || Number.isNaN(vnMidnight(fromIso).getTime()) || Number.isNaN(vnMidnight(toIso).getTime())) {
        throw new AppError(400, 'VALIDATION_ERROR', 'from / to must be dates YYYY-MM-DD');
    }

    const start = vnMidnight(fromIso);
    const end = new Date(vnMidnight(toIso).getTime() + DAY_MS);
    const days = Math.round((end - start) / DAY_MS);

    if (days < 1) {
        throw new AppError(400, 'VALIDATION_ERROR', 'from must be before or equal to to');
    }
    if (days > MAX_DAYS) {
        throw new AppError(400, 'VALIDATION_ERROR', `Range must be at most ${MAX_DAYS} days`);
    }

    return { start, end, from: fromIso, to: toIso, days };
};

const CANCELLED = ['CANCELLED', 'REJECTED'];
const ACTIVE = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERING'];

const matchOf = (range, extra = {}) => ({ placedAt: { $gte: range.start, $lt: range.end }, ...extra });

const asId = (id) => new mongoose.Types.ObjectId(String(id));

/** Số đơn theo trạng thái + tiền của đơn hoàn thành trong khoảng */
const orderTotals = async (range, extra = {}) => {
    const [row] = await Order.aggregate([
        { $match: matchOf(range, extra) },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
                cancelledOrders: { $sum: { $cond: [{ $in: ['$status', CANCELLED] }, 1, 0] } },
                activeOrders: { $sum: { $cond: [{ $in: ['$status', ACTIVE] }, 1, 0] } },
                grossRevenue: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, '$total', 0] } },
                commission: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, '$commissionAmount', 0] } },
                itemsSold: {
                    $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, { $sum: '$items.qty' }, 0] }
                }
            }
        }
    ]);

    const t = row ?? { totalOrders: 0, completedOrders: 0, cancelledOrders: 0, activeOrders: 0, grossRevenue: 0, commission: 0, itemsSold: 0 };
    const decided = t.completedOrders + t.cancelledOrders;

    return {
        totalOrders: t.totalOrders,
        completedOrders: t.completedOrders,
        cancelledOrders: t.cancelledOrders,
        activeOrders: t.activeOrders,
        itemsSold: t.itemsSold,
        grossRevenue: t.grossRevenue,
        commission: t.commission,
        netRevenue: t.grossRevenue - t.commission,
        avgOrderValue: t.completedOrders ? Math.round(t.grossRevenue / t.completedOrders) : 0,
        // Trên các đơn đã kết thúc (hoàn thành + hủy/từ chối); đơn đang làm không tính
        cancelRate: decided ? Math.round((t.cancelledOrders / decided) * 1000) / 1000 : 0
    };
};

const UNITS = { day: 'day', week: 'week', month: 'month' };

/** Bước kế tiếp của 1 mốc (ISO ngày đầu kỳ) theo đơn vị */
const nextBucket = (iso, unit) => {
    if (unit === 'day') return shiftIso(iso, 1);
    if (unit === 'week') return shiftIso(iso, 7);
    const [y, m] = iso.split('-').map(Number);
    return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
};

/** Ngày đầu kỳ chứa `iso` (tuần bắt đầu thứ Hai) */
const bucketStart = (iso, unit) => {
    if (unit === 'day') return iso;
    if (unit === 'month') return `${iso.slice(0, 8)}01`;
    const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = CN
    return shiftIso(iso, -((dow + 6) % 7));
};

/**
 * Chuỗi doanh thu theo kỳ, ĐỦ mọi kỳ trong khoảng (kỳ không có đơn = 0) để vẽ biểu đồ liền mạch.
 * @returns [{ period: 'YYYY-MM-DD' (ngày đầu kỳ), orders, completedOrders, grossRevenue, commission, netRevenue }]
 */
const revenueSeries = async (range, groupBy = 'day', extra = {}) => {
    const unit = UNITS[groupBy];
    if (!unit) {
        throw new AppError(400, 'VALIDATION_ERROR', 'groupBy must be day, week or month');
    }

    const rows = await Order.aggregate([
        { $match: matchOf(range, extra) },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: '%Y-%m-%d',
                        timezone: TIME_ZONE,
                        date: { $dateTrunc: { date: '$placedAt', unit, timezone: TIME_ZONE, startOfWeek: 'monday' } }
                    }
                },
                orders: { $sum: 1 },
                completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
                grossRevenue: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, '$total', 0] } },
                commission: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, '$commissionAmount', 0] } }
            }
        }
    ]);
    const byPeriod = new Map(rows.map((r) => [r._id, r]));

    const series = [];
    for (let p = bucketStart(range.from, unit); p <= range.to; p = nextBucket(p, unit)) {
        const r = byPeriod.get(p);
        series.push({
            period: p,
            orders: r?.orders ?? 0,
            completedOrders: r?.completedOrders ?? 0,
            grossRevenue: r?.grossRevenue ?? 0,
            commission: r?.commission ?? 0,
            netRevenue: (r?.grossRevenue ?? 0) - (r?.commission ?? 0)
        });
    }
    return series;
};

/** Món bán chạy (đơn hoàn thành), theo số phần */
const topItems = async (range, restaurantId, limit = 10) =>
    Order.aggregate([
        { $match: matchOf(range, { restaurant: asId(restaurantId), status: 'COMPLETED' }) },
        { $unwind: '$items' },
        {
            $group: {
                _id: '$items.menuItem',
                name: { $last: '$items.name' },
                qty: { $sum: '$items.qty' },
                revenue: { $sum: '$items.lineTotal' },
                orders: { $sum: 1 }
            }
        },
        { $sort: { qty: -1, revenue: -1 } },
        { $limit: limit },
        { $project: { _id: 0, menuItemId: '$_id', name: 1, qty: 1, revenue: 1, orders: 1 } }
    ]);

/** Quán có doanh thu (đơn hoàn thành) cao nhất — cho admin */
const topRestaurants = async (range, limit = 5) =>
    Order.aggregate([
        { $match: matchOf(range, { status: 'COMPLETED' }) },
        {
            $group: {
                _id: '$restaurant',
                name: { $last: '$restaurantSnapshot.name' },
                slug: { $last: '$restaurantSnapshot.slug' },
                completedOrders: { $sum: 1 },
                grossRevenue: { $sum: '$total' },
                commission: { $sum: '$commissionAmount' }
            }
        },
        { $sort: { grossRevenue: -1 } },
        { $limit: limit },
        { $project: { _id: 0, restaurantId: '$_id', name: 1, slug: 1, completedOrders: 1, grossRevenue: 1, commission: 1 } }
    ]);

module.exports = {
    parseRange,
    orderTotals,
    revenueSeries,
    topItems,
    topRestaurants,
    asId
};
