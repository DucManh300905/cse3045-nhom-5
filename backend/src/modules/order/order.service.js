const mongoose = require('mongoose');

const Order = require('./order.model');
const Counter = require('./counter.model');
const IdempotencyKey = require('./idempotencyKey.model');
const { buildOrderDraft } = require('./order.pricing');
const MenuItem = require('../menu/menuItem.model');
const Restaurant = require('../restaurant/restaurant.model');
const AppError = require('../../utils/AppError');
const { canAcceptOrders, toLocalDateKey } = require('../../utils/openingHours');
const { canOwnerAdvance } = require('./orderStateMachine');
const { emitOrderNew, emitOrderStatusChanged } = require('../../realtime/socket');

// Quán đang nhận đơn (BR-12, BR-13). Quán chưa duyệt coi như không tồn tại với khách.
const findOrderableRestaurant = async (restaurantId, session = null) => {
    const restaurant = await Restaurant.findById(restaurantId).session(session);

    if (!restaurant || restaurant.status !== 'APPROVED') {
        throw new AppError(404, 'NOT_FOUND', 'Restaurant not found');
    }

    if (!canAcceptOrders(restaurant)) {
        throw new AppError(422, 'RESTAURANT_CLOSED', 'Restaurant is not accepting orders right now');
    }

    return restaurant;
};

// Mã đơn theo ngày VN: MAK261006-0001 (bộ đếm nằm trong transaction nên đơn lỗi không làm nhảy số)
const nextOrderCode = async (session) => {
    const day = toLocalDateKey();
    const counter = await Counter.findOneAndUpdate(
        { _id: `order:${day}` },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after', session }
    );

    return `MAK${day}-${String(counter.seq).padStart(4, '0')}`;
};

// Trừ suất nguyên tử (BR-34): chỉ trừ khi còn đủ; một món thất bại -> cả transaction hủy
const reserveStock = async (qtyByItem, restaurantId, session) => {
    for (const [itemId, qty] of qtyByItem) {
        const result = await MenuItem.updateOne(
            {
                _id: itemId,
                restaurant: restaurantId,
                isDeleted: false,
                isAvailable: true,
                $or: [{ dailyLimit: null }, { $expr: { $lte: [{ $add: ['$soldToday', qty] }, '$dailyLimit'] } }]
            },
            { $inc: { soldToday: qty, soldCount: qty } },
            { session }
        );

        if (result.modifiedCount === 0) {
            throw new AppError(409, 'ITEM_OUT_OF_STOCK', 'Item is out of stock', [
                { field: 'items', msg: 'Item is out of stock', menuItemId: itemId }
            ]);
        }
    }
};

// Hoàn suất khi đơn bị hủy / từ chối (BR-37). soldToday chỉ hoàn nếu vẫn cùng ngày đặt
// (sang ngày mới job reset đã đưa về 0, trừ tiếp sẽ sai số của ngày mới).
const releaseStock = async (order, session) => {
    const sameDay = toLocalDateKey(order.placedAt) === toLocalDateKey();
    const qtyByItem = new Map();
    order.items.forEach((l) => qtyByItem.set(String(l.menuItem), (qtyByItem.get(String(l.menuItem)) || 0) + l.qty));

    const minusQty = (field, qty) => ({ $max: [0, { $subtract: [`$${field}`, qty] }] });

    for (const [itemId, qty] of qtyByItem) {
        // Update pipeline qua driver gốc để không bị âm
        await MenuItem.collection.updateOne(
            { _id: new mongoose.Types.ObjectId(itemId) },
            [{ $set: { soldCount: minusQty('soldCount', qty), ...(sameDay && { soldToday: minusQty('soldToday', qty) }) } }],
            { session }
        );
    }
};

const isDuplicateIdempotencyKey = (error) => error?.code === 11000 && error.keyPattern?.key;

/**
 * Đặt đơn (docs/API.md mục 2.6, thứ tự 8 bước).
 * @returns { order, replayed } — replayed = true khi cùng Idempotency-Key đã tạo đơn trước đó (BR-38)
 */
