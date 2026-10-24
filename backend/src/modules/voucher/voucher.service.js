const mongoose = require('mongoose');

const Voucher = require('./voucher.model');
const { VOUCHER_PAYMENT_METHODS } = require('./voucher.model');
const VoucherRedemption = require('./voucherRedemption.model');
const AppError = require('../../utils/AppError');

/**
 * Áp voucher vào đơn (BR-40..45, docs/API.md mục 2.6 bước 5).
 * - Mỗi đơn tối đa 1 voucher quán (RESTAURANT) + 1 voucher MAK (PLATFORM).
 * - Voucher quán trừ trước trên tạm tính, voucher MAK trừ tiếp trên phần còn lại; tổng giảm <= tạm tính.
 * - Đơn tối thiểu so với tạm tính (trước giảm giá).
 */

const MAX_VOUCHERS = 2;

const normalizeCodes = (codes = []) => [...new Set(codes.map((c) => String(c).trim().toUpperCase()).filter(Boolean))];

const invalid = (code, reason, message, extra = {}) =>
    new AppError(422, 'VOUCHER_INVALID', message, [{ field: 'voucherCodes', code, reason, msg: message, ...extra }]);

/** Số tiền giảm của 1 voucher trên `base` (số nguyên VND, không vượt base) */
const discountOf = (voucher, base) => {
    const raw = voucher.type === 'PERCENT' ? Math.floor((base * voucher.value) / 100) : voucher.value;
    const capped = voucher.type === 'PERCENT' && voucher.maxDiscount ? Math.min(raw, voucher.maxDiscount) : raw;
    return Math.max(0, Math.min(capped, base));
};

const appliesTo = (voucher, restaurantId) =>
    voucher.fundedBy === 'RESTAURANT'
        ? String(voucher.restaurant) === String(restaurantId)
        : voucher.restaurants.length === 0 || voucher.restaurants.some((r) => String(r) === String(restaurantId));

const activeUses = (voucherId, customerId, session = null) =>
    VoucherRedemption.countDocuments({ voucher: voucherId, customer: customerId, active: true }).session(session);

// Voucher tạo trước khi có trường này -> coi như áp dụng mọi phương thức
const methodsOf = (voucher) => (voucher.paymentMethods?.length ? voucher.paymentMethods : VOUCHER_PAYMENT_METHODS);

const isExhausted = (voucher) => voucher.usageLimit !== null && voucher.usedCount >= voucher.usageLimit;

/** Kiểm tra 1 voucher dùng được cho đơn này; lỗi -> AppError có `reason` để FE báo đúng lý do */
const assertUsable = async (voucher, { restaurantId, subtotal, customerId, paymentMethod, now, session }) => {
    const { code } = voucher;

    if (!voucher.isActive) throw invalid(code, 'INACTIVE', `Voucher ${code} is disabled`);
    if (now < voucher.startAt) throw invalid(code, 'NOT_STARTED', `Voucher ${code} is not active yet`);
    if (now > voucher.endAt) throw invalid(code, 'EXPIRED', `Voucher ${code} has expired`);
    if (!appliesTo(voucher, restaurantId)) throw invalid(code, 'WRONG_RESTAURANT', `Voucher ${code} cannot be used at this restaurant`);
    if (paymentMethod && !methodsOf(voucher).includes(paymentMethod)) {
        throw invalid(code, 'WRONG_PAYMENT_METHOD', `Voucher ${code} cannot be used with ${paymentMethod}`, {
            paymentMethods: methodsOf(voucher)
        });
    }
    if (subtotal < voucher.minOrderAmount) {
        throw invalid(code, 'BELOW_MIN_ORDER', `Voucher ${code} requires a minimum order of ${voucher.minOrderAmount}`, {
            minOrderAmount: voucher.minOrderAmount
        });
    }
    if (isExhausted(voucher)) {
        throw new AppError(422, 'VOUCHER_EXHAUSTED', `Voucher ${code} has no uses left`, [{ field: 'voucherCodes', code }]);
    }
    if (customerId && (await activeUses(voucher._id, customerId, session)) >= voucher.perUserLimit) {
        throw new AppError(422, 'VOUCHER_USER_LIMIT', `You have already used voucher ${code}`, [{ field: 'voucherCodes', code }]);
    }
};

/**
 * Tính giảm giá cho các mã khách nhập (xem trước + đặt đơn).
 * @returns { vouchers: snapshot cho đơn, restaurantDiscount, platformDiscount, discount }
 */
