const mongoose = require('mongoose');

/**
 * Voucher (docs/database.md mục 3.7) — 2 loại (quyết định 19/10/2026):
 *   PLATFORM   : admin tạo, nền tảng chịu tiền giảm; áp cho mọi quán hoặc danh sách quán
 *   RESTAURANT : chủ quán tạo cho riêng quán mình, quán chịu tiền giảm
 * Mỗi đơn tối đa 1 voucher mỗi loại. Mã duy nhất toàn hệ thống (viết hoa).
 */
const VOUCHER_TYPES = ['PERCENT', 'FIXED'];
const FUNDED_BY = ['PLATFORM', 'RESTAURANT'];
// Cùng giá trị với orders.paymentMethod
const VOUCHER_PAYMENT_METHODS = ['COD', 'BANK_TRANSFER'];

const int = (extra = {}) => ({
    type: Number,
    validate: { validator: (v) => v === null || v === undefined || Number.isInteger(v), message: '{PATH} must be an integer' },
    ...extra
});

const voucherSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },

        description: {
            type: String,
            trim: true
        },

        fundedBy: {
            type: String,
            enum: FUNDED_BY,
            required: true
        },

        // RESTAURANT: quán sở hữu (bắt buộc)
        restaurant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Restaurant'
        },

        // PLATFORM: rỗng = mọi quán; có giá trị = chỉ các quán này
        restaurants: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' }],
            default: []
        },

        type: {
            type: String,
            enum: VOUCHER_TYPES,
            required: true
        },

        // PERCENT: 1–100 (%) · FIXED: số tiền VND
        value: int({ required: true, min: 1 }),

        // Bắt buộc với PERCENT (BR-41)
        maxDiscount: int({ default: null }),

        // So với tạm tính (trước giảm giá)
        minOrderAmount: int({ default: 0, min: 0 }),

        // Chỉ áp dụng khi khách chọn các phương thức này (mặc định cả hai)
        paymentMethods: {
            type: [{ type: String, enum: VOUCHER_PAYMENT_METHODS }],
            default: () => [...VOUCHER_PAYMENT_METHODS],
            validate: { validator: (list) => list.length > 0, message: 'paymentMethods must not be empty' }
        },

        // null = không giới hạn
        usageLimit: int({ default: null }),

        // Tăng / giảm nguyên tử khi đặt / hủy đơn (BR-42, BR-43)
        usedCount: int({ default: 0, min: 0 }),

        perUserLimit: int({ default: 1, min: 1 }),

        startAt: {
            type: Date,
            required: true
        },

        endAt: {
            type: Date,
            required: true
        },

        isActive: {
            type: Boolean,
            default: true
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    {
        timestamps: true
    }
);

voucherSchema.index({ fundedBy: 1, isActive: 1, endAt: 1 });
voucherSchema.index({ restaurant: 1, createdAt: -1 });

const Voucher = mongoose.model('Voucher', voucherSchema);

module.exports = Voucher;
module.exports.VOUCHER_TYPES = VOUCHER_TYPES;
module.exports.FUNDED_BY = FUNDED_BY;
module.exports.VOUCHER_PAYMENT_METHODS = VOUCHER_PAYMENT_METHODS;
