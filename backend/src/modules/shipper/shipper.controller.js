const fs = require('fs');
const path = require('path');

const Shipper = require('./shipper.model');
const DispatchOffer = require('./dispatchOffer.model');
const Order = require('../order/order.model');
const Restaurant = require('../restaurant/restaurant.model');
const Payout = require('../wallet/payout.model');
const User = require('../user/user.model');
const WalletEntry = require('../wallet/walletEntry.model');
const delivery = require('./delivery.service');
const dispatch = require('./dispatch.service');
const walletService = require('../wallet/wallet.service');
const notifications = require('../notification/notification.service');
const { toShipperResponse, toShipperOrder, withProofUrl } = require('./shipper.serializer');
const { removeFile } = require('../../middlewares/upload.middleware');
const { PRIVATE_DIR } = require('../../config/storage');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { getPagination, paginate } = require('../../utils/pagination');

const ok = (res, data, status = 200, message) => res.status(status).json({ success: true, ...(message && { message }), data });

// Giấy tờ bắt buộc khi nộp hồ sơ: CCCD luôn cần; xe máy cần thêm bằng lái + đăng ký xe + biển số
const requiredDocuments = (vehicleType) => (vehicleType === 'MOTORBIKE' ? ['ID_CARD', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION'] : ['ID_CARD']);

const PROFILE_FIELDS = ['fullName', 'phone', 'idNumber', 'vehicleType', 'licensePlate'];

const me = (req) => delivery.findShipper(req.user.userId);

// Đang chờ duyệt / đã duyệt thì không sửa hồ sơ, giấy tờ (đổi xe sau khi duyệt: liên hệ admin)
const assertEditable = (shipper) => {
    if (!['DRAFT', 'REJECTED'].includes(shipper.status)) {
        throw new AppError(409, 'SHIPPER_PROFILE_LOCKED', 'Profile cannot be changed after submission');
    }
};

// ======================= Hồ sơ =======================

// POST /shipper/profile
const createProfile = asyncHandler(async (req, res) => {
    if (await Shipper.exists({ user: req.user.userId })) {
        throw new AppError(409, 'SHIPPER_PROFILE_EXISTS', 'You already have a driver profile');
    }
    const shipper = new Shipper({ user: req.user.userId });
    PROFILE_FIELDS.forEach((f) => req.body[f] !== undefined && (shipper[f] = req.body[f]));

    try {
        await shipper.save();
    } catch (error) {
        if (error.code === 11000) {
            throw new AppError(409, 'SHIPPER_PROFILE_EXISTS', 'You already have a driver profile');
        }
        throw error;
    }
    return ok(res, toShipperResponse(shipper), 201);
});

// Kèm email tài khoản: tài xế bắt buộc có email đã xác thực (BR-103)
const withAccount = async (shipper) => {
    const user = await User.findById(shipper.user).select('email emailVerified').lean();
    return { ...toShipperResponse(shipper), email: user?.email ?? null, emailVerified: Boolean(user?.email && user.emailVerified) };
};

// GET /shipper/profile
const getProfile = asyncHandler(async (req, res) => ok(res, await withAccount(await me(req))));

// PUT /shipper/profile
const updateProfile = asyncHandler(async (req, res) => {
    const shipper = await me(req);
    assertEditable(shipper);
    PROFILE_FIELDS.forEach((f) => req.body[f] !== undefined && (shipper[f] = req.body[f]));
    await shipper.save();
    return ok(res, toShipperResponse(shipper));
});

// POST /shipper/profile/documents — multipart: type + file. Cùng loại thì thay file cũ.
const uploadDocument = asyncHandler(async (req, res) => {
    let shipper;
    try {
        shipper = await me(req);
        assertEditable(shipper);
        if (!Shipper.SHIPPER_DOCUMENT_TYPES.includes(req.body.type)) {
            throw new AppError(400, 'VALIDATION_ERROR', `type must be one of ${Shipper.SHIPPER_DOCUMENT_TYPES.join(', ')}`);
        }
    } catch (error) {
        removeFile(req.file.path);
        throw error;
    }

    const { type } = req.body;
    const old = shipper.documents.find((d) => d.type === type);
    shipper.documents = shipper.documents.filter((d) => d.type !== type);
    shipper.documents.push({
        type,
        fileKey: `shipper-documents/${req.file.filename}`,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype
    });
    await shipper.save();
    removeFile(old && path.join(PRIVATE_DIR, old.fileKey));

    return ok(res, toShipperResponse(shipper));
});

// POST /shipper/profile/submit — DRAFT | REJECTED -> SUBMITTED
const submitProfile = asyncHandler(async (req, res) => {
    const shipper = await me(req);
    if (!['DRAFT', 'REJECTED'].includes(shipper.status)) {
        throw new AppError(409, 'INVALID_STATUS_TRANSITION', `Cannot submit a profile with status ${shipper.status}`);
    }

    const missing = requiredDocuments(shipper.vehicleType)
        .filter((type) => !shipper.documents.some((d) => d.type === type))
        .map((type) => ({ field: 'documents', msg: `Document ${type} is required` }));
    if (shipper.vehicleType === 'MOTORBIKE' && !shipper.licensePlate) {
        missing.push({ field: 'licensePlate', msg: 'License plate is required' });
    }
    const account = await User.findById(shipper.user).select('email emailVerified').lean();
    if (!account?.email || !account.emailVerified) {
        missing.push({ field: 'email', msg: 'A verified email is required' });
    }
    if (missing.length) {
        throw new AppError(422, 'PROFILE_INCOMPLETE', 'Driver profile is incomplete', missing);
    }

    shipper.status = 'SUBMITTED';
    shipper.submittedAt = new Date();
    shipper.rejectReason = undefined;
    await shipper.save();
    await notifications.shipperSubmitted(shipper);

    return ok(res, await withAccount(shipper), 200, 'Driver profile submitted for review');
});

// PUT /shipper/bank-account
const updateBankAccount = asyncHandler(async (req, res) => {
    const shipper = await me(req);
    const { bankName, accountNumber, accountName } = req.body;
    shipper.bankAccount = { bankName, accountNumber, accountName: accountName.toUpperCase() };
    await shipper.save();
    return ok(res, shipper.bankAccount);
});

// ======================= Làm việc =======================

const storeOf = (order) => Restaurant.findById(order.restaurant).select('location').lean();

/** GET /shipper/state — trạng thái để mở app: hồ sơ, lời mời đang chờ, đơn đang giao */
const getState = asyncHandler(async (req, res) => {
    const shipper = await me(req);
    const now = new Date();
    const [offer, active] = await Promise.all([
        DispatchOffer.findOne({ shipper: shipper._id, status: 'OFFERED', expiresAt: { $gt: now } }),
        shipper.activeOrder ? Order.findById(shipper.activeOrder) : null
    ]);

    let offerData = null;
    if (offer) {
        const order = await Order.findById(offer.order);
        const restaurant = order && (await Restaurant.findById(order.restaurant).select('name address location'));
        offerData = order && restaurant ? dispatch.offerPayload(offer, order, restaurant) : null;
    }

    return ok(res, {
        shipper: await withAccount(shipper),
        offer: offerData,
        activeOrder: active ? toShipperOrder(active, await storeOf(active)) : null
    });
});

// POST /shipper/online { lat?, lng? }
const goOnline = asyncHandler(async (req, res) => {
    const shipper = await delivery.goOnline({ shipper: await me(req), lat: req.body?.lat, lng: req.body?.lng });
    return ok(res, toShipperResponse(shipper));
});

// POST /shipper/offline
const goOffline = asyncHandler(async (req, res) => ok(res, toShipperResponse(await delivery.goOffline({ shipper: await me(req) }))));

// POST /shipper/location { lat, lng }
const updateLocation = asyncHandler(async (req, res) => {
    const shipper = delivery.requireApproved(await me(req));
    return ok(res, await delivery.updateLocation({ shipper, lat: req.body.lat, lng: req.body.lng }));
});

// POST /shipper/offers/:id/accept
const acceptOffer = asyncHandler(async (req, res) => {
    const shipper = delivery.requireApproved(await me(req));
    const order = await dispatch.acceptOffer({ shipper, offerId: req.params.id });
    return ok(res, toShipperOrder(order, await storeOf(order)), 200, 'Order accepted');
});

// POST /shipper/offers/:id/decline
const declineOffer = asyncHandler(async (req, res) => {
    await dispatch.declineOffer({ shipper: await me(req), offerId: req.params.id });
    return ok(res, null, 200, 'Offer declined');
});

// GET /shipper/orders — lịch sử đơn đã nhận
const listOrders = asyncHandler(async (req, res) => {
    const shipper = await me(req);
    const result = await paginate(Order, { 'delivery.shipper': shipper._id }, getPagination(req), { sort: { createdAt: -1, _id: -1 } });
    return ok(res, { ...result, items: result.items.map((o) => toShipperOrder(o)) });
});

const findMyOrder = async (shipper, id) => {
    const order = await Order.findOne({ _id: id, 'delivery.shipper': shipper._id });
    if (!order) {
        throw new AppError(404, 'NOT_FOUND', 'Order not found');
    }
    return order;
};

// GET /shipper/orders/:id
const getOrder = asyncHandler(async (req, res) => {
    const order = await findMyOrder(await me(req), req.params.id);
    return ok(res, toShipperOrder(order, await storeOf(order)));
});

const step = (fn, message) =>
    asyncHandler(async (req, res) => {
        const order = await fn({ shipper: await me(req), orderId: req.params.id });
        return ok(res, toShipperOrder(order, await storeOf(order)), 200, message);
    });

// POST /shipper/orders/:id/delivered — multipart "photo" (bắt buộc)
const markDelivered = asyncHandler(async (req, res) => {
    let shipper;
    try {
        shipper = await me(req);
    } catch (error) {
        removeFile(req.file.path);
        throw error;
    }
    const order = await delivery.delivered({ shipper, orderId: req.params.id, file: req.file });
    return ok(res, toShipperOrder(order, await storeOf(order)), 200, 'Order delivered');
});

// POST /shipper/orders/:id/failed — multipart "photo" + reason
const markFailed = asyncHandler(async (req, res) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    let shipper;
    try {
        if (!reason || reason.length > 300) {
            throw new AppError(400, 'VALIDATION_ERROR', 'reason is required (max 300 characters)', [{ field: 'reason', msg: 'reason is required' }]);
        }
        shipper = await me(req);
    } catch (error) {
        removeFile(req.file.path);
        throw error;
    }
    const order = await delivery.failed({ shipper, orderId: req.params.id, file: req.file, reason });
    return ok(res, toShipperOrder(order, await storeOf(order)), 200, 'Delivery reported as failed');
});

// POST /shipper/orders/:id/withdraw { reason? } — hủy đơn đã nhận (chưa lấy hàng)
const withdrawOrder = asyncHandler(async (req, res) => {
    const result = await delivery.withdraw({ shipper: await me(req), orderId: req.params.id, reason: req.body?.reason });
    return ok(res, { blocked: result.blocked }, 200, 'Order returned for another driver');
});

// ======================= Thu nhập =======================

// GET /shipper/wallet
const getWallet = asyncHandler(async (req, res) => ok(res, await walletService.getShipperWallet(await me(req))));

// GET /shipper/wallet/entries
const listEntries = asyncHandler(async (req, res) => {
    const shipper = await me(req);
    return ok(
        res,
        await paginate(WalletEntry, { shipper: shipper._id, walletType: 'SHIPPER' }, getPagination(req), { sort: { createdAt: -1, _id: -1 } })
    );
});

// GET /shipper/wallet/payouts
const listPayouts = asyncHandler(async (req, res) => {
    const shipper = await me(req);
    return ok(res, await paginate(Payout, { shipper: shipper._id }, getPagination(req), { sort: { createdAt: -1, _id: -1 } }));
});

// POST /shipper/wallet/payouts { amount } — tài xế bị khóa vẫn rút được tiền đã kiếm (đặc tả ca, mục 6.1)
const requestPayout = asyncHandler(async (req, res) => {
    const shipper = await me(req);
    return ok(res, await walletService.requestShipperPayout({ shipper, userId: req.user.userId, amount: req.body.amount }), 201);
});

// ======================= Ảnh xác nhận giao (mọi vai trò có liên quan) =======================

/**
 * GET /delivery/orders/:id/proof — khách của đơn, chủ quán, tài xế giao đơn, admin.
 * Người khác: 404 (không lộ đơn có tồn tại).
 */
const getProof = asyncHandler(async (req, res) => {
    const { userId, role } = req.user;
    const order = await Order.findById(req.params.id).select('customer restaurant delivery');
    let allowed = false;

    if (order) {
        if (role === 'ADMIN') allowed = true;
        if (role === 'CUSTOMER') allowed = String(order.customer) === userId;
        if (role === 'SHIPPER') allowed = String(order.delivery?.shipperUser) === userId;
        if (role === 'RESTAURANT_OWNER') allowed = Boolean(await Restaurant.exists({ _id: order.restaurant, owner: userId }));
    }
    if (!allowed) {
        throw new AppError(404, 'NOT_FOUND', 'Delivery photo not found');
    }

    const filePath = delivery.proofFilePath(order);
    if (!fs.existsSync(filePath)) {
        throw new AppError(404, 'NOT_FOUND', 'Delivery photo not found');
    }
    res.set('Cache-Control', 'private, no-store');
    res.type(order.delivery.proof.mimeType || 'image/jpeg');
    return res.sendFile(filePath);
});

module.exports = {
    requiredDocuments,
    createProfile,
    getProfile,
    updateProfile,
    uploadDocument,
    submitProfile,
    updateBankAccount,
    getState,
    goOnline,
    goOffline,
    updateLocation,
    acceptOffer,
    declineOffer,
    listOrders,
    getOrder,
    markArrived: step(delivery.arrivedAtStore, 'Arrived at the restaurant'),
    markPickedUp: step(delivery.pickedUp, 'Order picked up'),
    markDelivered,
    markFailed,
    withdrawOrder,
    getWallet,
    listEntries,
    listPayouts,
    requestPayout,
    getProof,
    withProofUrl
};
