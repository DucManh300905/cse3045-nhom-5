const Order = require('./order.model');
const User = require('../user/user.model');
const { placeOrder, previewOrder, cancelByCustomer } = require('./order.service');
const { orderPaymentInfo } = require('../payment/payment.service');
const { toPoint, fromPoint, isLatLng } = require('../../utils/geo');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { getPagination, paginate } = require('../../utils/pagination');

// Khách không thấy số liệu nội bộ (hoa hồng)
const toCustomerOrder = (order) => {
    const data = order.toJSON();

    delete data.commissionRate;
    delete data.commissionAmount;

    return data;
};

const lineInputs = (items) =>
    items.map(({ menuItemId, variantId, optionIds, qty, note }) => ({ menuItemId, variantId, optionIds, qty, note }));

const locationRequired = () =>
    new AppError(422, 'LOCATION_REQUIRED', 'Pin the delivery location on the map', [
        { field: 'delivery.location', msg: 'Delivery location is required' }
    ]);

/**
 * Giao hàng: lấy từ sổ địa chỉ (addressId) hoặc nhập tay (delivery) — gửi một trong hai.
 * Vị trí (BR-81): địa chỉ trong sổ đã có tọa độ, hoặc gửi kèm delivery.lat / delivery.lng
 * (địa chỉ cũ chưa ghim -> lưu luôn tọa độ vừa ghim vào sổ). Bắt buộc khi đặt đơn giao tận nơi.
 * @param strict false khi xem trước: thiếu thông tin thì trả những gì có, không báo lỗi
 */
const resolveDelivery = async (req, { strict = true } = {}) => {
    const { fulfillmentType = 'DELIVERY', addressId, delivery = {} } = req.body;

    if (fulfillmentType !== 'DELIVERY') {
        return undefined;
    }

    const pinned = isLatLng(delivery) ? { lat: Number(delivery.lat), lng: Number(delivery.lng) } : null;

    if (addressId) {
        const user = await User.findById(req.user.userId).select('addresses');
        const address = user?.addresses.id(addressId);

        if (!address) {
            throw new AppError(404, 'NOT_FOUND', 'Address not found');
        }

        let point = fromPoint(address.location);
        if (!point && pinned && strict) {
            // Cập nhật đúng 1 địa chỉ (user chỉ tải phần addresses nên không save() cả document)
            await User.updateOne(
                { _id: req.user.userId, 'addresses._id': addressId },
                { $set: { 'addresses.$.location': toPoint(pinned) } }
            );
        }
        point = point ?? pinned;
        if (!point && strict) {
            throw locationRequired();
        }

        return {
            receiverName: address.receiverName,
            phone: address.phone,
            addressLine: address.addressLine,
            note: delivery.note,
            ...(point && { location: toPoint(point) })
        };
    }

    if (!strict) {
        return pinned ? { location: toPoint(pinned) } : undefined;
    }

    if (!delivery.receiverName || !delivery.phone || !delivery.addressLine) {
        throw new AppError(400, 'VALIDATION_ERROR', 'addressId or delivery { receiverName, phone, addressLine } is required', [
            { field: 'delivery', msg: 'Delivery address is required' }
        ]);
    }
    if (!pinned) {
        throw locationRequired();
    }

    return {
        receiverName: delivery.receiverName,
        phone: delivery.phone,
        addressLine: delivery.addressLine,
        note: delivery.note,
        location: toPoint(pinned)
    };
};

// POST /orders/preview — tính tiền, không lưu, không trừ kho
const preview = asyncHandler(async (req, res) => {
    const { restaurantId, items, fulfillmentType = 'DELIVERY', voucherCodes = [], paymentMethod = 'COD' } = req.body;
    const { restaurant, draft } = await previewOrder({
        restaurantId,
        inputs: lineInputs(items),
        fulfillmentType,
        voucherCodes,
        userId: req.user.userId,
        paymentMethod,
        delivery: await resolveDelivery(req, { strict: false })
    });

    return res.status(200).json({
        success: true,
        data: {
            restaurant: { id: restaurant._id, name: restaurant.name, minOrderAmount: restaurant.minOrderAmount },
            items: draft.items.map(({ menuItem, ...line }) => ({ menuItemId: menuItem, ...line })),
            subtotal: draft.subtotal,
            deliveryFee: draft.deliveryFee,
            discount: draft.discount,
            restaurantDiscount: draft.restaurantDiscount,
            platformDiscount: draft.platformDiscount,
            vouchers: draft.vouchers.map(({ voucher: id, ...v }) => ({ id, ...v })),
            // Giao tận nơi đã có vị trí: quãng đường + thời gian (null nếu chưa ghim / quán chưa có vị trí)
            route: draft.route ?? null,
            estimatedDeliveryMinutes: draft.estimatedDeliveryMinutes ?? null,
            total: draft.total
        }
    });
});

// POST /orders — header Idempotency-Key bắt buộc (BR-38)
const createOrder = asyncHandler(async (req, res) => {
    const key = req.get('Idempotency-Key');

    if (!key || key.length > 100) {
        throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required (max 100 characters)');
    }

    const { restaurantId, items, fulfillmentType = 'DELIVERY', paymentMethod = 'COD', voucherCodes = [] } = req.body;

    const { order, replayed } = await placeOrder({
        userId: req.user.userId,
        key,
        restaurantId,
        inputs: lineInputs(items),
        fulfillmentType,
        delivery: await resolveDelivery(req),
        paymentMethod,
        voucherCodes
    });

    return res.status(replayed ? 200 : 201).json({
        success: true,
        message: replayed ? 'Order already placed' : 'Order placed successfully',
        data: toCustomerOrder(order)
    });
});

// GET /orders?status=PLACED,ACCEPTED&page=&limit=
const listMyOrders = asyncHandler(async (req, res) => {
    const filter = { customer: req.user.userId };

    if (req.query.status) {
        filter.status = { $in: String(req.query.status).split(',') };
    }

    const result = await paginate(Order, filter, getPagination(req), { sort: { createdAt: -1 } });

    return res.status(200).json({
        success: true,
        data: { ...result, items: result.items.map(toCustomerOrder) }
    });
});

// GET /orders/:id — đơn của người khác trả 404
const getMyOrder = asyncHandler(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, customer: req.user.userId });

    if (!order) {
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
    }

    return res.status(200).json({
        success: true,
        data: toCustomerOrder(order)
    });
});

// GET /orders/:id/payment — mã VietQR, số tiền, nội dung, hạn thanh toán (đơn trả trước)
const getMyOrderPayment = asyncHandler(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, customer: req.user.userId });

    if (!order || order.paymentMethod !== 'BANK_TRANSFER') {
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
    }

    return res.status(200).json({ success: true, data: orderPaymentInfo(order) });
});

// POST /orders/:id/cancel { note? } — khi PENDING_PAYMENT hoặc PLACED (BR-35)
const cancelMyOrder = asyncHandler(async (req, res) => {
    const order = await cancelByCustomer({
        orderId: req.params.id,
        userId: req.user.userId,
        note: req.body?.note
    });

    return res.status(200).json({
        success: true,
        message: 'Order cancelled',
        data: toCustomerOrder(order)
    });
});

module.exports = {
    preview,
    createOrder,
    listMyOrders,
    getMyOrder,
    getMyOrderPayment,
    cancelMyOrder
};
