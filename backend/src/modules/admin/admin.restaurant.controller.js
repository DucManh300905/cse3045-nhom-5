const fs = require('fs');
const path = require('path');

const Restaurant = require('../restaurant/restaurant.model');
const { toRestaurantResponse } = require('../restaurant/restaurant.serializer');
const { recordAudit } = require('../audit/audit.service');
const { emitRestaurantStatusChanged } = require('../../realtime/socket');
const notifications = require('../notification/notification.service');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { getPagination, paginate, escapeRegex } = require('../../utils/pagination');
const { PRIVATE_DIR } = require('../../config/storage');

const OWNER_FIELDS = 'fullName email phone status';

const documentUrl = (restaurant, doc) =>
    `/api/admin/restaurants/${restaurant._id}/documents/${doc.type}`;

const toAdminResponse = (restaurant) => toRestaurantResponse(restaurant, { documentUrl });

const findRestaurant = async (id) => {
    const restaurant = await Restaurant.findById(id).populate('owner', OWNER_FIELDS);

    if (!restaurant) {
        throw new AppError(404, 'NOT_FOUND', 'Restaurant not found');
    }

    return restaurant;
};

// Chuyển trạng thái nguyên tử: chỉ cập nhật nếu status hiện tại nằm trong `from`.
// Hai admin thao tác cùng lúc -> người sau nhận 409.
const transition = async (req, { from, to, set = {}, unset, action, note }) => {
    const current = await findRestaurant(req.params.id);

    if (!from.includes(current.status)) {
        throw new AppError(
            409,
            'INVALID_STATUS_TRANSITION',
            `Cannot change restaurant status from ${current.status} to ${to}`
        );
    }

    const updated = await Restaurant.findOneAndUpdate(
        { _id: current._id, status: current.status },
        { $set: { status: to, ...set }, ...(unset && { $unset: unset }) },
        { returnDocument: 'after', runValidators: true }
    ).populate('owner', OWNER_FIELDS);

    if (!updated) {
        throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Restaurant status was changed by someone else');
    }

    await recordAudit(req, {
        action,
        targetType: 'Restaurant',
        targetId: updated._id,
        before: { status: current.status },
        after: { status: to },
        note
    });

    // Báo chủ quán ngay + lưu thông báo (BLOCKED -> APPROVED là "mở khóa")
    emitRestaurantStatusChanged(updated);
    await notifications.restaurantStatusChanged(updated, current.status === 'BLOCKED' ? 'UNBLOCKED' : to, note);

    return updated;
};

// GET /admin/restaurants?status=SUBMITTED|ALL|...&q=&page=&limit=
const listRestaurants = asyncHandler(async (req, res) => {
    const status = req.query.status || 'SUBMITTED';
    const filter = status === 'ALL' ? {} : { status };

    if (req.query.q) {
        const regex = new RegExp(escapeRegex(req.query.q), 'i');
        filter.$or = [{ name: regex }, { slug: regex }, { phone: regex }, { address: regex }];
    }

    // Hồ sơ chờ duyệt: nộp trước xem trước
    const sort = status === 'SUBMITTED' ? { submittedAt: 1 } : { createdAt: -1 };

    const result = await paginate(Restaurant, filter, getPagination(req), {
        sort,
        populate: { path: 'owner', select: OWNER_FIELDS }
    });

    return res.status(200).json({
        success: true,
        data: { ...result, items: result.items.map(toAdminResponse) }
    });
});

// GET /admin/restaurants/:id
const getRestaurant = asyncHandler(async (req, res) => {
    const restaurant = await findRestaurant(req.params.id);

    return res.status(200).json({
        success: true,
        data: toAdminResponse(restaurant)
    });
});