const placeOrder = async ({ userId, key, restaurantId, inputs, fulfillmentType, delivery, paymentMethod }) => {
    // 1. Key đã dùng -> trả lại đơn cũ, không tạo đơn mới
    const findReplay = async () => {
        const existing = await IdempotencyKey.findOne({ user: userId, key });
        return existing && Order.findById(existing.order);
    };

    const replay = await findReplay();
    if (replay) {
        return { order: replay, replayed: true };
    }

    let order;

    try {
        await mongoose.connection.transaction(async (session) => {
            // 2. Quán đang nhận đơn
            const restaurant = await findOrderableRestaurant(restaurantId, session);

            // 3-4. Kiểm tra món, tùy chọn, tính tiền, đơn tối thiểu
            const draft = await buildOrderDraft(restaurant, inputs, fulfillmentType, session);

            // 5. TODO (API-5b): giữ voucher

            // 6. Trừ suất nguyên tử
            await reserveStock(draft.qtyByItem, restaurant._id, session);

            // 7. Tạo đơn + snapshot + hoa hồng; lưu idempotency key
            const now = new Date();
            [order] = await Order.create(
                [
                    {
                        code: await nextOrderCode(session),
                        customer: userId,
                        restaurant: restaurant._id,
                        restaurantSnapshot: {
                            name: restaurant.name,
                            slug: restaurant.slug,
                            phone: restaurant.phone,
                            address: restaurant.address
                        },
                        items: draft.items,
                        fulfillmentType,
                        delivery: fulfillmentType === 'DELIVERY' ? delivery : undefined,
                        subtotal: draft.subtotal,
                        deliveryFee: draft.deliveryFee,
                        discount: draft.discount,
                        total: draft.total,
                        commissionRate: restaurant.commissionRate,
                        commissionAmount: Math.round(draft.subtotal * restaurant.commissionRate),
                        paymentMethod,
                        status: 'PLACED',
                        placedAt: now,
                        statusHistory: [{ to: 'PLACED', actorType: 'CUSTOMER', actor: userId, at: now }]
                    }
                ],
                { session }
            );

            await IdempotencyKey.create([{ key, user: userId, order: order._id }], { session });
        });
    } catch (error) {
        // Hai request cùng key chạy song song: request sau thua ở unique index -> trả đơn của request trước
        if (isDuplicateIdempotencyKey(error)) {
            const existing = await findReplay();
            if (existing) {
                return { order: existing, replayed: true };
            }
            throw new AppError(409, 'DUPLICATE', 'This order request is already being processed');
        }
        throw error;
    }

    // 8. Sau khi commit: trang quán kêu chuông (TODO API-7: tạo notification)
    emitOrderNew(order);
    return { order, replayed: false };
};

// Xem trước: cùng logic tính tiền nhưng không lưu, không trừ kho
const previewOrder = async ({ restaurantId, inputs, fulfillmentType }) => {
    const restaurant = await findOrderableRestaurant(restaurantId);
    const draft = await buildOrderDraft(restaurant, inputs, fulfillmentType);

    return { restaurant, draft };
};

/**
 * Chuyển trạng thái nguyên tử (BR-35): chỉ đổi nếu đơn còn ở `from` — ai đổi trước thắng, người sau nhận 409.
 * filter: điều kiện quyền sở hữu, vd { customer } hoặc { restaurant }.
 */
const transitionOrder = async ({ orderId, filter, from, to, actorType, actor, reason, set = {}, session }) => {
    const now = new Date();
    const timeField = { CANCELLED: 'cancelledAt', REJECTED: 'cancelledAt', ACCEPTED: 'acceptedAt', COMPLETED: 'completedAt' }[to];

    const order = await Order.findOneAndUpdate(
        { _id: orderId, ...filter, status: from },
        {
            $set: { status: to, ...(timeField && { [timeField]: now }), ...set },
            $push: { statusHistory: { from, to, actorType, actor, reason, at: now } }
        },
        { returnDocument: 'after', session }
    );

    if (!order) {
        // Đơn của người khác cũng trả 404, không lộ sự tồn tại
        if (!(await Order.exists({ _id: orderId, ...filter }).session(session))) {
            throw new AppError(404, 'NOT_FOUND', 'Order not found');
        }
        throw new AppError(409, 'INVALID_STATUS_TRANSITION', `Order cannot be changed to ${to} from its current status`);
    }

    return order;
};

/**
 * Chuyển trạng thái có hoàn suất (hủy / từ chối) trong một transaction, rồi báo realtime.
 */
const transitionAndRelease = async (args) => {
    let order;

    await mongoose.connection.transaction(async (session) => {
        order = await transitionOrder({ ...args, session });
        await releaseStock(order, session);
    });

    emitOrderStatusChanged(order);
    return order;
};

// Khách hủy: chỉ khi quán chưa nhận (PLACED -> CANCELLED), hoàn suất
const cancelByCustomer = ({ orderId, userId, note }) =>
    transitionAndRelease({
        orderId,
        filter: { customer: userId },
        from: 'PLACED',
        to: 'CANCELLED',
        actorType: 'CUSTOMER',
        actor: userId,
        reason: note,
        set: { cancelReason: { code: 'CUSTOMER_CHANGED_MIND', note } }
    });

