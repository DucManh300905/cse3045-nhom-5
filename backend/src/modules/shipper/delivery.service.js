const mongoose = require('mongoose');
const path = require('path');

const Order = require('../order/order.model');
const Restaurant = require('../restaurant/restaurant.model');
const Shipper = require('./shipper.model');
const DispatchOffer = require('./dispatchOffer.model');
const dispatch = require('./dispatch.service');
const orderService = require('../order/order.service');
const wallet = require('../wallet/wallet.service');
const routing = require('../routing/routing.service');
const notifications = require('../notification/notification.service');
const penalty = require('../shift/penalty.service');
const { ShiftAssignment } = require('../shift/shift.models');
const { emitOrderStatusChanged, emitDeliveryChanged, emitShipperLocation } = require('../../realtime/socket');
const { removeFile } = require('../../middlewares/upload.middleware');
const { PRIVATE_DIR } = require('../../config/storage');
const AppError = require('../../utils/AppError');
const { fromPoint, toPoint, haversineKm } = require('../../utils/geo');

/**
 * Tài xế làm việc (Kế hoạch triển khai Tài xế mục 4, 6): trực tuyến / nghỉ, gửi vị trí,
 * các bước giao (tới quán -> lấy hàng -> chụp ảnh giao), giao thất bại, hủy đơn đã nhận.
 */

const MIN_LOCATION_INTERVAL_MS = 3000;
// Nhanh hơn mức này = GPS nhảy / giả vị trí -> bỏ qua điểm (BR-96)
const MAX_SPEED_KMH = 80;
// Giờ đến dự kiến tính lại tối đa mỗi phút (tiết kiệm lượt Goong)
const ETA_REFRESH_MS = 60 * 1000;

// ======================= Hồ sơ đang làm việc =======================

const profileRequired = () => new AppError(404, 'SHIPPER_PROFILE_REQUIRED', 'Create your driver profile first');

const findShipper = async (userId) => {
    const shipper = await Shipper.findOne({ user: userId });
    if (!shipper) {
        throw profileRequired();
    }
    return shipper;
};

// Nhận đơn / trực tuyến: chỉ hồ sơ đã duyệt
const requireApproved = (shipper) => {
    if (shipper.status !== 'APPROVED') {
        throw new AppError(403, 'SHIPPER_NOT_APPROVED', 'Your driver profile is not approved');
    }
    return shipper;
};

// ======================= Trực tuyến / nghỉ / vị trí =======================

const goOnline = async ({ shipper, lat, lng, now = new Date() }) => {
    requireApproved(shipper);
    if (shipper.dispatchBlockedUntil && shipper.dispatchBlockedUntil > now) {
        throw new AppError(409, 'SHIPPER_DISPATCH_BLOCKED', 'You are temporarily locked from taking orders', [
            { field: 'dispatchBlockedUntil', until: shipper.dispatchBlockedUntil, reason: shipper.dispatchBlockReason }
        ]);
    }

    const set = { isOnline: true };
    if (lat !== undefined && lng !== undefined) {
        Object.assign(set, { location: toPoint({ lat, lng }), locationAt: now });
    }
    const updated = await Shipper.findByIdAndUpdate(shipper._id, { $set: set }, { returnDocument: 'after' });
    // Đang trong ca đã đăng ký -> tính là đã đi làm (BR-101: hoạt động = bật trực tuyến)
    await ShiftAssignment.updateMany(
        { shipper: shipper._id, status: 'REGISTERED', startAt: { $lte: now }, endAt: { $gt: now } },
        { $set: { status: 'ACTIVE', activeAt: now } }
    );
    return updated;
};

const goOffline = async ({ shipper, now = new Date() }) => {
    if (shipper.activeOrder) {
        throw new AppError(409, 'SHIPPER_BUSY', 'Finish your current delivery before going offline');
    }
    const updated = await Shipper.findByIdAndUpdate(shipper._id, { $set: { isOnline: false } }, { returnDocument: 'after' });
    await dispatch.declineOpenOffers(shipper._id, now);
    return updated;
};

