const mongoose = require('mongoose');

const Order = require('./order.model');
const Counter = require('./counter.model');
const IdempotencyKey = require('./idempotencyKey.model');
const { buildOrderDraft } = require('./order.pricing');
const MenuItem = require('../menu/menuItem.model');
const Restaurant = require('../restaurant/restaurant.model');
const AppError = require('../../utils/AppError');
const { canAcceptOrders, toLocalDateKey } = require('../../utils/openingHours');
const { canOwnerAdvance, OWNER_CANCELLABLE } = require('./orderStateMachine');
const { emitOrderNew, emitOrderStatusChanged, emitDeliveryChanged } = require('../../realtime/socket');
const notifications = require('../notification/notification.service');
const wallet = require('../wallet/wallet.service');
const payment = require('../payment/payment.service');
const voucher = require('../voucher/voucher.service');
const routing = require('../routing/routing.service');
const dispatch = require('../shipper/dispatch.service');
const { effectiveDeliveryMode } = require('../shift/shift.query');
const { fromPoint } = require('../../utils/geo');

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

/**
 * Đơn giao tận nơi: quãng đường thật quán -> nơi nhận, chặn ngoài bán kính giao (BR-82..84).
 * Quán chưa có vị trí (dữ liệu cũ) hoặc chưa biết nơi nhận -> bỏ qua (BR-80).
 * Gọi API định tuyến NGOÀI transaction (gọi mạng có thể chậm).
 */
const planDelivery = async (restaurant, fulfillmentType, delivery) => {
    const from = fromPoint(restaurant.location);
    const to = fromPoint(delivery?.location);
    if (fulfillmentType !== 'DELIVERY' || !from || !to) {
        return {};
    }

    const route = await routing.getRoute(from, to);
    if (route.distanceKm > restaurant.deliveryRadiusKm) {
        throw new AppError(422, 'OUT_OF_DELIVERY_RANGE', `Delivery address is ${route.distanceKm} km away, the restaurant delivers within ${restaurant.deliveryRadiusKm} km`, [
            { field: 'delivery.location', distanceKm: route.distanceKm, maxKm: restaurant.deliveryRadiusKm }
        ]);
    }

    // Làm tròn lên 5 phút
    const minutes = (restaurant.avgPrepMinutes || 0) + route.durationMinutes;
    return { route, estimatedDeliveryMinutes: Math.ceil(minutes / 5) * 5 };
};

/**
 * Hình thức giao của đơn (Q1): chụp theo chế độ của quán lúc đặt. Đơn tự lấy không có.
 * Tài xế MAK chỉ nhận đơn trả trước (Q2, BR-91) -> đơn tiền mặt của quán dùng tài xế MAK bị chặn.
 * Tiền công tài xế (Q4) tính từ quãng đường quán -> khách, MAK trả (Q3).
 */
