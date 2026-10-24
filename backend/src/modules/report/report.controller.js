const Restaurant = require('../restaurant/restaurant.model');
const User = require('../user/user.model');
const { parseRange, orderTotals, revenueSeries, topItems, topRestaurants, asId } = require('./report.service');
const asyncHandler = require('../../utils/asyncHandler');

const rangeOf = (r) => ({ from: r.from, to: r.to, days: r.days });

// ======================= Chủ quán =======================

// GET /merchant/reports/summary?from&to — số đơn, doanh thu, hoa hồng, thực nhận, giá trị đơn TB, tỷ lệ hủy, rating (BR-52)
const merchantSummary = asyncHandler(async (req, res) => {
    const range = parseRange(req.query);
    const totals = await orderTotals(range, { restaurant: asId(req.restaurant._id) });

    return res.status(200).json({
        success: true,
        data: {
            range: rangeOf(range),
            ...totals,
            commissionRate: req.restaurant.commissionRate,
            ratingAvg: req.restaurant.ratingAvg,
            ratingCount: req.restaurant.ratingCount
        }
    });
});

// GET /merchant/reports/revenue?from&to&groupBy=day|week|month — đủ mọi kỳ (kỳ trống = 0)
const merchantRevenue = asyncHandler(async (req, res) => {
    const range = parseRange(req.query);
    const series = await revenueSeries(range, req.query.groupBy || 'day', { restaurant: asId(req.restaurant._id) });

    return res.status(200).json({ success: true, data: { range: rangeOf(range), groupBy: req.query.groupBy || 'day', series } });
});

// GET /merchant/reports/top-items?from&to&limit=10
const merchantTopItems = asyncHandler(async (req, res) => {
    const range = parseRange(req.query);
    const items = await topItems(range, req.restaurant._id, Number(req.query.limit) || 10);

    return res.status(200).json({ success: true, data: { range: rangeOf(range), items } });
});

// ======================= Admin =======================

const countBy = async (model, field, filter = {}) => {
    const rows = await model.aggregate([{ $match: filter }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }]);
    return Object.fromEntries(rows.map((r) => [r._id, r.count]));
};

// GET /admin/reports/summary?from&to&groupBy= — quán, người dùng, đơn, GMV, hoa hồng + chuỗi theo kỳ + top quán
const adminSummary = asyncHandler(async (req, res) => {
    const range = parseRange(req.query);
    const [totals, series, top, restaurantsByStatus, usersByRole, blockedUsers, newUsers] = await Promise.all([
        orderTotals(range),
        revenueSeries(range, req.query.groupBy || 'day'),
        topRestaurants(range, 5),
        countBy(Restaurant, 'status'),
        countBy(User, 'role'),
        User.countDocuments({ status: 'BLOCKED' }),
        User.countDocuments({ createdAt: { $gte: range.start, $lt: range.end } })
    ]);

    return res.status(200).json({
        success: true,
        data: {
            range: rangeOf(range),
            orders: totals,
            // GMV = tổng tiền đơn hoàn thành; doanh thu nền tảng = hoa hồng
            gmv: totals.grossRevenue,
            platformRevenue: totals.commission,
            restaurants: { byStatus: restaurantsByStatus, total: Object.values(restaurantsByStatus).reduce((s, n) => s + n, 0) },
            users: { byRole: usersByRole, blocked: blockedUsers, newInRange: newUsers },
            series,
            topRestaurants: top
        }
    });
});

module.exports = {
    merchantSummary,
    merchantRevenue,
    merchantTopItems,
    adminSummary
};