/** Đích hiện tại của tài xế: chưa lấy hàng -> quán, đã lấy -> khách */
const targetOf = async (order) => {
    if (order.delivery.status === 'PICKED_UP') {
        return { target: 'CUSTOMER', point: fromPoint(order.delivery.location) };
    }
    const restaurant = await Restaurant.findById(order.restaurant).select('location').lean();
    return { target: 'STORE', point: fromPoint(restaurant?.location) };
};

/**
 * Cập nhật vị trí (mỗi 5 giây khi đang giao, 30 giây khi rảnh — app tài xế tự chọn nhịp).
 * Không lưu hành trình: chỉ ghi đè vị trí hiện tại. Đang giao -> đẩy vị trí + giờ đến dự kiến cho khách và quán của đơn đó.
 * @returns { accepted, reason?, eta? }
 */
const updateLocation = async ({ shipper, lat, lng, now = new Date() }) => {
    const point = { lat, lng };
    const last = fromPoint(shipper.location);

    if (last && shipper.locationAt) {
        const elapsedMs = now.getTime() - shipper.locationAt.getTime();
        if (elapsedMs < MIN_LOCATION_INTERVAL_MS) {
            return { accepted: false, reason: 'TOO_FREQUENT' };
        }
        const speedKmh = haversineKm(last, point) / (elapsedMs / 3600000);
        if (speedKmh > MAX_SPEED_KMH) {
            return { accepted: false, reason: 'IMPLAUSIBLE_SPEED' };
        }
    }

    await Shipper.updateOne({ _id: shipper._id }, { $set: { location: toPoint(point), locationAt: now } });

    if (!shipper.activeOrder) {
        return { accepted: true };
    }

    const order = await Order.findOne({ _id: shipper.activeOrder, 'delivery.shipper': shipper._id, 'delivery.status': { $in: dispatch.HOLDING } });
    if (!order) {
        return { accepted: true };
    }

    const saved = order.delivery.eta;
    let eta = saved?.minutes != null ? { minutes: saved.minutes, target: saved.target, updatedAt: saved.updatedAt } : null;
    const { target, point: to } = await targetOf(order);
    const stale = !order.delivery.eta?.updatedAt || order.delivery.eta.target !== target || now - order.delivery.eta.updatedAt >= ETA_REFRESH_MS;
    if (to && stale) {
        const route = await routing.getRoute(point, to);
        eta = { minutes: route.durationMinutes, target, updatedAt: now };
    }

    await Order.updateOne({ _id: order._id }, { $set: { ...(eta && { 'delivery.eta': eta }), 'delivery.staleAlertAt': null } });
    emitShipperLocation(order, { lat, lng, at: now, eta });
    return { accepted: true, eta };
};

// ======================= Các bước giao =======================

const notHolding = () => new AppError(409, 'INVALID_STATUS_TRANSITION', 'This step is not available for the order right now');

const myOrderFilter = (shipper, statuses) => ({ 'delivery.shipper': shipper._id, 'delivery.status': { $in: statuses } });

// Tới quán (ASSIGNED -> ARRIVED_AT_STORE): báo quán chuẩn bị giao món
const arrivedAtStore = async ({ shipper, orderId, now = new Date() }) => {
    const order = await Order.findOneAndUpdate(
        { _id: orderId, ...myOrderFilter(shipper, ['ASSIGNED']), status: { $in: dispatch.AWAITING_PICKUP } },
        { $set: { 'delivery.status': 'ARRIVED_AT_STORE', 'delivery.arrivedAt': now, 'delivery.eta': null } },
        { returnDocument: 'after' }
    );
    if (!order) {
        throw notHolding();
    }
    emitDeliveryChanged(order);
    return order;
};

