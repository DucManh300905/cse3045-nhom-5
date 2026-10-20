const mongoose = require('mongoose');

const Voucher = require('./voucher.model');
const VoucherRedemption = require('./voucherRedemption.model');
const voucherService = require('./voucher.service');
const { recordAudit } = require('../audit/audit.service');
const { displayName } = require('../review/review.service');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { getPagination, paginate, escapeRegex } = require('../../utils/pagination');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

// ======================= Khách =======================

// GET /vouchers/available?restaurantId= — voucher khách còn dùng được ở quán
const listAvailable = asyncHandler(async (req, res) =>
    ok(res, await voucherService.listAvailable({ restaurantId: req.query.restaurantId, customerId: req.user.userId }))
);

// ======================= Quản lý (chủ quán + admin) =======================

// Trường được sửa khi voucher đã có người dùng (BR-45): không đổi mã / mức giảm / điều kiện đã cam kết với khách
const EDITABLE_AFTER_USE = ['description', 'endAt', 'usageLimit', 'perUserLimit', 'isActive', 'restaurants'];
const FIELDS = ['code', 'description', 'type', 'value', 'maxDiscount', 'minOrderAmount', 'paymentMethods', 'usageLimit', 'perUserLimit', 'startAt', 'endAt', 'isActive'];

const pick = (body, keys) => Object.fromEntries(keys.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));

/**
 * Kiểm tra liên trường sau khi gộp dữ liệu cũ + mới:
 * PERCENT 1–100 và bắt buộc maxDiscount; endAt sau startAt; usageLimit không nhỏ hơn số lượt đã dùng.
 */
const assertConsistent = (v) => {
    const fail = (field, msg) => {
        throw new AppError(400, 'VALIDATION_ERROR', msg, [{ field, msg }]);
    };
    if (v.type === 'PERCENT' && (v.value < 1 || v.value > 100)) fail('value', 'Percent value must be between 1 and 100');
    if (v.type === 'PERCENT' && !v.maxDiscount) fail('maxDiscount', 'maxDiscount is required for percent vouchers');
    if (v.type === 'FIXED') v.maxDiscount = null;
    if (new Date(v.endAt) <= new Date(v.startAt)) fail('endAt', 'endAt must be after startAt');
    if (v.usageLimit !== null && v.usageLimit !== undefined && v.usageLimit < (v.usedCount ?? 0)) {
        fail('usageLimit', 'usageLimit cannot be lower than the number of uses');
    }
};

const toManagedVoucher = (v) => ({
    ...v.toJSON(),
    status: !v.isActive ? 'INACTIVE' : new Date() > v.endAt ? 'EXPIRED' : new Date() < v.startAt ? 'SCHEDULED' : 'ACTIVE'
});

/**
 * Bộ controller quản lý dùng chung:
 * - merchant: chỉ voucher RESTAURANT của quán mình
 * - admin:    tạo voucher PLATFORM; xem / tắt được mọi voucher (kể cả của quán)
 */
