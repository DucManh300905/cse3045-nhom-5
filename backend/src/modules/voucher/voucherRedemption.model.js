const mongoose = require('mongoose');

/**
 * Một lượt dùng voucher của khách (để đếm giới hạn mỗi khách — perUserLimit).
 * slot = thứ tự lượt đang hiệu lực của khách với voucher đó (1, 2...). Unique {voucher, customer, slot}
 * khi active -> hai đơn đặt song song cùng lấy slot 1 thì một đơn bị từ chối (không vượt giới hạn).
 * Đơn bị hủy -> active = false, slot được giải phóng.
 */
const voucherRedemptionSchema = new mongoose.Schema(
    {
        voucher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Voucher',
            required: true
        },

        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: true
        },

        slot: {
            type: Number,
            required: true
        },

        discount: {
            type: Number,
            required: true
        },

        active: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

voucherRedemptionSchema.index(
    { voucher: 1, customer: 1, slot: 1 },
    { unique: true, partialFilterExpression: { active: true } }
);
voucherRedemptionSchema.index({ order: 1 });

const VoucherRedemption = mongoose.model('VoucherRedemption', voucherRedemptionSchema);

module.exports = VoucherRedemption;