// Lấy hàng: READY (hoặc PREPARING nếu quán quên bấm "Món đã xong") -> DELIVERING
const pickedUp = async ({ shipper, orderId, now = new Date() }) => {
    const current = await Order.findOne({ _id: orderId, ...myOrderFilter(shipper, ['ASSIGNED', 'ARRIVED_AT_STORE']) });
    if (!current || !['PREPARING', 'READY'].includes(current.status)) {
        throw notHolding();
    }

    const order = await orderService.transitionOrder({
        orderId,
        filter: myOrderFilter(shipper, ['ASSIGNED', 'ARRIVED_AT_STORE']),
        from: current.status,
        to: 'DELIVERING',
        actorType: 'SHIPPER',
        actor: shipper.user,
        set: { 'delivery.status': 'PICKED_UP', 'delivery.pickedUpAt': now, 'delivery.eta': null }
    });

    emitOrderStatusChanged(order);
    emitDeliveryChanged(order);
    await notifications.orderStatusChanged(order);
    return order;
};

const proofOf = (file, kind, now) => ({
    kind,
    fileKey: `delivery-proofs/${file.filename}`,
    mimeType: file.mimetype,
    takenAt: now
});

/**
 * Giao xong + ảnh xác nhận (Q8): DELIVERING -> COMPLETED; trong cùng transaction ghi sổ
 * (quán nhận tiền hàng, tài xế nhận tiền công, MAK chịu phí ship) và trả tài xế về rảnh.
 */
const delivered = async ({ shipper, orderId, file, now = new Date() }) => {
    let order;
    let posted;

    try {
        await mongoose.connection.transaction(async (session) => {
            order = await orderService.transitionOrder({
                orderId,
                filter: myOrderFilter(shipper, ['PICKED_UP']),
                from: 'DELIVERING',
                to: 'COMPLETED',
                actorType: 'SHIPPER',
                actor: shipper.user,
                set: {
                    'delivery.status': 'DELIVERED',
                    'delivery.deliveredAt': now,
                    'delivery.proof': proofOf(file, 'DELIVERED', now),
                    'delivery.eta': null
                },
                session
            });

            posted = await wallet.settleOrder(order, session);
            if (order.shipperFee > 0) {
                await wallet.payShipperFee(order, session);
            }
            // Giao thành công -> bộ đếm trả đơn liên tiếp về 0
            await Shipper.updateOne(
                { _id: shipper._id, activeOrder: order._id },
                { $set: { activeOrder: null, consecutiveWithdrawals: 0 }, $inc: { completedCount: 1 } },
                { session }
            );
        });
    } catch (error) {
        removeFile(file.path);
        throw error;
    }

    await wallet.afterPosting(posted);
    emitOrderStatusChanged(order);
    emitDeliveryChanged(order);
    await notifications.orderStatusChanged(order);
    if (order.shipperFee > 0) {
        await notifications.shipperEarning(order, shipper.user, order.shipperFee);
    }
    return order;
};

/**
 * Giao thất bại (khách không nghe máy / không có mặt sau 10 phút chờ — kế hoạch mục 4.2):
 * chụp ảnh tại chỗ + lý do, đơn giữ DELIVERING chờ admin quyết định (resolveFailedDelivery).
 */
const failed = async ({ shipper, orderId, file, reason, now = new Date() }) => {
    let order;
    try {
        await mongoose.connection.transaction(async (session) => {
            order = await Order.findOneAndUpdate(
                { _id: orderId, ...myOrderFilter(shipper, ['PICKED_UP']), status: 'DELIVERING' },
                {
                    $set: {
                        'delivery.status': 'FAILED',
                        'delivery.failedAt': now,
                        'delivery.failReason': reason,
                        'delivery.proof': proofOf(file, 'FAILED', now),
                        'delivery.eta': null
                    }
                },
                { returnDocument: 'after', session }
            );
            if (!order) {
                throw notHolding();
            }
            await Shipper.updateOne({ _id: shipper._id, activeOrder: order._id }, { $set: { activeOrder: null } }, { session });
        });
    } catch (error) {
        removeFile(file.path);
        throw error;
    }

    emitDeliveryChanged(order);
    await notifications.deliveryFailed(order);
    return order;
};

