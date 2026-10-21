const fs = require('fs');
const path = require('path');

const Shipper = require('./shipper.model');
const Order = require('../order/order.model');
const dispatch = require('./dispatch.service');
const delivery = require('./delivery.service');
const orderService = require('../order/order.service');
const notifications = require('../notification/notification.service');
const penalty = require('../shift/penalty.service');
const { recordAudit } = require('../audit/audit.service');
const { toShipperResponse, withProofUrl } = require('./shipper.serializer');
const { PRIVATE_DIR } = require('../../config/storage');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { getPagination, paginate, escapeRegex } = require('../../utils/pagination');
const { fromPoint } = require('../../utils/geo');

const ok = (res, data, message) => res.status(200).json({ success: true, ...(message && { message }), data });

const documentUrl = (shipper, doc) => `/api/admin/shippers/${shipper._id}/documents/${doc.type}`;
const toAdminShipper = (shipper) => ({
    ...toShipperResponse(shipper, { documentUrl }),
    user: shipper.user?._id ? { id: shipper.user._id, email: shipper.user.email, phone: shipper.user.phone, status: shipper.user.status } : shipper.user
});

const findShipper = async (id) => {
    const shipper = await Shipper.findById(id).populate('user', 'email phone status');
    if (!shipper) {
        throw new AppError(404, 'NOT_FOUND', 'Driver not found');
    }
    return shipper;
};

// GET /admin/shippers?status=SUBMITTED|ALL|...&q=
const listShippers = asyncHandler(async (req, res) => {
    const status = req.query.status || 'SUBMITTED';
    const filter = status === 'ALL' ? {} : { status };
    if (req.query.q) {
        const regex = new RegExp(escapeRegex(req.query.q.trim()), 'i');
        filter.$or = [{ fullName: regex }, { phone: regex }, { licensePlate: regex }];
    }
    const result = await paginate(Shipper, filter, getPagination(req), {
        sort: status === 'SUBMITTED' ? { submittedAt: 1 } : { createdAt: -1 },
        populate: { path: 'user', select: 'email phone status' }
    });
    return ok(res, { ...result, items: result.items.map(toAdminShipper) });
});

// GET /admin/shippers/:id
const getShipper = asyncHandler(async (req, res) => ok(res, toAdminShipper(await findShipper(req.params.id))));

// GET /admin/shippers/:id/documents/:type — file giấy tờ private
const getDocument = asyncHandler(async (req, res) => {
    const shipper = await findShipper(req.params.id);
    const doc = shipper.documents.find((d) => d.type === req.params.type);
    const filePath = doc && path.resolve(PRIVATE_DIR, doc.fileKey);
    if (!doc || !filePath.startsWith(path.resolve(PRIVATE_DIR) + path.sep) || !fs.existsSync(filePath)) {
        throw new AppError(404, 'NOT_FOUND', 'Document not found');
    }
    res.set('Cache-Control', 'private, no-store');
    res.type(doc.mimeType);
    return res.sendFile(filePath);
});

/**
 * Đổi trạng thái hồ sơ nguyên tử (hai admin cùng thao tác -> người sau 409), ghi audit log, báo tài xế.
 * Khóa: tắt trực tuyến + thu hồi lời mời đang chờ; đơn đang giao dở vẫn giao tiếp được.
 */
const transition = (from, to, { action, kind, extraSet = {}, noteRequired = false }) =>
    asyncHandler(async (req, res) => {
        const note = req.body?.reason;
        const current = await findShipper(req.params.id);
        if (!from.includes(current.status)) {
            throw new AppError(409, 'INVALID_STATUS_TRANSITION', `Cannot change driver status from ${current.status} to ${to}`);
        }
        if (noteRequired && !note) {
            throw new AppError(400, 'VALIDATION_ERROR', 'reason is required');
        }

        const set = { status: to, ...extraSet };
        if (to === 'APPROVED' && current.status === 'SUBMITTED') Object.assign(set, { approvedAt: new Date(), approvedBy: req.user.userId, rejectReason: null });
        if (to === 'REJECTED') set.rejectReason = note;
        if (to === 'BLOCKED') set.isOnline = false;

        const updated = await Shipper.findOneAndUpdate({ _id: current._id, status: current.status }, { $set: set }, { returnDocument: 'after' }).populate(
            'user',
            'email phone status'
        );
        if (!updated) {
            throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Driver status was changed by someone else');
        }
        if (to === 'BLOCKED') {
            await dispatch.declineOpenOffers(updated._id);
        }
        // Mở lại tài khoản bị khóa vĩnh viễn do vi phạm ca -> về bậc 3, đếm lại 30 ngày
        if (current.status === 'BLOCKED' && to === 'APPROVED') {
            await penalty.onAdminUnblock({ shipper: current, actor: req.user.userId });
        }

        await recordAudit(req, {
            action,
            targetType: 'Shipper',
            targetId: updated._id,
            before: { status: current.status },
            after: { status: to },
            note
        });
        await notifications.shipperStatusChanged(updated, current.status === 'BLOCKED' ? 'UNBLOCKED' : kind, note);
        return ok(res, toAdminShipper(updated));
    });