const deliveryTerms = (mode, fulfillmentType, paymentMethod, route) => {
    if (fulfillmentType !== 'DELIVERY') {
        return { deliveryMode: undefined, shipperFee: 0 };
    }
    const deliveryMode = mode || 'SELF';
    if (deliveryMode === 'PLATFORM' && paymentMethod !== 'BANK_TRANSFER') {
        throw new AppError(422, 'PREPAID_REQUIRED', 'This restaurant delivers with MAK drivers: please pay by bank transfer', [
            { field: 'paymentMethod', msg: 'Bank transfer is required for MAK driver delivery' }
        ]);
    }
    return { deliveryMode, shipperFee: deliveryMode === 'PLATFORM' ? wallet.shipperFeeFor(route?.distanceKm) : 0 };
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
    // Đơn trả trước hết hạn thanh toán chưa có placedAt -> lấy ngày tạo
    const sameDay = toLocalDateKey(order.placedAt ?? order.createdAt) === toLocalDateKey();
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
const placeOrder = async ({ userId, key, restaurantId, inputs, fulfillmentType, delivery, paymentMethod, voucherCodes = [] }) => {
    // 1. Key đã dùng -> trả lại đơn cũ, không tạo đơn mới
    const findReplay = async () => {
        const existing = await IdempotencyKey.findOne({ user: userId, key });
        return existing && Order.findById(existing.order);
    };

    const replay = await findReplay();
    if (replay) {
        return { order: replay, replayed: true };
    }

    // Trả trước: chỉ khi MAK đã cấu hình tài khoản nhận + webhook SePay
    const prepaid = paymentMethod === 'BANK_TRANSFER';
    if (prepaid && !payment.isBankTransferEnabled()) {
        throw new AppError(422, 'PAYMENT_METHOD_UNAVAILABLE', 'Bank transfer is not available right now');
    }

    // Quãng đường + bán kính giao (gọi mạng, trước transaction); hình thức giao thực tế ("Theo lịch" -> theo ca)
    const orderable = await findOrderableRestaurant(restaurantId);
    const mode = await effectiveDeliveryMode(orderable);
    const plan = await planDelivery(orderable, fulfillmentType, delivery);

    let order;

    try {
        await mongoose.connection.transaction(async (session) => {
            // 2. Quán đang nhận đơn
            const restaurant = await findOrderableRestaurant(restaurantId, session);

            // 3-4. Kiểm tra món, tùy chọn, tính tiền, đơn tối thiểu
            const draft = await buildOrderDraft(restaurant, inputs, fulfillmentType, session);
            // Quán giao bằng tài xế MAK: bắt buộc trả trước
            const terms = deliveryTerms(mode, fulfillmentType, paymentMethod, plan.route);

            // 5. Voucher (BR-40..45): tính giảm giá; giữ lượt dùng sau khi tạo đơn (bước 7)
            const applied = await voucher.applyVouchers({
                codes: voucherCodes,
                restaurantId: restaurant._id,
                subtotal: draft.subtotal,
                customerId: userId,
                paymentMethod,
                session
            });

            // 6. Trừ suất nguyên tử
            await reserveStock(draft.qtyByItem, restaurant._id, session);

            // 7. Tạo đơn + snapshot + hoa hồng; lưu idempotency key
            // Trả trước: chờ tiền về (PENDING_PAYMENT, chưa tới quán: placedAt = null), giữ suất tới hạn thanh toán
            const now = new Date();
            const code = await nextOrderCode(session);
            const initial = prepaid ? 'PENDING_PAYMENT' : 'PLACED';
            [order] = await Order.create(
                [
                    {
                        code,
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
                        route: plan.route,
                        estimatedDeliveryMinutes: plan.estimatedDeliveryMinutes,
                        deliveryMode: terms.deliveryMode,
                        shipperFee: terms.shipperFee,
                        subtotal: draft.subtotal,
                        deliveryFee: draft.deliveryFee,
                        discount: applied.discount,
                        restaurantDiscount: applied.restaurantDiscount,
                        platformDiscount: applied.platformDiscount,
                        vouchers: applied.vouchers,
                        total: draft.subtotal + draft.deliveryFee - applied.discount,
                        commissionRate: restaurant.commissionRate,
                        // Hoa hồng trên phần quán thực bán: trừ voucher quán tự chịu, không trừ voucher MAK (BR-44)
                        commissionAmount: Math.round((draft.subtotal - applied.restaurantDiscount) * restaurant.commissionRate),
                        paymentMethod,
                        ...(prepaid && {
                            paymentCode: payment.toPaymentCode(code),
                            paymentDeadline: new Date(now.getTime() + payment.paymentTimeoutMinutes() * 60 * 1000)
                        }),
                        status: initial,
                        placedAt: prepaid ? null : now,
                        statusHistory: [{ to: initial, actorType: 'CUSTOMER', actor: userId, at: now }]
                    }
                ],
                { session }
            );

            await IdempotencyKey.create([{ key, user: userId, order: order._id }], { session });
            await voucher.redeemVouchers({ order, session });
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
        // Hai đơn song song của cùng khách giành lượt voucher cuối của mình
        if (voucher.isRedemptionConflict(error)) {
            throw new AppError(422, 'VOUCHER_USER_LIMIT', 'You have already used this voucher', [{ field: 'voucherCodes' }]);
        }
        throw error;
    }

    // 8. Sau khi commit: trang quán kêu chuông + lưu thông báo cho chủ quán
    // (đơn trả trước: đợi webhook xác nhận tiền mới báo quán — payment.service.confirmOrderPayment)
    if (order.status === 'PENDING_PAYMENT') {
        return { order, replayed: false };
    }
    emitOrderNew(order);
    await notifications.orderPlaced(order);
    return { order, replayed: false };
};

// Xem trước: cùng logic tính tiền (kể cả voucher) nhưng không lưu, không trừ kho, không giữ lượt voucher
const previewOrder = async ({ restaurantId, inputs, fulfillmentType, voucherCodes = [], userId, paymentMethod = 'COD', delivery }) => {
    const restaurant = await findOrderableRestaurant(restaurantId);
    const draft = await buildOrderDraft(restaurant, inputs, fulfillmentType);
    const plan = await planDelivery(restaurant, fulfillmentType, delivery);
    const applied = await voucher.applyVouchers({
        codes: voucherCodes,
        restaurantId: restaurant._id,
        subtotal: draft.subtotal,
        customerId: userId,
        paymentMethod
    });

    const deliveryMode = fulfillmentType === 'DELIVERY' ? await effectiveDeliveryMode(restaurant) : null;

    return {
        restaurant,
        draft: {
            ...draft,
            ...applied,
            ...plan,
            deliveryMode,
            // Tài xế MAK chỉ nhận đơn trả trước (BR-91)
            prepaidRequired: deliveryMode === 'PLATFORM',
            total: draft.subtotal + draft.deliveryFee - applied.discount
        }
    };
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
 * Đơn tài xế MAK: thu hồi lời mời / trả tài xế về rảnh + bù tiền chuyến trong cùng transaction (BR-95).
 * keepStock: món đã làm xong và mang đi (giao thất bại) -> không hoàn suất
 */
const transitionAndRelease = async ({ keepStock = false, during, ...args }) => {
    let order;
    let refund = null;
    let released = null;
    let extra = null;

    await mongoose.connection.transaction(async (session) => {
        order = await transitionOrder({ ...args, session });
        if (!keepStock) {
            await releaseStock(order, session);
        }
        if (dispatch.isPlatformDelivery(order)) {
            released = await dispatch.releaseDispatch(order, session);
        }
        extra = during ? await during(order, session) : null;
        // Trả lượt dùng voucher (BR-43)
        await voucher.releaseVouchers(order, session);

        // Khách đã chuyển khoản trả trước -> tạo lệnh hoàn tiền (ESCROW -> REFUND_HOLD)
        if (order.paymentStatus === 'PAID') {
            ({ order, refund } = await payment.refundPaidOrder(order, session));
        } else {
            refund = null;
        }
    });

    await wallet.afterPosting(extra);
    emitOrderStatusChanged(order);
    await notifications.orderStatusChanged(order);
    if (refund) {
        await notifications.refundCreated(refund, order);
    }
    await dispatch.afterRelease(order, released, order.cancelReason?.note || 'Đơn đã bị hủy');
    return order;
};

// Khách hủy: khi đang chờ thanh toán hoặc quán chưa nhận (-> CANCELLED), hoàn suất; đã trả tiền -> hoàn tiền
const cancelByCustomer = async ({ orderId, userId, note }) => {
    const current = await Order.findOne({ _id: orderId, customer: userId }).select('status');
    if (!current) {
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
    }

    return transitionAndRelease({
        orderId,
        filter: { customer: userId },
        // Trạng thái khác -> transitionOrder trả 409
        from: current.status === 'PENDING_PAYMENT' ? 'PENDING_PAYMENT' : 'PLACED',
        to: 'CANCELLED',
        actorType: 'CUSTOMER',
        actor: userId,
        reason: note,
        set: { cancelReason: { code: 'CUSTOMER_CHANGED_MIND', note } }
    });
};

// ======================= Chủ quán (BR-35) =======================

// Quán nhận đơn = bắt đầu làm luôn (19/10/2026): PLACED -> ACCEPTED -> PREPARING trong 1 transaction
// (lịch sử vẫn ghi đủ 2 bước); ước tính giờ xong theo thời gian chuẩn bị TB của quán
const acceptByOwner = async ({ orderId, restaurant, userId }) => {
    let order;

    await mongoose.connection.transaction(async (session) => {
        const common = { orderId, filter: { restaurant: restaurant._id }, actorType: 'OWNER', actor: userId, session };
        await transitionOrder({
            ...common,
            from: 'PLACED',
            to: 'ACCEPTED',
            set: { estimatedReadyAt: new Date(Date.now() + restaurant.avgPrepMinutes * 60 * 1000) }
        });
        order = await transitionOrder({ ...common, from: 'ACCEPTED', to: 'PREPARING' });
    });

    // Báo 1 lần với trạng thái cuối (khách nhận "quán đã nhận đơn, dự kiến xong lúc ...")
    emitOrderStatusChanged(order);
    await notifications.orderStatusChanged(order);

    // Đơn tài xế MAK: tìm tài xế ngay trong lúc quán làm món (lỗi -> job mỗi 10 giây thử lại)
    if (dispatch.isPlatformDelivery(order)) {
        try {
            order = (await dispatch.startDispatch(order)) ?? order;
        } catch (error) {
            console.error('[dispatch] start failed:', error.message);
        }
    }
    return order;
};

/**
 * Không tìm được tài xế -> quán chọn tự giao đơn này (Q7): đơn chuyển sang luồng quán tự giao.
 * Cũng dùng được khi đang tìm (thu hồi lời mời đang chờ).
 */
const selfDeliverByOwner = async ({ orderId, restaurant, userId }) => {
    let order;
    let released;

    await mongoose.connection.transaction(async (session) => {
        const current = await Order.findOne({ _id: orderId, restaurant: restaurant._id, placedAt: { $ne: null } }).session(session);
        if (!current) {
            throw new AppError(404, 'NOT_FOUND', 'Order not found');
        }
        if (!dispatch.isPlatformDelivery(current) || !['SEARCHING', 'NO_SHIPPER'].includes(current.delivery?.status)) {
            throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Only orders still waiting for a driver can be switched to self-delivery');
        }

        order = await Order.findOneAndUpdate(
            { _id: current._id, 'delivery.status': current.delivery.status },
            {
                $set: { deliveryMode: 'SELF', shipperFee: 0, 'delivery.status': null },
                $push: { statusHistory: { from: current.status, to: current.status, actorType: 'OWNER', actor: userId, reason: 'SELF_DELIVERY', at: new Date() } }
            },
            { returnDocument: 'after', session }
        );
        if (!order) {
            throw new AppError(409, 'ORDER_TAKEN', 'A driver has just accepted this order');
        }
        released = await dispatch.releaseDispatch(current, session, { compensate: false });
    });

    await dispatch.afterRelease(order, released, 'Quán tự giao đơn này');
    emitDeliveryChanged(order);
    return order;
};

// Quán bấm "Tìm lại tài xế" sau khi không tìm được (NO_SHIPPER -> SEARCHING, lượt tìm mới)
const redispatch = async ({ orderId, filter = {} }) => {
    const current = await Order.findOne({ _id: orderId, ...filter });
    if (!current) {
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
    }
    if (!dispatch.isPlatformDelivery(current) || current.delivery?.status !== 'NO_SHIPPER') {
        throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'This order is not waiting for a driver');
    }
    const order = await dispatch.startDispatch(current);
    if (!order) {
        throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'This order is not waiting for a driver');
    }
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

// Quán hủy đơn đã nhận nhưng chưa đi giao: ACCEPTED | PREPARING | READY -> CANCELLED (bắt buộc lý do), hoàn suất
const cancelByOwner = async ({ orderId, restaurant, userId, reasonCode, note }) => {
    const current = await Order.findOne({ _id: orderId, restaurant: restaurant._id, placedAt: { $ne: null } }).select('status');
    if (!current) {
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
    }

    return transitionAndRelease({
        orderId,
        filter: { restaurant: restaurant._id },
        // Trạng thái khác (vd DELIVERING) -> transitionOrder trả 409
        from: OWNER_CANCELLABLE.includes(current.status) ? current.status : 'PREPARING',
        to: 'CANCELLED',
        actorType: 'OWNER',
        actor: userId,
        reason: note || reasonCode,
        set: { cancelReason: { code: reasonCode, note } }
    });
};

// Đi tiếp theo luồng chuẩn (orderStateMachine.js): PREPARING -> DELIVERING -> COMPLETED (giao) / PREPARING -> READY -> COMPLETED (tự lấy)
const advanceByOwner = async ({ orderId, restaurant, userId, to }) => {
    const current = await Order.findOne({ _id: orderId, restaurant: restaurant._id });

    if (!current) {
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
    }

    if (!canOwnerAdvance(current, to)) {
        throw new AppError(409, 'INVALID_STATUS_TRANSITION', `Cannot change order from ${current.status} to ${to}`);
    }

    let order;
    let posted;

    // Hoàn thành: đổi trạng thái + ghi sổ ví (hoa hồng) trong cùng transaction — không bao giờ lệch nhau
    await mongoose.connection.transaction(async (session) => {
        // `from` = trạng thái vừa đọc: nếu có người đổi trước (vd khách vừa hủy) thì 409
        order = await transitionOrder({
            orderId,
            filter: { restaurant: restaurant._id },
            from: current.status,
            to,
            actorType: 'OWNER',
            actor: userId,
            // COD: hoàn thành = đã thu tiền (BR-39)
            set: to === 'COMPLETED' ? { paymentStatus: 'PAID' } : {},
            session
        });

        posted = to === 'COMPLETED' ? await wallet.settleOrder(order, session) : null;
    });

    await wallet.afterPosting(posted);
    emitOrderStatusChanged(order);
    await notifications.orderStatusChanged(order);
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

// Đơn trả trước quá hạn thanh toán -> CANCELLED (PAYMENT_TIMEOUT), hoàn suất. Trả về số đơn đã hủy.
const expireUnpaidOrders = async ({ now = new Date() } = {}) => {
    const expired = await Order.find({ status: 'PENDING_PAYMENT', paymentDeadline: { $lt: now } }).select('_id');

    let cancelled = 0;
    for (const { _id } of expired) {
        try {
            await transitionAndRelease({
                orderId: _id,
                filter: {},
                from: 'PENDING_PAYMENT',
                to: 'CANCELLED',
                actorType: 'SYSTEM',
                reason: 'PAYMENT_TIMEOUT',
                set: { cancelReason: { code: 'PAYMENT_TIMEOUT', note: 'Quá hạn chưa nhận được thanh toán' } }
            });
            cancelled += 1;
        } catch (error) {
            // Tiền vừa về / khách vừa hủy cùng lúc -> bỏ qua
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
    transitionAndRelease,
    selfDeliverByOwner,
    redispatch,
    cancelByCustomer,
    acceptByOwner,
    rejectByOwner,
    cancelByOwner,
    advanceByOwner,
    cancelExpiredOrders,
    expireUnpaidOrders,
    resetDailyStock,
    releaseStock
};