/**
 * Tài xế trả đơn đã nhận (chưa lấy hàng) -> tìm tài xế khác. Trả 3 đơn liên tiếp -> khóa nhận đơn 1 ngày (BR-102).
 */
const withdraw = async ({ shipper, orderId, reason, now = new Date() }) => {
    let order;

    await mongoose.connection.transaction(async (session) => {
        order = await Order.findOneAndUpdate(
            { _id: orderId, ...myOrderFilter(shipper, ['ASSIGNED', 'ARRIVED_AT_STORE']), status: { $in: dispatch.AWAITING_PICKUP } },
            {
                $set: { 'delivery.status': 'SEARCHING', 'delivery.searchStartedAt': now, 'delivery.attempts': 0 },
                $unset: {
                    'delivery.shipper': 1,
                    'delivery.shipperUser': 1,
                    'delivery.shipperSnapshot': 1,
                    'delivery.assignedAt': 1,
                    'delivery.arrivedAt': 1,
                    'delivery.eta': 1
                }
            },
            { returnDocument: 'after', session }
        );
        if (!order) {
            throw notHolding();
        }
        await DispatchOffer.updateMany(
            { order: order._id, shipper: shipper._id, status: 'ACCEPTED' },
            { $set: { status: 'WITHDRAWN', respondedAt: now } },
            { session }
        );
        await Shipper.updateOne({ _id: shipper._id, activeOrder: order._id }, { $set: { activeOrder: null } }, { session });
    });

    const { blocked } = await penalty.recordWithdrawal(shipper._id, now);

    emitDeliveryChanged(order);
    await dispatch.offerNext(order._id, now);
    return { order: await Order.findById(order._id), blocked, reason };
};

// ======================= Admin xử lý giao thất bại =======================

/**
 * action COMPLETE: khách đã nhận sau đó (hoặc admin xác nhận đã giao) -> hoàn thành, ghi sổ như giao thường.
 * action CANCEL: hủy + hoàn tiền khách (đơn trả trước); món đã làm nên không hoàn suất.
 * Tài xế đã chạy chuyến -> vẫn nhận tiền công trong cả hai trường hợp.
 */
const resolveFailedDelivery = async ({ orderId, action, note, actor }) => {
    const current = await Order.findOne({ _id: orderId, 'delivery.status': 'FAILED', status: 'DELIVERING' });
    if (!current) {
        throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'This order has no failed delivery to resolve');
    }

    if (action === 'CANCEL') {
        return orderService.transitionAndRelease({
            orderId,
            filter: { 'delivery.status': 'FAILED' },
            from: 'DELIVERING',
            to: 'CANCELLED',
            actorType: 'ADMIN',
            actor,
            reason: note || 'DELIVERY_FAILED',
            set: { cancelReason: { code: 'DELIVERY_FAILED', note } },
            keepStock: true,
            during: (order, session) => (order.shipperFee > 0 ? wallet.payShipperFee(order, session) : null)
        });
    }

    let order;
    let posted;
    await mongoose.connection.transaction(async (session) => {
        order = await orderService.transitionOrder({
            orderId,
            filter: { 'delivery.status': 'FAILED' },
            from: 'DELIVERING',
            to: 'COMPLETED',
            actorType: 'ADMIN',
            actor,
            reason: note,
            set: { 'delivery.status': 'DELIVERED', 'delivery.deliveredAt': new Date() },
            session
        });
        posted = await wallet.settleOrder(order, session);
        if (order.shipperFee > 0) {
            await wallet.payShipperFee(order, session);
        }
    });

    await wallet.afterPosting(posted);
    emitOrderStatusChanged(order);
    emitDeliveryChanged(order);
    await notifications.orderStatusChanged(order);
    return order;
};

// ======================= Theo dõi / ảnh / đánh giá =======================

