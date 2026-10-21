const mongoose = require('mongoose');

const Order = require('../order/order.model');
const Restaurant = require('../restaurant/restaurant.model');
const Shipper = require('./shipper.model');
const DispatchOffer = require('./dispatchOffer.model');
const routing = require('../routing/routing.service');
const { shippersOnShift } = require('../shift/shift.query');
const wallet = require('../wallet/wallet.service');
const notifications = require('../notification/notification.service');
const { emitDispatchOffer, emitDispatchCancelled, emitDeliveryChanged } = require('../../realtime/socket');
const AppError = require('../../utils/AppError');
const { fromPoint, toPoint } = require('../../utils/geo');

/**
 * Điều phối tài xế MAK (Kế hoạch triển khai Tài xế mục 5, BR-92).
 *  1. Lọc tài xế đã duyệt, trực tuyến, rảnh, vị trí mới (<= 2 phút), trong bán kính 5 km quanh quán ($near — không tốn lượt Goong)
 *  2. Lấy 10 người gần nhất theo đường thẳng, xếp hạng theo đường thật bằng Goong Distance Matrix (1 lần gọi)
 *  3. Mời người đứng đầu; 30 giây không trả lời / từ chối -> mời người kế tiếp; tối đa 5 lời mời / 3 phút
 *  4. Không ai nhận -> NO_SHIPPER, báo quán: tự giao / tìm lại / hủy (Q7)
 * Cập nhật nguyên tử theo `delivery.status`: hai bên cùng nhận một đơn -> chỉ một bên thắng.
 */

const settings = () => ({
    radiusKm: Number(process.env.DISPATCH_RADIUS_KM) || 5,
    candidates: Number(process.env.DISPATCH_CANDIDATES) || 10,
    offerSeconds: Number(process.env.DISPATCH_OFFER_SECONDS) || 30,
    maxOffers: Number(process.env.DISPATCH_MAX_OFFERS) || 5,
    searchMinutes: Number(process.env.DISPATCH_SEARCH_MINUTES) || 3,
    freshSeconds: Number(process.env.SHIPPER_LOCATION_FRESH_SECONDS) || 120,
    staleMinutes: Number(process.env.SHIPPER_STALE_MINUTES) || 5
});

// Đơn còn cần / đang có tài xế tới lấy (quán đã nhận, chưa giao đi)
const AWAITING_PICKUP = ['ACCEPTED', 'PREPARING', 'READY'];
// Bước giao còn đang chạy (tài xế giữ đơn)
const HOLDING = ['ASSIGNED', 'ARRIVED_AT_STORE', 'PICKED_UP'];

const isPlatformDelivery = (order) => order.deliveryMode === 'PLATFORM' && order.fulfillmentType === 'DELIVERY';

const toSnapshot = (shipper) => ({
    fullName: shipper.fullName,
    phone: shipper.phone,
    vehicleType: shipper.vehicleType,
    licensePlate: shipper.licensePlate
});

// Nội dung lời mời: chưa lộ SĐT / tên khách (chỉ hiện sau khi nhận đơn)
const offerPayload = (offer, order, restaurant) => ({
    offerId: String(offer._id),
    orderId: String(order._id),
    code: order.code,
    expiresAt: offer.expiresAt,
    toStoreKm: offer.distanceKm,
    toStoreMinutes: offer.durationMinutes,
    tripKm: order.route?.distanceKm ?? null,
    fee: order.shipperFee,
    itemsCount: order.items.reduce((s, l) => s + l.qty, 0),
    restaurant: { name: restaurant.name, address: restaurant.address, location: restaurant.location },
    dropoff: { addressLine: order.delivery?.addressLine, location: order.delivery?.location }
});

// ======================= Tìm + mời =======================