// GET /admin/shippers/online — bản đồ tài xế đang trực tuyến
const listOnline = asyncHandler(async (req, res) => {
    const shippers = await Shipper.find({ status: 'APPROVED', isOnline: true })
        .select('fullName phone licensePlate vehicleType location locationAt activeOrder ratingAvg')
        .populate('activeOrder', 'code status delivery.status')
        .lean();
    return ok(
        res,
        shippers.map((s) => ({
            id: s._id,
            fullName: s.fullName,
            phone: s.phone,
            licensePlate: s.licensePlate,
            vehicleType: s.vehicleType,
            ratingAvg: s.ratingAvg,
            location: fromPoint(s.location),
            locationAt: s.locationAt,
            activeOrder: s.activeOrder ? { id: s.activeOrder._id, code: s.activeOrder.code, deliveryStatus: s.activeOrder.delivery?.status } : null
        }))
    );
});

// GET /admin/dispatch — đơn tài xế MAK cần theo dõi: đang tìm, không có tài xế, đang giao, giao thất bại
const listDispatch = asyncHandler(async (req, res) => {
    const orders = await Order.find({
        deliveryMode: 'PLATFORM',
        'delivery.status': { $in: ['SEARCHING', 'NO_SHIPPER', 'ASSIGNED', 'ARRIVED_AT_STORE', 'PICKED_UP', 'FAILED'] },
        status: { $nin: ['COMPLETED', 'CANCELLED', 'REJECTED'] }
    })
        .sort({ placedAt: 1 })
        .limit(100);
    return ok(
        res,
        orders.map((o) => {
            const data = withProofUrl(o.toJSON());
            return {
                id: data.id,
                code: data.code,
                status: data.status,
                placedAt: data.placedAt,
                total: data.total,
                shipperFee: data.shipperFee,
                restaurant: data.restaurantSnapshot,
                dropoff: { addressLine: data.delivery?.addressLine, location: fromPoint(o.delivery?.location) },
                delivery: {
                    status: data.delivery?.status,
                    attempts: data.delivery?.attempts,
                    searchStartedAt: data.delivery?.searchStartedAt,
                    shipper: data.delivery?.shipperSnapshot?.fullName ? data.delivery.shipperSnapshot : null,
                    shipperId: data.delivery?.shipper,
                    failReason: data.delivery?.failReason,
                    staleAlertAt: data.delivery?.staleAlertAt,
                    proof: data.delivery?.proof ?? null
                }
            };
        })
    );
});

// POST /admin/orders/:id/assign { shipperId }
const assignOrder = asyncHandler(async (req, res) => {
    const order = await dispatch.assignByAdmin({ orderId: req.params.id, shipperId: req.body.shipperId, actor: req.user.userId });
    await recordAudit(req, {
        action: 'DELIVERY_ASSIGN',
        targetType: 'Order',
        targetId: order._id,
        after: { shipper: req.body.shipperId }
    });
    return ok(res, withProofUrl(order.toJSON()), 'Driver assigned');
});

// POST /admin/orders/:id/redispatch — tìm lại tài xế cho đơn NO_SHIPPER
const redispatchOrder = asyncHandler(async (req, res) => {
    const order = await orderService.redispatch({ orderId: req.params.id });
    return ok(res, withProofUrl(order.toJSON()), 'Searching for a driver');
});

// POST /admin/orders/:id/delivery/resolve { action: COMPLETE | CANCEL, note? }
const resolveDelivery = asyncHandler(async (req, res) => {
    const order = await delivery.resolveFailedDelivery({
        orderId: req.params.id,
        action: req.body.action,
        note: req.body.note,
        actor: req.user.userId
    });
    await recordAudit(req, {
        action: req.body.action === 'CANCEL' ? 'DELIVERY_FAILED_CANCEL' : 'DELIVERY_FAILED_COMPLETE',
        targetType: 'Order',
        targetId: order._id,
        after: { status: order.status },
        note: req.body.note
    });
    return ok(res, withProofUrl(order.toJSON()));
});

module.exports = {
    listShippers,
    getShipper,
    getDocument,
    approveShipper: transition(['SUBMITTED'], 'APPROVED', { action: 'SHIPPER_APPROVE', kind: 'APPROVED' }),
    rejectShipper: transition(['SUBMITTED'], 'REJECTED', { action: 'SHIPPER_REJECT', kind: 'REJECTED', noteRequired: true }),
    blockShipper: transition(['APPROVED'], 'BLOCKED', { action: 'SHIPPER_BLOCK', kind: 'BLOCKED' }),
    unblockShipper: transition(['BLOCKED'], 'APPROVED', { action: 'SHIPPER_UNBLOCK', kind: 'UNBLOCKED' }),
    listOnline,
    listDispatch,
    assignOrder,
    redispatchOrder,
    resolveDelivery
};