/**
 * Thông tin theo dõi cho khách / quán / admin: tài xế, vị trí (chỉ khi tài xế đang giữ đơn — BR-97), giờ đến dự kiến.
 */
const trackingOf = async (order) => {
    const holding = dispatch.HOLDING.includes(order.delivery?.status);
    const [restaurant, shipper] = await Promise.all([
        Restaurant.findById(order.restaurant).select('name address location').lean(),
        holding && order.delivery?.shipper ? Shipper.findById(order.delivery.shipper).select('location locationAt ratingAvg ratingCount').lean() : null
    ]);

    return {
        orderId: order._id,
        code: order.code,
        status: order.status,
        deliveryMode: order.deliveryMode ?? null,
        deliveryStatus: order.delivery?.status ?? null,
        shipper: order.delivery?.shipperSnapshot?.fullName
            ? { ...order.delivery.shipperSnapshot, ratingAvg: shipper?.ratingAvg ?? null, ratingCount: shipper?.ratingCount ?? null }
            : null,
        location: shipper && fromPoint(shipper.location) ? { ...fromPoint(shipper.location), at: shipper.locationAt } : null,
        eta: holding ? (order.delivery.eta ?? null) : null,
        store: restaurant ? { name: restaurant.name, address: restaurant.address, location: fromPoint(restaurant.location) } : null,
        dropoff: order.delivery ? { addressLine: order.delivery.addressLine, location: fromPoint(order.delivery.location) } : null,
        polyline: order.route?.polyline ?? null
    };
};

/** Đường dẫn file ảnh xác nhận (đã kiểm tra quyền ở controller); không có -> 404 */
const proofFilePath = (order) => {
    const key = order.delivery?.proof?.fileKey;
    if (!key) {
        throw new AppError(404, 'NOT_FOUND', 'Delivery photo not found');
    }
    const filePath = path.resolve(PRIVATE_DIR, key);
    if (!filePath.startsWith(path.resolve(PRIVATE_DIR) + path.sep)) {
        throw new AppError(404, 'NOT_FOUND', 'Delivery photo not found');
    }
    return filePath;
};

// Khách đánh giá tài xế 1–5 sao sau khi nhận hàng (1 lần / đơn)
const rateShipper = async ({ userId, orderId, stars, comment }) => {
    const order = await Order.findOneAndUpdate(
        {
            _id: orderId,
            customer: userId,
            status: 'COMPLETED',
            deliveryMode: 'PLATFORM',
            'delivery.shipper': { $ne: null },
            'delivery.rating.stars': { $exists: false }
        },
        { $set: { 'delivery.rating': { stars, comment, at: new Date() } } },
        { returnDocument: 'after' }
    );
    if (!order) {
        const exists = await Order.findOne({ _id: orderId, customer: userId }).select('status deliveryMode delivery.rating');
        if (!exists) {
            throw new AppError(404, 'NOT_FOUND', 'Order not found');
        }
        throw new AppError(409, exists.delivery?.rating?.stars ? 'ALREADY_RATED' : 'INVALID_STATUS_TRANSITION', 'This order cannot be rated');
    }

    // Cập nhật điểm trung bình nguyên tử (driver gốc để dùng pipeline)
    await Shipper.collection.updateOne({ _id: order.delivery.shipper }, [
        { $set: { ratingSum: { $add: [{ $ifNull: ['$ratingSum', 0] }, stars] }, ratingCount: { $add: [{ $ifNull: ['$ratingCount', 0] }, 1] } } },
        { $set: { ratingAvg: { $round: [{ $divide: ['$ratingSum', '$ratingCount'] }, 2] } } }
    ]);
    return order;
};

module.exports = {
    findShipper,
    requireApproved,
    goOnline,
    goOffline,
    updateLocation,
    arrivedAtStore,
    pickedUp,
    delivered,
    failed,
    withdraw,
    resolveFailedDelivery,
    trackingOf,
    proofFilePath,
    rateShipper
};
