const Order = require('./order.model');
const { acceptByOwner, rejectByOwner, cancelByOwner, advanceByOwner } = require('./order.service');
const { nextOwnerStatus } = require('./orderStateMachine');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { getPagination, paginate } = require('../../utils/pagination');

const CUSTOMER_FIELDS = 'fullName phone email';

// Chủ quán thấy thêm thông tin khách + bước tiếp theo gợi ý cho nút bấm
const toMerchantOrder = (order) => ({
    ...order.toJSON(),
    nextStatus: nextOwnerStatus(order)
});

// GET /merchant/orders?status=PLACED,ACCEPTED&from=&to=&page=&limit=
const listOrders = asyncHandler(async (req, res) => {
    const filter = { restaurant: req.restaurant._id };
    const { status, from, to } = req.query;

    if (status) {
        filter.status = { $in: String(status).split(',') };
    }

    if (from || to) {
        filter.placedAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
    }

    // Đơn chờ nhận: cũ nhất lên đầu để không bị bỏ sót; còn lại: mới nhất trước
    const onlyPlaced = status === 'PLACED';
    const result = await paginate(Order, filter, getPagination(req), {
        sort: { placedAt: onlyPlaced ? 1 : -1 },
        populate: { path: 'customer', select: CUSTOMER_FIELDS }
    });

    return res.status(200).json({
        success: true,
        data: { ...result, items: result.items.map(toMerchantOrder) }
    });
});

// GET /merchant/orders/:id — đơn quán khác trả 404
const getOrder = asyncHandler(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, restaurant: req.restaurant._id }).populate(
        'customer',
        CUSTOMER_FIELDS
    );

    if (!order) {
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
    }

    return res.status(200).json({ success: true, data: toMerchantOrder(order) });
});

const respond = (res, message) => async (order) => {
    await order.populate('customer', CUSTOMER_FIELDS);
    return res.status(200).json({ success: true, message, data: toMerchantOrder(order) });
};

const ctx = (req) => ({ orderId: req.params.id, restaurant: req.restaurant, userId: req.user.userId });

// POST /merchant/orders/:id/accept
const acceptOrder = asyncHandler(async (req, res) =>
    respond(res, 'Order accepted')(await acceptByOwner(ctx(req)))
);

// POST /merchant/orders/:id/reject { reasonCode, note? }
const rejectOrder = asyncHandler(async (req, res) =>
    respond(res, 'Order rejected')(await rejectByOwner({ ...ctx(req), reasonCode: req.body.reasonCode, note: req.body.note }))
);

// POST /merchant/orders/:id/cancel { reasonCode, note? } — chỉ đơn đã nhận
const cancelOrder = asyncHandler(async (req, res) =>
    respond(res, 'Order cancelled')(await cancelByOwner({ ...ctx(req), reasonCode: req.body.reasonCode, note: req.body.note }))
);

// POST /merchant/orders/:id/status { to }
const updateStatus = asyncHandler(async (req, res) =>
    respond(res, 'Order status updated')(await advanceByOwner({ ...ctx(req), to: req.body.to }))
);

module.exports = {
    listOrders,
    getOrder,
    acceptOrder,
    rejectOrder,
    cancelOrder,
    updateStatus
};