const findCandidates = async (order, storePoint, now) => {
    const s = settings();
    // Không mời lại người đã được mời trong lượt tìm này, và người đã hủy đơn này
    const excluded = await DispatchOffer.distinct('shipper', {
        order: order._id,
        $or: [{ createdAt: { $gte: order.delivery.searchStartedAt ?? new Date(0) } }, { status: 'WITHDRAWN' }]
    });

    const query = (extra) =>
        Shipper.find({
            status: 'APPROVED',
            isOnline: true,
            activeOrder: null,
            locationAt: { $gte: new Date(now.getTime() - s.freshSeconds * 1000) },
            dispatchBlockedUntil: { $not: { $gt: now } },
            location: { $near: { $geometry: toPoint(storePoint), $maxDistance: s.radiusKm * 1000 } },
            ...extra
        })
            .limit(s.candidates)
            .select('user fullName location');

    // Ưu tiên tài xế đang trong ca đã đăng ký (BR-100); không ai rảnh mới mời tài xế tự do
    const onShift = (await shippersOnShift(now)).filter((id) => !excluded.some((x) => String(x) === String(id)));
    if (onShift.length) {
        const preferred = await query({ _id: { $in: onShift } });
        if (preferred.length) {
            return preferred;
        }
    }
    return query({ _id: { $nin: excluded } });
};

const markNoShipper = async (orderId) => {
    const order = await Order.findOneAndUpdate(
        { _id: orderId, 'delivery.status': 'SEARCHING' },
        { $set: { 'delivery.status': 'NO_SHIPPER' } },
        { returnDocument: 'after' }
    );
    if (order) {
        emitDeliveryChanged(order);
        await notifications.deliveryNoShipper(order);
    }
    return null;
};

/**
 * Gửi lời mời kế tiếp cho đơn đang tìm tài xế. Gọi lại an toàn (đang có lời mời chờ thì bỏ qua).
 * Chưa có ai rảnh thì trả null — job mỗi 10 giây thử lại tới khi hết 3 phút.
 */
const offerNext = async (orderId, now = new Date()) => {
    const order = await Order.findById(orderId);
    if (!order || order.delivery?.status !== 'SEARCHING' || !AWAITING_PICKUP.includes(order.status)) {
        return null;
    }
    if (await DispatchOffer.exists({ order: order._id, status: 'OFFERED' })) {
        return null;
    }

    const s = settings();
    const attempts = order.delivery.attempts ?? 0;
    const startedAt = order.delivery.searchStartedAt ?? now;
    if (attempts >= s.maxOffers || now.getTime() - startedAt.getTime() >= s.searchMinutes * 60 * 1000) {
        return markNoShipper(order._id);
    }

    const restaurant = await Restaurant.findById(order.restaurant).select('name address location');
    const storePoint = fromPoint(restaurant?.location);
    if (!storePoint) {
        return markNoShipper(order._id);
    }

    const candidates = await findCandidates(order, storePoint, now);
    if (candidates.length === 0) {
        return null;
    }

    // Xếp theo thời gian đi thật tới quán (Goong Distance Matrix, lỗi thì ước lượng)
    const routes = await routing.getMatrix(candidates.map((c) => fromPoint(c.location)), storePoint);
    const [best] = candidates
        .map((shipper, i) => ({ shipper, route: routes[i] }))
        .sort((a, b) => a.route.durationMinutes - b.route.durationMinutes || a.route.distanceKm - b.route.distanceKm);

    let offer;
    try {
        offer = await DispatchOffer.create({
            order: order._id,
            shipper: best.shipper._id,
            distanceKm: best.route.distanceKm,
            durationMinutes: best.route.durationMinutes,
            attempt: attempts + 1,
            offeredAt: now,
            expiresAt: new Date(now.getTime() + s.offerSeconds * 1000)
        });
    } catch (error) {
        // Lượt chạy khác vừa mời cho đơn này (unique: 1 lời mời đang chờ / đơn)
        if (error.code === 11000) {
            return null;
        }
        throw error;
    }

    const updated = await Order.findOneAndUpdate(
        { _id: order._id, 'delivery.status': 'SEARCHING' },
        { $set: { 'delivery.attempts': attempts + 1 } },
        { returnDocument: 'after' }
    );
    if (!updated) {
        await DispatchOffer.updateOne({ _id: offer._id, status: 'OFFERED' }, { $set: { status: 'CANCELLED' } });
        return null;
    }

    emitDispatchOffer(best.shipper.user, offerPayload(offer, updated, restaurant));
    return offer;
};

