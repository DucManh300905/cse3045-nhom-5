const User = require('../user/user.model');
const Restaurant = require('../restaurant/restaurant.model');
const Order = require('../order/order.model');
const { recordAudit } = require('../audit/audit.service');
const { parseRange } = require('../report/report.service');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { getPagination, paginate, escapeRegex } = require('../../utils/pagination');

// ======================= Người dùng =======================

const toAdminUser = (u, restaurantByOwner = new Map()) => ({
    id: u._id,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    emailVerified: u.emailVerified ?? false,
    createdAt: u.createdAt,
    restaurant: restaurantByOwner.get(String(u._id)) ?? null
});

// GET /admin/users?role=&status=&q=&page=&limit= — q tìm theo tên / email / SĐT
const listUsers = asyncHandler(async (req, res) => {
    const filter = {};
    const { role, status, q } = req.query;

    if (role) filter.role = role;
    if (status) filter.status = status;
    if (q) {
        const regex = new RegExp(escapeRegex(q.trim()), 'i');
        filter.$or = [{ fullName: regex }, { email: regex }, { phone: regex }];
    }

    const result = await paginate(User, filter, getPagination(req), { sort: { createdAt: -1, _id: -1 } });

    // Chủ quán: kèm tên quán để admin nhận ra
    const owners = result.items.filter((u) => u.role === 'RESTAURANT_OWNER').map((u) => u._id);
    const shops = owners.length ? await Restaurant.find({ owner: { $in: owners } }).select('owner name slug status').lean() : [];
    const byOwner = new Map(shops.map((s) => [String(s.owner), { id: s._id, name: s.name, slug: s.slug, status: s.status }]));

    return res.status(200).json({
        success: true,
        data: { ...result, items: result.items.map((u) => toAdminUser(u, byOwner)) }
    });
});

/**
 * Khóa / mở tài khoản (BR-04). Không khóa được ADMIN. Khóa chủ quán -> quán tắt nhận đơn
 * (chủ không đăng nhập được thì không ai xử lý đơn mới). Token cũ bị chặn ngay vì authenticate đọc lại user.
 */
const setUserStatus = (status) =>
    asyncHandler(async (req, res) => {
        const user = await User.findById(req.params.id);

        if (!user) {
            throw new AppError(404, 'NOT_FOUND', 'User not found');
        }
        if (user.role === 'ADMIN') {
            throw new AppError(403, 'FORBIDDEN', 'Admin accounts cannot be blocked');
        }
        if (user.status === status) {
            throw new AppError(409, 'INVALID_STATUS_TRANSITION', `User is already ${status}`);
        }

        const before = user.status;
        user.status = status;
        await user.save();

        if (status === 'BLOCKED' && user.role === 'RESTAURANT_OWNER') {
            await Restaurant.updateOne({ owner: user._id }, { $set: { isAcceptingOrders: false } });
        }

        await recordAudit(req, {
            action: status === 'BLOCKED' ? 'USER_BLOCK' : 'USER_UNBLOCK',
            targetType: 'User',
            targetId: user._id,
            before: { status: before },
            after: { status },
            note: req.body?.reason
        });

        return res.status(200).json({ success: true, data: toAdminUser(user) });
    });

// ======================= Đơn hàng (chỉ đọc) =======================

// GET /admin/orders?status=&restaurant=&q=<mã đơn>&from&to&page=&limit=
const listOrders = asyncHandler(async (req, res) => {
    const filter = {};
    const { status, restaurant, q } = req.query;

    if (status) filter.status = { $in: String(status).split(',') };
    if (restaurant) filter.restaurant = restaurant;
    if (q) filter.code = new RegExp(escapeRegex(q.trim()), 'i');
    if (req.query.from || req.query.to) {
        const range = parseRange(req.query);
        filter.placedAt = { $gte: range.start, $lt: range.end };
    }

    const result = await paginate(Order, filter, getPagination(req), {
        sort: { placedAt: -1, _id: -1 },
        populate: { path: 'customer', select: 'fullName email phone' }
    });

    return res.status(200).json({ success: true, data: result });
});

// GET /admin/orders/:id
const getOrder = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('customer', 'fullName email phone');

    if (!order) {
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
    }

    return res.status(200).json({ success: true, data: order });
});

module.exports = {
    listUsers,
    blockUser: setUserStatus('BLOCKED'),
    unblockUser: setUserStatus('ACTIVE'),
    listOrders,
    getOrder
};