const applyVouchers = async ({ codes, restaurantId, subtotal, customerId, paymentMethod, session = null, now = new Date() }) => {
    const list = normalizeCodes(codes);
    const empty = { vouchers: [], restaurantDiscount: 0, platformDiscount: 0, discount: 0 };

    if (list.length === 0) {
        return empty;
    }
    if (list.length > MAX_VOUCHERS) {
        throw new AppError(422, 'VOUCHER_STACK_LIMIT', 'At most 1 restaurant voucher and 1 MAK voucher per order');
    }

    const found = await Voucher.find({ code: { $in: list } }).session(session);
    const byCode = new Map(found.map((v) => [v.code, v]));

    const missing = list.find((c) => !byCode.has(c));
    if (missing) {
        throw invalid(missing, 'NOT_FOUND', `Voucher ${missing} does not exist`);
    }

    const restaurantVoucher = found.filter((v) => v.fundedBy === 'RESTAURANT');
    const platformVoucher = found.filter((v) => v.fundedBy === 'PLATFORM');
    if (restaurantVoucher.length > 1 || platformVoucher.length > 1) {
        throw new AppError(422, 'VOUCHER_STACK_LIMIT', 'At most 1 restaurant voucher and 1 MAK voucher per order');
    }

    for (const voucher of found) {
        await assertUsable(voucher, { restaurantId, subtotal, customerId, paymentMethod, now, session });
    }

    // Quán trừ trước, MAK trừ tiếp trên phần còn lại
    const rv = restaurantVoucher[0];
    const pv = platformVoucher[0];
    const restaurantDiscount = rv ? discountOf(rv, subtotal) : 0;
    const platformDiscount = pv ? discountOf(pv, subtotal - restaurantDiscount) : 0;

    const snapshot = (v, discount) => ({
        voucher: v._id,
        code: v.code,
        fundedBy: v.fundedBy,
        type: v.type,
        value: v.value,
        discount
    });

    return {
        vouchers: [...(rv ? [snapshot(rv, restaurantDiscount)] : []), ...(pv ? [snapshot(pv, platformDiscount)] : [])],
        restaurantDiscount,
        platformDiscount,
        discount: restaurantDiscount + platformDiscount
    };
};

/**
 * Giữ lượt dùng khi đặt đơn (trong transaction đặt đơn, sau khi đã tạo đơn).
 * Tăng usedCount nguyên tử (BR-42); ghi lượt của khách (slot unique -> chặn vượt giới hạn khi đặt song song).
 */
const redeemVouchers = async ({ order, session }) => {
    for (const snap of order.vouchers ?? []) {
        const result = await Voucher.updateOne(
            {
                _id: snap.voucher,
                isActive: true,
                $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }]
            },
            { $inc: { usedCount: 1 } },
            { session }
        );
        if (result.modifiedCount === 0) {
            throw new AppError(422, 'VOUCHER_EXHAUSTED', `Voucher ${snap.code} has no uses left`, [{ field: 'voucherCodes', code: snap.code }]);
        }

        const voucher = await Voucher.findById(snap.voucher).select('perUserLimit').session(session);
        const used = await activeUses(snap.voucher, order.customer, session);
        if (used >= voucher.perUserLimit) {
            throw new AppError(422, 'VOUCHER_USER_LIMIT', `You have already used voucher ${snap.code}`, [{ field: 'voucherCodes', code: snap.code }]);
        }

        await VoucherRedemption.create(
            [{ voucher: snap.voucher, customer: order.customer, order: order._id, slot: used + 1, discount: snap.discount }],
            { session }
        );
    }
};

/** Đơn bị hủy / từ chối -> trả lượt dùng (BR-43, gọi trong transaction đổi trạng thái) */
const releaseVouchers = async (order, session) => {
    if (!order.vouchers?.length) {
        return;
    }
    for (const snap of order.vouchers) {
        await Voucher.updateOne({ _id: snap.voucher, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
    }
    await VoucherRedemption.updateMany({ order: order._id, active: true }, { $set: { active: false } }, { session });
};

// Hai đơn song song cùng giành lượt cuối của 1 khách -> trùng slot
const isRedemptionConflict = (error) => error?.code === 11000 && error.keyPattern?.slot;

// Thông tin voucher cho khách (không lộ người tạo, số lượt đã dùng chi tiết)
const toPublicVoucher = (v) => ({
    id: v._id,
    code: v.code,
    description: v.description,
    fundedBy: v.fundedBy,
    type: v.type,
    value: v.value,
    maxDiscount: v.maxDiscount,
    minOrderAmount: v.minOrderAmount,
    paymentMethods: methodsOf(v),
    startAt: v.startAt,
    endAt: v.endAt,
    remaining: v.usageLimit === null ? null : Math.max(0, v.usageLimit - v.usedCount)
});

/** Voucher khách còn dùng được ở quán này (đang hiệu lực, còn lượt, khách chưa dùng hết lượt của mình) */
const listAvailable = async ({ restaurantId, customerId, now = new Date() }) => {
    const vouchers = await Voucher.find({
        isActive: true,
        startAt: { $lte: now },
        endAt: { $gte: now },
        $or: [
            { fundedBy: 'RESTAURANT', restaurant: restaurantId },
            { fundedBy: 'PLATFORM', restaurants: { $size: 0 } },
            { fundedBy: 'PLATFORM', restaurants: restaurantId }
        ]
    }).sort({ fundedBy: -1, endAt: 1 });

    const usable = vouchers.filter((v) => !isExhausted(v));
    const uses = await VoucherRedemption.aggregate([
        // aggregate không tự ép kiểu như find -> chuyển sang ObjectId
        { $match: { customer: new mongoose.Types.ObjectId(String(customerId)), active: true, voucher: { $in: usable.map((v) => v._id) } } },
        { $group: { _id: '$voucher', count: { $sum: 1 } } }
    ]);
    const usedBy = new Map(uses.map((u) => [String(u._id), u.count]));

    return usable.filter((v) => (usedBy.get(String(v._id)) ?? 0) < v.perUserLimit).map(toPublicVoucher);
};

module.exports = {
    MAX_VOUCHERS,
    normalizeCodes,
    discountOf,
    applyVouchers,
    redeemVouchers,
    releaseVouchers,
    isRedemptionConflict,
    listAvailable,
    toPublicVoucher
};