/**
 * Bắt đầu tìm tài xế (quán vừa nhận đơn PLATFORM, quán bấm "Tìm lại", admin tìm lại).
 * Lỗi chỉ ghi log ở nơi gọi sau commit — job sẽ thử lại.
 * @returns đơn sau khi chuyển sang SEARCHING, hoặc null nếu không áp dụng
 */
const startDispatch = async (order, now = new Date()) => {
    if (!isPlatformDelivery(order)) {
        return null;
    }

    const updated = await Order.findOneAndUpdate(
        { _id: order._id, status: { $in: AWAITING_PICKUP }, 'delivery.status': { $in: [null, 'NO_SHIPPER'] } },
        { $set: { 'delivery.status': 'SEARCHING', 'delivery.searchStartedAt': now, 'delivery.attempts': 0 } },
        { returnDocument: 'after' }
    );
    if (!updated) {
        return null;
    }

    emitDeliveryChanged(updated);
    await offerNext(updated._id, now);
    return Order.findById(updated._id);
};

// ======================= Tài xế trả lời =======================

const offerNotOpen = () => new AppError(409, 'OFFER_EXPIRED', 'This offer is no longer available');

const acceptOffer = async ({ shipper, offerId, now = new Date() }) => {
    let order;

    await mongoose.connection.transaction(async (session) => {
        const offer = await DispatchOffer.findOneAndUpdate(
            { _id: offerId, shipper: shipper._id, status: 'OFFERED', expiresAt: { $gt: now } },
            { $set: { status: 'ACCEPTED', respondedAt: now } },
            { returnDocument: 'after', session }
        );
        if (!offer) {
            throw offerNotOpen();
        }

        const free = await Shipper.findOneAndUpdate(
            { _id: shipper._id, status: 'APPROVED', activeOrder: null },
            { $set: { activeOrder: offer.order } },
            { returnDocument: 'after', session }
        );
        if (!free) {
            throw new AppError(409, 'SHIPPER_BUSY', 'You are already delivering another order');
        }

        order = await Order.findOneAndUpdate(
            { _id: offer.order, status: { $in: AWAITING_PICKUP }, 'delivery.status': 'SEARCHING' },
            {
                $set: {
                    'delivery.status': 'ASSIGNED',
                    'delivery.shipper': shipper._id,
                    'delivery.shipperUser': shipper.user,
                    'delivery.shipperSnapshot': toSnapshot(free),
                    'delivery.assignedAt': now
                }
            },
            { returnDocument: 'after', session }
        );
        if (!order) {
            throw new AppError(409, 'ORDER_TAKEN', 'This order no longer needs a driver');
        }
    });

    emitDeliveryChanged(order);
    await notifications.deliveryAssigned(order);
    return order;
};

const declineOffer = async ({ shipper, offerId, now = new Date() }) => {
    const offer = await DispatchOffer.findOneAndUpdate(
        { _id: offerId, shipper: shipper._id, status: 'OFFERED' },
        { $set: { status: 'DECLINED', respondedAt: now } },
        { returnDocument: 'after' }
    );
    if (!offer) {
        throw offerNotOpen();
    }

    await offerNext(offer.order, now);
    return offer;
};

// Tài xế nghỉ / bị khóa: lời mời đang chờ coi như từ chối, mời người kế tiếp
const declineOpenOffers = async (shipperId, now = new Date()) => {
    const open = await DispatchOffer.find({ shipper: shipperId, status: 'OFFERED' }).select('_id order');
    for (const offer of open) {
        const { modifiedCount } = await DispatchOffer.updateOne(
            { _id: offer._id, status: 'OFFERED' },
            { $set: { status: 'DECLINED', respondedAt: now } }
        );
        if (modifiedCount) {
            await offerNext(offer.order, now);
        }
    }
};