// GET /admin/restaurants/:id/documents/:type — trả file giấy tờ private
const getDocument = asyncHandler(async (req, res) => {
    const restaurant = await findRestaurant(req.params.id);
    const doc = restaurant.documents.find((d) => d.type === req.params.type);

    if (!doc) {
        throw new AppError(404, 'NOT_FOUND', 'Document not found');
    }

    const filePath = path.resolve(PRIVATE_DIR, doc.fileKey);

    // fileKey do server sinh, vẫn chặn trường hợp thoát ra ngoài thư mục private
    if (!filePath.startsWith(path.resolve(PRIVATE_DIR) + path.sep) || !fs.existsSync(filePath)) {
        throw new AppError(404, 'NOT_FOUND', 'Document file not found');
    }

    res.set('Cache-Control', 'private, no-store');
    res.type(doc.mimeType);
    return res.sendFile(filePath);
});

// POST /admin/restaurants/:id/approve — SUBMITTED -> APPROVED (BR-11)
const approveRestaurant = asyncHandler(async (req, res) => {
    const restaurant = await transition(req, {
        from: ['SUBMITTED'],
        to: 'APPROVED',
        set: { approvedAt: new Date(), approvedBy: req.user.userId },
        unset: { rejectReason: 1 },
        action: 'RESTAURANT_APPROVE'
    });

    return res.status(200).json({
        success: true,
        message: 'Restaurant approved',
        data: toAdminResponse(restaurant)
    });
});

// POST /admin/restaurants/:id/reject { reason } — SUBMITTED -> REJECTED (BR-11)
const rejectRestaurant = asyncHandler(async (req, res) => {
    const { reason } = req.body;

    const restaurant = await transition(req, {
        from: ['SUBMITTED'],
        to: 'REJECTED',
        set: { rejectReason: reason },
        action: 'RESTAURANT_REJECT',
        note: reason
    });

    return res.status(200).json({
        success: true,
        message: 'Restaurant rejected',
        data: toAdminResponse(restaurant)
    });
});

// POST /admin/restaurants/:id/block { reason? } — APPROVED -> BLOCKED, tắt nhận đơn
// req.body?: Express 5 để req.body = undefined khi request không có body
const blockRestaurant = asyncHandler(async (req, res) => {
    const restaurant = await transition(req, {
        from: ['APPROVED'],
        to: 'BLOCKED',
        set: { isAcceptingOrders: false },
        action: 'RESTAURANT_BLOCK',
        note: req.body?.reason
    });

    return res.status(200).json({
        success: true,
        message: 'Restaurant blocked',
        data: toAdminResponse(restaurant)
    });
});

// POST /admin/restaurants/:id/unblock — BLOCKED -> APPROVED (quán tự bật lại nhận đơn)
const unblockRestaurant = asyncHandler(async (req, res) => {
    const restaurant = await transition(req, {
        from: ['BLOCKED'],
        to: 'APPROVED',
        action: 'RESTAURANT_UNBLOCK',
        note: req.body?.reason
    });

    return res.status(200).json({
        success: true,
        message: 'Restaurant unblocked',
        data: toAdminResponse(restaurant)
    });
});

// PATCH /admin/restaurants/:id/commission { commissionRate } (BR-51)
const updateCommission = asyncHandler(async (req, res) => {
    const restaurant = await findRestaurant(req.params.id);
    const before = restaurant.commissionRate;

    restaurant.commissionRate = req.body.commissionRate;
    await restaurant.save();

    await recordAudit(req, {
        action: 'RESTAURANT_COMMISSION_CHANGE',
        targetType: 'Restaurant',
        targetId: restaurant._id,
        before: { commissionRate: before },
        after: { commissionRate: restaurant.commissionRate }
    });

    return res.status(200).json({
        success: true,
        message: 'Commission rate updated',
        data: toAdminResponse(restaurant)
    });
});

module.exports = {
    listRestaurants,
    getRestaurant,
    getDocument,
    approveRestaurant,
    rejectRestaurant,
    blockRestaurant,
    unblockRestaurant,
    updateCommission
};