// ======================= Chủ quán (BR-35) =======================

// Quán nhận đơn: PLACED -> ACCEPTED, ước tính giờ xong theo thời gian chuẩn bị TB của quán
const acceptByOwner = async ({ orderId, restaurant, userId }) => {
    const order = await transitionOrder({
        orderId,
        filter: { restaurant: restaurant._id },
        from: 'PLACED',
        to: 'ACCEPTED',
        actorType: 'OWNER',
        actor: userId,
        set: { estimatedReadyAt: new Date(Date.now() + restaurant.avgPrepMinutes * 60 * 1000) }
    });

    emitOrderStatusChanged(order);
    return order;
};

// Quán từ chối: PLACED -> REJECTED (bắt buộc lý do), hoàn suất (BR-37)
const rejectByOwner = ({ orderId, restaurant, userId, reasonCode, note }) =>
    transitionAndRelease({
        orderId,
        filter: { restaurant: restaurant._id },
        from: 'PLACED',
        to: 'REJECTED',
        actorType: 'OWNER',
        actor: userId,
        reason: note || reasonCode,
        set: { cancelReason: { code: reasonCode, note } }
    });

// Quán hủy đơn đã nhận: ACCEPTED -> CANCELLED (bắt buộc lý do), hoàn suất
const cancelByOwner = ({ orderId, restaurant, userId, reasonCode, note }) =>
    transitionAndRelease({
        orderId,
        filter: { restaurant: restaurant._id },
        from: 'ACCEPTED',
        to: 'CANCELLED',
        actorType: 'OWNER',
        actor: userId,
        reason: note || reasonCode,
        set: { cancelReason: { code: reasonCode, note } }
    });

// Đi tiếp theo luồng chuẩn: ACCEPTED -> PREPARING -> READY -> DELIVERING / COMPLETED
const advanceByOwner = async ({ orderId, restaurant, userId, to }) => {
    const current = await Order.findOne({ _id: orderId, restaurant: restaurant._id });

    if (!current) {
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
    }

    if (!canOwnerAdvance(current, to)) {
        throw new AppError(409, 'INVALID_STATUS_TRANSITION', `Cannot change order from ${current.status} to ${to}`);
    }

    // `from` = trạng thái vừa đọc: nếu có người đổi trước (vd khách vừa hủy) thì 409
    const order = await transitionOrder({
        orderId,
        filter: { restaurant: restaurant._id },
        from: current.status,
        to,
        actorType: 'OWNER',
        actor: userId,
        // COD: hoàn thành = đã thu tiền (BR-39)
        set: to === 'COMPLETED' ? { paymentStatus: 'PAID' } : {}
    });

    emitOrderStatusChanged(order);
    return order;
};

// ======================= Hệ thống =======================

// Đơn PLACED quá hạn không được quán phản hồi -> CANCELLED (BR-36). Trả về số đơn đã hủy.
const cancelExpiredOrders = async ({ olderThanMinutes = 5, now = new Date() } = {}) => {
    const expired = await Order.find({
        status: 'PLACED',
        placedAt: { $lt: new Date(now.getTime() - olderThanMinutes * 60 * 1000) }
    }).select('_id');

    let cancelled = 0;
    for (const { _id } of expired) {
        try {
            await transitionAndRelease({
                orderId: _id,
                filter: {},
                from: 'PLACED',
                to: 'CANCELLED',
                actorType: 'SYSTEM',
                reason: 'TIMEOUT',
                set: { cancelReason: { code: 'TIMEOUT', note: `Quán không phản hồi sau ${olderThanMinutes} phút` } }
            });
            cancelled += 1;
        } catch (error) {
            // Quán vừa nhận / khách vừa hủy cùng lúc -> bỏ qua đơn đó
            if (error.code !== 'INVALID_STATUS_TRANSITION') {
                throw error;
            }
        }
    }

    return cancelled;
};

// 00:00 giờ VN: reset số suất đã bán trong ngày (BR-23)
const resetDailyStock = async () => {
    const { modifiedCount } = await MenuItem.updateMany({ soldToday: { $gt: 0 } }, { $set: { soldToday: 0 } });
    return modifiedCount;
};

module.exports = {
    placeOrder,
    previewOrder,
    transitionOrder,
    cancelByCustomer,
    acceptByOwner,
    rejectByOwner,
    cancelByOwner,
    advanceByOwner,
    cancelExpiredOrders,
    resetDailyStock,
    releaseStock
};