// ======================= Thu hồi khi đơn bị hủy / quán tự giao =======================

/**
 * Gọi TRONG transaction hủy đơn / chuyển sang quán tự giao:
 * thu hồi lời mời đang chờ, trả tài xế đang nhận về trạng thái rảnh, bù tiền chuyến (nếu `compensate`).
 * @returns thông tin để báo sau commit (afterRelease)
 */
const releaseDispatch = async (order, session, { compensate = true } = {}) => {
    const openOffers = await DispatchOffer.find({ order: order._id, status: 'OFFERED' }).populate('shipper', 'user').session(session);
    if (openOffers.length) {
        await DispatchOffer.updateMany({ order: order._id, status: 'OFFERED' }, { $set: { status: 'CANCELLED' } }, { session });
    }

    const holding = order.delivery?.shipper && ['ASSIGNED', 'ARRIVED_AT_STORE'].includes(order.delivery.status);
    let compensation = 0;
    if (holding) {
        await Shipper.updateOne({ _id: order.delivery.shipper, activeOrder: order._id }, { $set: { activeOrder: null } }, { session });
        if (compensate) {
            const posted = await wallet.compensateShipper(order, order.delivery.shipper, session);
            compensation = posted ? wallet.shipperSettings().cancelCompensation : 0;
        }
    }

    return {
        offeredUsers: openOffers.map((o) => o.shipper?.user).filter(Boolean),
        assignedUser: holding ? order.delivery.shipperUser : null,
        compensation
    };
};

// Sau commit: báo các tài xế bị thu hồi lời mời / đơn
const afterRelease = async (order, info, reason) => {
    if (!info) {
        return;
    }
    info.offeredUsers.forEach((user) => emitDispatchCancelled(user, { orderId: String(order._id), code: order.code, reason: 'ORDER_CHANGED' }));
    if (info.assignedUser) {
        emitDispatchCancelled(info.assignedUser, { orderId: String(order._id), code: order.code, reason: 'ORDER_CANCELLED' });
        await notifications.deliveryCancelled(order, info.assignedUser, { compensation: info.compensation, reason });
    }
};

// ======================= Admin gán tay =======================

const assignByAdmin = async ({ orderId, shipperId, actor, now = new Date() }) => {
    let order;
    let replaced = [];

    await mongoose.connection.transaction(async (session) => {
        const current = await Order.findById(orderId).session(session);
        if (!current) {
            throw new AppError(404, 'NOT_FOUND', 'Order not found');
        }
        if (!isPlatformDelivery(current) || !AWAITING_PICKUP.includes(current.status) || !['SEARCHING', 'NO_SHIPPER'].includes(current.delivery?.status)) {
            throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'This order is not waiting for a driver');
        }

        const open = await DispatchOffer.find({ order: current._id, status: 'OFFERED' }).populate('shipper', 'user').session(session);
        replaced = open.map((o) => o.shipper?.user).filter(Boolean);
        await DispatchOffer.updateMany({ order: current._id, status: 'OFFERED' }, { $set: { status: 'CANCELLED' } }, { session });

        const shipper = await Shipper.findOneAndUpdate(
            { _id: shipperId, status: 'APPROVED', activeOrder: null, 'portrait.fileKey': { $exists: true } },
            { $set: { activeOrder: current._id } },
            { returnDocument: 'after', session }
        );
        if (!shipper) {
            throw new AppError(409, 'SHIPPER_BUSY', 'Driver is not approved, has no portrait or is delivering another order');
        }

        await DispatchOffer.create(
            [{ order: current._id, shipper: shipper._id, status: 'ACCEPTED', offeredAt: now, respondedAt: now, expiresAt: now, assignedBy: actor }],
            { session }
        );

        order = await Order.findOneAndUpdate(
            { _id: current._id, 'delivery.status': current.delivery.status },
            {
                $set: {
                    'delivery.status': 'ASSIGNED',
                    'delivery.shipper': shipper._id,
                    'delivery.shipperUser': shipper.user,
                    'delivery.shipperSnapshot': toSnapshot(shipper),
                    'delivery.assignedAt': now
                }
            },
            { returnDocument: 'after', session }
        );
        if (!order) {
            throw new AppError(409, 'ORDER_TAKEN', 'This order was just taken by another driver');
        }
    });

    replaced
        .filter((user) => String(user) !== String(order.delivery.shipperUser))
        .forEach((user) => emitDispatchCancelled(user, { orderId: String(order._id), code: order.code, reason: 'ASSIGNED_TO_OTHER' }));
    emitDeliveryChanged(order);
    await notifications.deliveryAssigned(order, { byAdmin: true });
    return order;
};

