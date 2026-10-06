const Order = require('./order.model');
const User = require('../user/user.model');
const { placeOrder, previewOrder, cancelByCustomer } = require('./order.service');
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

// Giao hàng: lấy từ sổ địa chỉ (addressId) hoặc nhập tay (delivery) — gửi một trong hai
const resolveDelivery = async (req) => {
    const { fulfillmentType = 'DELIVERY', addressId, delivery = {} } = req.body;

    if (fulfillmentType !== 'DELIVERY') {
        return undefined;
    }

    if (addressId) {
        const user = await User.findById(req.user.userId).select('addresses');
        const address = user?.addresses.id(addressId);

        if (!address) {
            throw new AppError(404, 'NOT_FOUND', 'Address not found');
        }

        return {
            receiverName: address.receiverName,
            phone: address.phone,
            addressLine: address.addressLine,
            note: delivery.note
        };
    }

    if (!delivery.receiverName || !delivery.phone || !delivery.addressLine) {
        throw new AppError(400, 'VALIDATION_ERROR', 'addressId or delivery { receiverName, phone, addressLine } is required', [
            { field: 'delivery', msg: 'Delivery address is required' }
        ]);
    }

    return {
        receiverName: delivery.receiverName,
        phone: delivery.phone,
        addressLine: delivery.addressLine,
        note: delivery.note
    };
};

// POST /orders/preview — tính tiền, không lưu, không trừ kho
const preview = asyncHandler(async (req, res) => {
    const { restaurantId, items, fulfillmentType = 'DELIVERY' } = req.body;
    const { restaurant, draft } = await previewOrder({ restaurantId, inputs: lineInputs(items), fulfillmentType });

    return res.status(200).json({
        success: true,
        data: {
            restaurant: { id: restaurant._id, name: restaurant.name, minOrderAmount: restaurant.minOrderAmount },
            items: draft.items.map(({ menuItem, ...line }) => ({ menuItemId: menuItem, ...line })),
            subtotal: draft.subtotal,
            deliveryFee: draft.deliveryFee,
            discount: draft.discount,
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

    const { restaurantId, items, fulfillmentType = 'DELIVERY', paymentMethod = 'COD' } = req.body;

    const { order, replayed } = await placeOrder({
        userId: req.user.userId,
        key,
        restaurantId,
        inputs: lineInputs(items),
        fulfillmentType,
        delivery: await resolveDelivery(req),
        paymentMethod
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

// POST /orders/:id/cancel { note? } — chỉ khi PLACED (BR-35)
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
    cancelMyOrder
};