const manager = ({ isAdmin }) => {
    const scope = (req) => (isAdmin ? {} : { fundedBy: 'RESTAURANT', restaurant: req.restaurant._id });

    const findOwned = async (req) => {
        const voucher = await Voucher.findOne({ _id: req.params.id, ...scope(req) });
        if (!voucher) {
            throw new AppError(404, 'NOT_FOUND', 'Voucher not found');
        }
        return voucher;
    };

    const audit = (req, action, voucher, extra = {}) =>
        recordAudit(req, { action, targetType: 'Voucher', targetId: voucher._id, ...extra });

    // GET — ?status=ACTIVE|INACTIVE|EXPIRED&fundedBy=&q=<mã>
    const list = asyncHandler(async (req, res) => {
        const filter = { ...scope(req) };
        const now = new Date();
        const { status, fundedBy, q } = req.query;

        if (isAdmin && fundedBy) filter.fundedBy = fundedBy;
        if (q) filter.code = new RegExp(escapeRegex(q.trim().toUpperCase()));
        if (status === 'ACTIVE') Object.assign(filter, { isActive: true, endAt: { $gte: now } });
        if (status === 'INACTIVE') filter.isActive = false;
        if (status === 'EXPIRED') filter.endAt = { $lt: now };

        const result = await paginate(Voucher, filter, getPagination(req), {
            sort: { createdAt: -1, _id: -1 },
            populate: [
                { path: 'restaurant', select: 'name slug' },
                { path: 'restaurants', select: 'name slug' }
            ]
        });
        return ok(res, { ...result, items: result.items.map(toManagedVoucher) });
    });

    // POST
    const create = asyncHandler(async (req, res) => {
        const data = {
            ...pick(req.body, FIELDS),
            fundedBy: isAdmin ? 'PLATFORM' : 'RESTAURANT',
            restaurant: isAdmin ? undefined : req.restaurant._id,
            restaurants: isAdmin ? req.body.restaurants ?? [] : [],
            createdBy: req.user.userId
        };
        assertConsistent(data);

        const voucher = await Voucher.create(data);
        await audit(req, 'VOUCHER_CREATE', voucher, { after: { code: voucher.code, type: voucher.type, value: voucher.value } });
        return ok(res, toManagedVoucher(voucher), 201);
    });

    // PATCH /:id
    const update = asyncHandler(async (req, res) => {
        const voucher = await findOwned(req);
        const changes = pick(req.body, isAdmin ? [...FIELDS, 'restaurants'] : FIELDS);

        if (!isAdmin && changes.restaurants) delete changes.restaurants;
        if (voucher.fundedBy === 'RESTAURANT') delete changes.restaurants;

        if (voucher.usedCount > 0) {
            const locked = Object.keys(changes).filter((k) => !EDITABLE_AFTER_USE.includes(k));
            if (locked.length) {
                throw new AppError(409, 'VOUCHER_IN_USE', `Voucher has been used; cannot change ${locked.join(', ')}`);
            }
        }

        const before = pick(voucher.toObject(), Object.keys(changes));
        Object.assign(voucher, changes);
        assertConsistent(voucher);
        await voucher.save();

        await audit(req, 'VOUCHER_UPDATE', voucher, { before, after: changes });
        return ok(res, toManagedVoucher(voucher));
    });

    // DELETE /:id — chỉ khi chưa từng được dùng (đã dùng thì tắt, BR-45)
    const remove = asyncHandler(async (req, res) => {
        const voucher = await findOwned(req);
        if (voucher.usedCount > 0 || (await VoucherRedemption.exists({ voucher: voucher._id }))) {
            throw new AppError(409, 'VOUCHER_IN_USE', 'Voucher has been used; disable it instead of deleting');
        }
        await voucher.deleteOne();
        await audit(req, 'VOUCHER_DELETE', voucher, { before: { code: voucher.code } });
        return ok(res, { id: voucher._id });
    });

    // GET /:id/usage — các đơn đã dùng voucher + tổng tiền đã giảm
    const usage = asyncHandler(async (req, res) => {
        const voucher = await findOwned(req);
        const result = await paginate(VoucherRedemption, { voucher: voucher._id }, getPagination(req), {
            sort: { createdAt: -1, _id: -1 },
            populate: [
                { path: 'order', select: 'code status total placedAt createdAt restaurantSnapshot.name' },
                { path: 'customer', select: 'fullName' }
            ]
        });
        const [sum] = await VoucherRedemption.aggregate([
            { $match: { voucher: new mongoose.Types.ObjectId(String(voucher._id)), active: true } },
            { $group: { _id: null, uses: { $sum: 1 }, totalDiscount: { $sum: '$discount' } } }
        ]);

        return ok(res, {
            ...result,
            items: result.items.map((r) => ({
                id: r._id,
                order: r.order,
                customer: displayName(r.customer?.fullName),
                discount: r.discount,
                active: r.active,
                createdAt: r.createdAt
            })),
            summary: { uses: sum?.uses ?? 0, totalDiscount: sum?.totalDiscount ?? 0 }
        });
    });

    return { list, create, update, remove, usage };
};

module.exports = {
    listAvailable,
    merchant: manager({ isAdmin: false }),
    admin: manager({ isAdmin: true })
};