// ======================= Job mỗi 10 giây =======================

const expireOffers = async (now) => {
    const expired = await DispatchOffer.find({ status: 'OFFERED', expiresAt: { $lte: now } }).populate('shipper', 'user');
    let count = 0;
    for (const offer of expired) {
        const { modifiedCount } = await DispatchOffer.updateOne(
            { _id: offer._id, status: 'OFFERED' },
            { $set: { status: 'EXPIRED', respondedAt: now } }
        );
        if (modifiedCount) {
            count += 1;
            if (offer.shipper?.user) {
                emitDispatchCancelled(offer.shipper.user, { orderId: String(offer.order), offerId: String(offer._id), reason: 'EXPIRED' });
            }
            await offerNext(offer.order, now);
        }
    }
    return count;
};

// Tài xế đang giữ đơn mà không gửi vị trí quá N phút -> báo admin (1 lần / đơn)
const alertStaleDeliveries = async (now) => {
    const { staleMinutes } = settings();
    const orders = await Order.find({ 'delivery.status': { $in: HOLDING }, 'delivery.staleAlertAt': null }).select(
        'code delivery.shipper delivery.shipperSnapshot delivery.assignedAt'
    );
    if (orders.length === 0) {
        return 0;
    }

    const limit = new Date(now.getTime() - staleMinutes * 60 * 1000);
    const stale = await Shipper.find({
        _id: { $in: orders.map((o) => o.delivery.shipper) },
        $or: [{ locationAt: null }, { locationAt: { $lt: limit } }]
    }).distinct('_id');
    const staleIds = new Set(stale.map(String));

    let count = 0;
    for (const order of orders) {
        // Vừa nhận đơn chưa kịp gửi vị trí thì chưa tính
        if (!staleIds.has(String(order.delivery.shipper)) || order.delivery.assignedAt > limit) {
            continue;
        }
        const { modifiedCount } = await Order.updateOne(
            { _id: order._id, 'delivery.staleAlertAt': null },
            { $set: { 'delivery.staleAlertAt': now } }
        );
        if (modifiedCount) {
            count += 1;
            await notifications.deliveryStale(order, staleMinutes);
        }
    }
    return count;
};

/**
 * Job: hết hạn lời mời -> mời người kế tiếp; đơn đang tìm chưa có lời mời -> thử mời lại / hết giờ thì NO_SHIPPER;
 * cảnh báo mất vị trí. Trả về số việc đã làm (để ghi log).
 */
const dispatchTick = async ({ now = new Date() } = {}) => {
    let count = await expireOffers(now);

    const searching = await Order.find({ 'delivery.status': 'SEARCHING' }).select('_id');
    for (const { _id } of searching) {
        if (await offerNext(_id, now)) {
            count += 1;
        }
    }

    count += await alertStaleDeliveries(now);
    return count;
};

module.exports = {
    settings,
    AWAITING_PICKUP,
    HOLDING,
    isPlatformDelivery,
    toSnapshot,
    offerPayload,
    startDispatch,
    offerNext,
    acceptOffer,
    declineOffer,
    declineOpenOffers,
    releaseDispatch,
    afterRelease,
    assignByAdmin,
    dispatchTick
};
